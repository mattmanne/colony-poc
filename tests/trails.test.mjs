import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getInitialState } from '../js/state.js';
import {
  layTrail, upgradeTrailCapacity, assignGarrison, availableSoldiers, clampGarrisons, resolveTrailsForColony,
} from '../js/trails.js';
import { reassignCaste } from '../js/colony.js';
import { findDiscoveredResourceNode, getInitialStateWithVisibleNode } from './helpers.mjs';
import { MAX_GARRISON, TRAIL_MAX_CAPACITY } from '../js/constants.js';

test('layTrail succeeds to a discovered resource node and fails on a duplicate', () => {
  const state = getInitialStateWithVisibleNode(20);
  const player = state.colonies.player;
  const nodeKey = findDiscoveredResourceNode(state, 'player');

  const first = layTrail(state, 'player', player.nestTile, nodeKey);
  assert.equal(first.ok, true);
  assert.equal(player.trails.length, 1);
  assert.equal(player.trails[0].path[player.trails[0].path.length - 1], nodeKey);

  const dup = layTrail(state, 'player', player.nestTile, nodeKey);
  assert.equal(dup.ok, false);
  assert.equal(player.trails.length, 1);
});

test('layTrail fails with no spare foragers', () => {
  const state = getInitialStateWithVisibleNode(21);
  const player = state.colonies.player;
  player.population.forager = 0;
  const nodeKey = findDiscoveredResourceNode(state, 'player');
  const result = layTrail(state, 'player', player.nestTile, nodeKey);
  assert.equal(result.ok, false);
  assert.match(result.reason, /forager/i);
});

test('layTrail fails against a tile with no resource node', () => {
  const state = getInitialState(22);
  const player = state.colonies.player;
  const result = layTrail(state, 'player', player.nestTile, player.nestTile);
  assert.equal(result.ok, false);
});

test('upgradeTrailCapacity increases capacity up to the cap and requires mineral+forager', () => {
  const state = getInitialStateWithVisibleNode(23);
  const player = state.colonies.player;
  const nodeKey = findDiscoveredResourceNode(state, 'player');
  layTrail(state, 'player', player.nestTile, nodeKey);
  const trailId = player.trails[0].id;

  player.resources.mineral = 100;
  player.population.forager = 10;
  for (let i = 1; i < TRAIL_MAX_CAPACITY; i++) {
    const res = upgradeTrailCapacity(state, 'player', trailId);
    assert.equal(res.ok, true);
  }
  assert.equal(player.trails[0].capacity, TRAIL_MAX_CAPACITY);

  const overCap = upgradeTrailCapacity(state, 'player', trailId);
  assert.equal(overCap.ok, false);
});

test('upgradeTrailCapacity fails without enough mineral', () => {
  const state = getInitialStateWithVisibleNode(24);
  const player = state.colonies.player;
  const nodeKey = findDiscoveredResourceNode(state, 'player');
  layTrail(state, 'player', player.nestTile, nodeKey);
  player.resources.mineral = 0;
  const result = upgradeTrailCapacity(state, 'player', player.trails[0].id);
  assert.equal(result.ok, false);
});

test('assignGarrison caps at MAX_GARRISON and requires spare soldiers', () => {
  const state = getInitialStateWithVisibleNode(25);
  const player = state.colonies.player;
  const nodeKey = findDiscoveredResourceNode(state, 'player');
  layTrail(state, 'player', player.nestTile, nodeKey);
  const trailId = player.trails[0].id;

  reassignCaste(state, 'player', 'worker', 'soldier', MAX_GARRISON + 1);
  for (let i = 0; i < MAX_GARRISON; i++) {
    assert.equal(assignGarrison(state, 'player', trailId, 1).ok, true);
  }
  assert.equal(player.trails[0].garrison, MAX_GARRISON);
  assert.equal(assignGarrison(state, 'player', trailId, 1).ok, false);
});

test('assignGarrison fails without enough spare soldiers', () => {
  const state = getInitialStateWithVisibleNode(26);
  const player = state.colonies.player;
  const nodeKey = findDiscoveredResourceNode(state, 'player');
  layTrail(state, 'player', player.nestTile, nodeKey);
  const result = assignGarrison(state, 'player', player.trails[0].id, 1);
  assert.equal(result.ok, false);
});

