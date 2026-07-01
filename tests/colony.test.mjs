import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getInitialState } from '../js/state.js';
import {
  digChamber, reassignCaste, isAdjacentToOwnedChamber, canAffordChamber, availableForagers,
} from '../js/colony.js';
import { findDiggableTile, findDiscoveredResourceNode, findWaterTile, getInitialStateWithVisibleNode } from './helpers.mjs';

test('digChamber succeeds adjacent to an owned chamber and is affordable', () => {
  const state = getInitialState(10);
  const key = findDiggableTile(state, 'player');
  assert.ok(key, 'expected at least one diggable tile near the starting nest');
  const result = digChamber(state, 'player', key, 'storage');
  assert.equal(result.ok, true);
  assert.equal(state.map.tiles[key].chamber.type, 'storage');
  assert.equal(state.colonies.player.chambers.includes(key), true);
  assert.equal(state.colonies.player.lifetimeStats.chambersBuilt, 1);
});

test('digChamber rejects a tile that already has a chamber', () => {
  const state = getInitialState(11);
  const result = digChamber(state, 'player', state.colonies.player.nestTile, 'storage');
  assert.equal(result.ok, false);
});

test('digChamber rejects water tiles', () => {
  const state = getInitialState(12);
  const waterKey = findWaterTile(state);
  if (waterKey) {
    const result = digChamber(state, 'player', waterKey, 'storage');
    assert.equal(result.ok, false);
    assert.match(result.reason, /water/i);
  }
});

test('digChamber rejects resource-node tiles (regression: was allowed pre-review)', () => {
  const state = getInitialStateWithVisibleNode(13);
  const nodeKey = findDiscoveredResourceNode(state, 'player');
  assert.ok(nodeKey);
  const result = digChamber(state, 'player', nodeKey, 'storage');
  assert.equal(result.ok, false);
  assert.match(result.reason, /resource node/i);
});

test('digChamber rejects tiles not adjacent to an owned chamber', () => {
  const state = getInitialState(14);
  // find a discovered, empty, non-water, non-adjacent tile
  const farKey = Object.keys(state.map.tiles).find((key) => {
    const tile = state.map.tiles[key];
    return tile.discoveredBy.player && !tile.chamber && !tile.resourceNode
      && tile.terrain !== 'water' && !isAdjacentToOwnedChamber(state, 'player', key);
  });
  if (farKey) {
    const result = digChamber(state, 'player', farKey, 'storage');
    assert.equal(result.ok, false);
    assert.match(result.reason, /adjacent/i);
  }
});

test('digChamber rejects when the colony cannot afford the cost', () => {
  const state = getInitialState(15);
  state.colonies.player.resources.mineral = 0;
  const key = findDiggableTile(state, 'player');
  const result = digChamber(state, 'player', key, 'storage');
  assert.equal(result.ok, false);
  assert.equal(canAffordChamber(state.colonies.player, 'storage'), false);
});

test('digChamber applies storage/population-cap bonuses correctly', () => {
  const state = getInitialState(16);
  const player = state.colonies.player;
  const baseSugarCap = player.storageCap.sugar;
  const baseCap = player.populationCap;

  const key1 = findDiggableTile(state, 'player');
  digChamber(state, 'player', key1, 'storage');
  assert.equal(player.storageCap.sugar, baseSugarCap + 100);

  const key2 = findDiggableTile(state, 'player');
  digChamber(state, 'player', key2, 'nursery');
  assert.equal(player.populationCap, baseCap + 6);
});

test('reassignCaste moves ants between castes and fails on insufficient count', () => {
  const state = getInitialState(17);
  const player = state.colonies.player;
  const before = player.population.worker;

  const ok = reassignCaste(state, 'player', 'worker', 'soldier', 2);
  assert.equal(ok.ok, true);
  assert.equal(player.population.worker, before - 2);
  assert.equal(player.population.soldier, 2);

  const fail = reassignCaste(state, 'player', 'soldier', 'worker', 100);
  assert.equal(fail.ok, false);
});

test('reassignCaste rejects invalid caste names', () => {
  const state = getInitialState(18);
  const result = reassignCaste(state, 'player', 'worker', 'queen', 1);
  assert.equal(result.ok, false);
});

test('availableForagers accounts for foragers already committed to trails', () => {
  const state = getInitialState(19);
  const player = state.colonies.player;
  const before = availableForagers(state, 'player');
  player.trails.push({ id: 't1', capacity: 2, garrison: 0, path: [], inTransit: [] });
  assert.equal(availableForagers(state, 'player'), Math.max(0, before - 2));
});
