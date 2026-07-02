import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getInitialState } from '../js/state.js';
import {
  layTrail, layTrailManual, upgradeTrailCapacity, assignGarrison, availableSoldiers, clampGarrisons,
  resolveTrailsForColony, nextHopCandidates,
} from '../js/trails.js';
import { reassignCaste } from '../js/colony.js';
import { findDiscoveredResourceNode, getInitialStateWithVisibleNode } from './helpers.mjs';
import { findPath } from '../js/hexgrid.js';
import { MAX_GARRISON, TRAIL_MAX_CAPACITY, NODE_AMOUNT } from '../js/constants.js';

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
  const stepsNeeded = TRAIL_MAX_CAPACITY - player.trails[0].capacity;
  for (let i = 0; i < stepsNeeded; i++) {
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

test('regression: sugar trails get forager-budget priority over other resource trails once foragers are scarce', () => {
  // A colony that laid a non-sugar trail first and then starved down to one
  // forager used to permanently zero its sugar income forever (the lone
  // forager's capacity went to whichever trail was earlier in the array,
  // never sugar) — an unrecoverable death spiral. Sugar must win the budget
  // regardless of lay order.
  const state = getInitialStateWithVisibleNode(39);
  const player = state.colonies.player;
  const mineralNodeKey = findDiscoveredResourceNode(state, 'player');
  state.map.tiles[mineralNodeKey].resourceNode.type = 'mineral';
  state.map.tiles[mineralNodeKey].resourceNode.amount = NODE_AMOUNT.mineral;

  const sugarNodeKey = Object.keys(state.map.tiles).find((key) => {
    const t = state.map.tiles[key];
    return key !== mineralNodeKey && t.discoveredBy.player && t.terrain === 'soil'
      && !t.chamber && !t.resourceNode;
  });
  assert.ok(sugarNodeKey, 'expected an empty discovered soil tile to host a synthetic sugar node');
  state.map.tiles[sugarNodeKey].resourceNode = { type: 'sugar', amount: NODE_AMOUNT.sugar, maxAmount: NODE_AMOUNT.sugar };

  // Lay the non-sugar trail FIRST so it would win under naive array-order
  // allocation, then the sugar trail second.
  assert.equal(layTrail(state, 'player', player.nestTile, mineralNodeKey).ok, true);
  assert.equal(layTrail(state, 'player', player.nestTile, sugarNodeKey).ok, true);

  player.population.forager = 1; // fewer than either trail's own capacity
  resolveTrailsForColony(state, 'player');

  const mineralTrail = player.trails.find((t) => t.path[t.path.length - 1] === mineralNodeKey);
  const sugarTrail = player.trails.find((t) => t.path[t.path.length - 1] === sugarNodeKey);
  assert.equal(sugarTrail.inTransit.length, 1, 'the lone forager should go to the sugar trail');
  assert.equal(mineralTrail.inTransit.length, 0, 'the non-sugar trail should get none of the scarce forager budget');
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

test('layTrailManual accepts a valid player-drawn path', () => {
  const state = getInitialStateWithVisibleNode(33);
  const player = state.colonies.player;
  const nodeKey = findDiscoveredResourceNode(state, 'player');

  const isBlocked = (key) => {
    const t = state.map.tiles[key];
    return !t || t.terrain === 'water' || !t.discoveredBy.player;
  };
  const path = findPath(player.nestTile, nodeKey, isBlocked);

  const result = layTrailManual(state, 'player', path);
  assert.equal(result.ok, true);
  assert.deepEqual(player.trails[0].path, path);
});

test('layTrailManual rejects a path that does not start at an owned chamber', () => {
  const state = getInitialStateWithVisibleNode(34);
  const nodeKey = findDiscoveredResourceNode(state, 'player');
  const result = layTrailManual(state, 'player', [nodeKey]);
  assert.equal(result.ok, false);
  assert.match(result.reason, /chamber/i);
});

test('layTrailManual rejects a path with non-adjacent tiles', () => {
  const state = getInitialStateWithVisibleNode(35);
  const player = state.colonies.player;
  const nodeKey = findDiscoveredResourceNode(state, 'player');
  const result = layTrailManual(state, 'player', [player.nestTile, nodeKey]);
  assert.equal(result.ok, false);
  assert.match(result.reason, /adjacent/i);
});

test('layTrailManual rejects a path crossing undiscovered ground', () => {
  const state = getInitialStateWithVisibleNode(36);
  const player = state.colonies.player;
  const { q, r } = state.map.tiles[player.nestTile];
  // Walk far enough in one direction to guarantee leaving discovered territory.
  const farKey = `${q + 20},${r}`;
  const result = layTrailManual(state, 'player', [player.nestTile, farKey]);
  assert.equal(result.ok, false);
});

test('nextHopCandidates only offers discovered, walkable, unused neighbors', () => {
  const state = getInitialStateWithVisibleNode(37);
  const player = state.colonies.player;
  const hops = nextHopCandidates(state, 'player', [player.nestTile]);

  assert.ok(hops.length > 0, 'the nest should have at least one valid next hop');
  for (const key of hops) {
    const tile = state.map.tiles[key];
    assert.equal(tile.terrain === 'water', false);
    assert.equal(tile.discoveredBy.player, true);
    assert.notEqual(key, player.nestTile);
  }
});

test('nextHopCandidates excludes tiles already used in the path', () => {
  const state = getInitialStateWithVisibleNode(38);
  const player = state.colonies.player;
  const firstHops = nextHopCandidates(state, 'player', [player.nestTile]);
  const extended = [player.nestTile, firstHops[0]];
  const secondHops = nextHopCandidates(state, 'player', extended);
  assert.equal(secondHops.includes(player.nestTile), false);
  assert.equal(secondHops.includes(firstHops[0]), false);
});
