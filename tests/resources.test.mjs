import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getInitialState } from '../js/state.js';
import { resolveProduction } from '../js/resources.js';
import { digChamber, reassignCaste } from '../js/colony.js';
import { assignGarrison } from '../js/trails.js';
import { findDiggableTile, findDiscoveredResourceNode, getInitialStateWithVisibleNode } from './helpers.mjs';
import { layTrail } from '../js/trails.js';

test('a farm converts sugar into fungus each cycle', () => {
  const state = getInitialState(40);
  const player = state.colonies.player;
  player.resources.sugar = 100;
  player.resources.fungus = 0;

  const key = findDiggableTile(state, 'player');
  digChamber(state, 'player', key, 'farm');

  const sugarBefore = player.resources.sugar;
  resolveProduction(state, 'player');
  assert.ok(player.resources.fungus > 0);
  assert.ok(player.resources.sugar < sugarBefore);
});

test('population grows by consuming protein when under the cap', () => {
  const state = getInitialState(41);
  const player = state.colonies.player;
  player.resources.protein = 100;
  const before = player.population.worker;
  resolveProduction(state, 'player');
  assert.equal(player.population.worker, before + 1);
});

test('population does not grow past its cap', () => {
  const state = getInitialState(42);
  const player = state.colonies.player;
  player.resources.protein = 1000;
  player.populationCap = 0;
  const totalBefore = player.population.worker + player.population.forager
    + player.population.soldier + player.population.scout;
  resolveProduction(state, 'player');
  const totalAfter = player.population.worker + player.population.forager
    + player.population.soldier + player.population.scout;
  assert.equal(totalAfter, totalBefore);
});

test('regression: workers starve first when sugar is insufficient, then foragers once workers are exhausted', () => {
  const state = getInitialState(43);
  const player = state.colonies.player;
  player.resources.sugar = 0;
  player.resources.protein = 0;
  // A large forager count guarantees the shortfall comfortably exceeds what
  // the single worker alone can absorb, regardless of the current upkeep rate.
  player.population = { worker: 1, forager: 50, soldier: 0, scout: 0 };

  resolveProduction(state, 'player');
  assert.equal(player.population.worker, 0, 'the lone worker should starve first');
  assert.ok(player.population.forager < 50, 'shortfall should extend to foragers once workers are gone');
});

test('a colony with only foragers is no longer immune to starvation (pre-fix regression)', () => {
  const state = getInitialState(44);
  const player = state.colonies.player;
  player.resources.sugar = 0;
  player.resources.protein = 0;
  player.population = { worker: 0, forager: 20, soldier: 0, scout: 0 };

  resolveProduction(state, 'player');
  assert.ok(player.population.forager < 20, 'foragers must be able to starve once no workers remain');
});

test('soldiers desert when fungus upkeep is unpaid, and garrisons are reconciled', () => {
  const state = getInitialStateWithVisibleNode(45);
  const player = state.colonies.player;
  const nodeKey = findDiscoveredResourceNode(state, 'player');
  layTrail(state, 'player', player.nestTile, nodeKey);
  reassignCaste(state, 'player', 'worker', 'soldier', 3);
  assignGarrison(state, 'player', player.trails[0].id, 2);

  player.resources.fungus = 0;
  player.resources.sugar = 1000; // don't also trigger worker/forager starvation in this test
  resolveProduction(state, 'player');

  assert.ok(player.population.soldier < 3, 'at least one soldier should desert with zero fungus');
  const totalGarrisoned = player.trails.reduce((sum, t) => sum + t.garrison, 0);
  assert.ok(totalGarrisoned <= player.population.soldier, 'garrison must never exceed actual soldier count');
});
