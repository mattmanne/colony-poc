import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getInitialState } from '../js/state.js';
import { checkMilestones } from '../js/milestones.js';
import { MILESTONES } from '../js/constants.js';

test('every milestone id is unique', () => {
  const ids = MILESTONES.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('a milestone unlocks exactly once its condition is met', () => {
  const state = getInitialState(70);
  const player = state.colonies.player;
  assert.equal(player.traits.includes('silo'), false);

  player.lifetimeStats.resourcesHarvested = 299;
  checkMilestones(state, 'player');
  assert.equal(player.traits.includes('silo'), false);

  player.lifetimeStats.resourcesHarvested = 300;
  const capBefore = player.storageCap.sugar;
  checkMilestones(state, 'player');
  assert.equal(player.traits.includes('silo'), true);
  assert.equal(player.storageCap.sugar, capBefore + 100);
});

test('an already-unlocked milestone does not re-apply its bonus', () => {
  const state = getInitialState(71);
  const player = state.colonies.player;
  player.lifetimeStats.chambersBuilt = 5;
  checkMilestones(state, 'player');
  const capAfterFirst = player.populationCap;

  checkMilestones(state, 'player');
  checkMilestones(state, 'player');
  assert.equal(player.populationCap, capAfterFirst, 'tunnelers bonus should only ever apply once');
});

test('all four milestones can trigger independently', () => {
  const state = getInitialState(72);
  const player = state.colonies.player;
  player.lifetimeStats = {
    resourcesHarvested: 300, battlesWon: 3, chambersBuilt: 5, longTrailCycles: 10,
  };
  checkMilestones(state, 'player');
  assert.deepEqual(new Set(player.traits), new Set(['silo', 'elite_soldier', 'tunnelers', 'waystations']));
});
