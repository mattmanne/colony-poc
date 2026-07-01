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