test('regression: clampGarrisons reconciles garrison count after soldiers are lost elsewhere', () => {
  const state = getInitialStateWithVisibleNode(27);
  const player = state.colonies.player;
  const nodeKey = findDiscoveredResourceNode(state, 'player');
  layTrail(state, 'player', player.nestTile, nodeKey);
  reassignCaste(state, 'player', 'worker', 'soldier', 2);
  assignGarrison(state, 'player', player.trails[0].id, 2);
  assert.equal(player.trails[0].garrison, 2);

  // Simulate soldiers being lost outside of assignGarrison (desertion/casualties)
  player.population.soldier = 0;
  clampGarrisons(player);
  assert.equal(player.trails[0].garrison, 0);

  const total = player.trails.reduce((sum, t) => sum + t.garrison, 0);
  assert.ok(total <= player.population.soldier);
});

test('availableSoldiers accounts for garrisoned soldiers', () => {
  const state = getInitialStateWithVisibleNode(28);
  const player = state.colonies.player;
  const nodeKey = findDiscoveredResourceNode(state, 'player');
  layTrail(state, 'player', player.nestTile, nodeKey);
  reassignCaste(state, 'player', 'worker', 'soldier', 3);
  assignGarrison(state, 'player', player.trails[0].id, 2);
  assert.equal(availableSoldiers(state, 'player'), 1);
});

test('resolveTrailsForColony picks up resources, respects capacity, and regenerates the node', () => {
  const state = getInitialStateWithVisibleNode(29);
  const player = state.colonies.player;
  const nodeKey = findDiscoveredResourceNode(state, 'player');
  const node = state.map.tiles[nodeKey].resourceNode;
  const startAmount = node.amount;

  layTrail(state, 'player', player.nestTile, nodeKey);
  resolveTrailsForColony(state, 'player');

  const trail = player.trails[0];
  assert.equal(trail.inTransit.length, 1);
  assert.equal(trail.inTransit[0].amount, trail.capacity);
  assert.ok(node.amount <= startAmount, 'node amount should have decreased by the pickup (net of regen)');
});

test('resolveTrailsForColony delivers a pip once its ETA elapses, tracking lifetime stats', () => {
  const state = getInitialStateWithVisibleNode(30);
  const player = state.colonies.player;
  const nodeKey = findDiscoveredResourceNode(state, 'player');
  layTrail(state, 'player', player.nestTile, nodeKey);
  const resourceType = state.map.tiles[nodeKey].resourceNode.type;
  const before = player.resources[resourceType];

  // Resolve enough cycles for the pip's ETA to reach 0 (short paths latency 1).
  for (let i = 0; i < 5; i++) resolveTrailsForColony(state, 'player');

  assert.ok(player.resources[resourceType] > before, 'resource should have been delivered');
  assert.ok(player.lifetimeStats.resourcesHarvested > 0);
});

test('regression: trail throughput is throttled by currently-alive foragers, not just capacity', () => {
  const state = getInitialStateWithVisibleNode(31);
  const player = state.colonies.player;
  const nodeKey = findDiscoveredResourceNode(state, 'player');
  layTrail(state, 'player', player.nestTile, nodeKey);

  player.population.forager = 0;
  player.trails[0].inTransit = [];
  resolveTrailsForColony(state, 'player');
  assert.equal(player.trails[0].inTransit.length, 0, 'no pickup should occur with zero live foragers');
});

test('a trail crossing rival-owned territory is marked contested', () => {
  const state = getInitialStateWithVisibleNode(32);
  const player = state.colonies.player;
  const nodeKey = findDiscoveredResourceNode(state, 'player');
  layTrail(state, 'player', player.nestTile, nodeKey);
  const trail = player.trails[0];

  // Force one path tile to be owned by a rival to simulate territory overlap.
  const midTile = state.map.tiles[trail.path[Math.floor(trail.path.length / 2)] || trail.path[0]];
  const originalOwner = midTile.owner;
  midTile.owner = 'rival_1';

  resolveTrailsForColony(state, 'player');
  assert.equal(trail.contested, true);

  midTile.owner = originalOwner;
});
