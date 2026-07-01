import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getInitialState } from '../js/state.js';
import { beginAdvanceCycle, finishAdvanceCycle } from '../js/cycle.js';
import { AP_PER_CYCLE } from '../js/constants.js';

test('finishAdvanceCycle increments the turn and resets AP', () => {
  const state = getInitialState(60);
  state.actionPointsRemaining = 0;
  const turnBefore = state.turn;
  beginAdvanceCycle(state);
  finishAdvanceCycle(state);
  assert.equal(state.turn, turnBefore + 1);
  assert.equal(state.actionPointsRemaining, AP_PER_CYCLE);
});

test('beginAdvanceCycle runs both rivals\' AI turns without throwing', () => {
  const state = getInitialState(61);
  assert.doesNotThrow(() => beginAdvanceCycle(state));
});

test('beginAdvanceCycle returns false when no battles are pending', () => {
  const state = getInitialState(62);
  const hasBattles = beginAdvanceCycle(state);
  assert.equal(typeof hasBattles, 'boolean');
  // No garrisons exist on a fresh colony, so nothing should ever queue a battle turn 1.
  assert.equal(hasBattles, false);
});

test('running many cycles never throws and keeps state JSON-serializable', () => {
  const state = getInitialState(63);
  for (let i = 0; i < 30; i++) {
    beginAdvanceCycle(state);
    // Drain any pending battles with a no-op defender so the loop doesn't stall on real gameplay.
    state.pendingBattles = [];
    finishAdvanceCycle(state);
  }
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(state)));
});

test('every colony (not just rivals) has a raidCooldown that ticks down each cycle', () => {
  const state = getInitialState(64);
  for (const colony of Object.values(state.colonies)) {
    assert.equal(typeof colony.raidCooldown, 'number');
    colony.raidCooldown = 3;
  }
  beginAdvanceCycle(state);
  for (const colony of Object.values(state.colonies)) {
    assert.equal(colony.raidCooldown, 2);
  }
});

test('raidCooldown never goes negative', () => {
  const state = getInitialState(65);
  state.colonies.player.raidCooldown = 0;
  beginAdvanceCycle(state);
  assert.equal(state.colonies.player.raidCooldown, 0);
});

test('beginAdvanceCycle only surfaces player-defended battles as pending — rival-defended battles auto-resolve', () => {
  const state = getInitialState(66);
  const rival = state.colonies.rival_1;
  const player = state.colonies.player;

  // Rig a contested, garrisoned rival trail with a pip about to arrive, and
  // an attacker (player) with soldiers ready to raid it.
  rival.trails.push({
    id: 'rt', garrison: 2, capacity: 1, contested: true,
    path: [rival.nestTile], inTransit: [{ resourceType: 'sugar', amount: 5, eta: 1 }],
  });
  rival.population.soldier = 2;
  player.population.soldier = 2;
  // Force the trail's territory check and pickup to see it as contested by the player.
  state.map.tiles[rival.nestTile].owner = 'contested';

  const hasBattles = beginAdvanceCycle(state);
  // Whatever happened, no pending battle should ever have rival_1 as defender —
  // those resolve automatically inside beginAdvanceCycle.
  for (const pending of state.pendingBattles) {
    assert.equal(pending.defenderColonyId, 'player');
  }
  assert.equal(typeof hasBattles, 'boolean');
});
