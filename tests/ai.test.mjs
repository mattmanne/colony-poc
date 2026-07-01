import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getInitialState } from '../js/state.js';
import { runAiTurn } from '../js/ai.js';

test('runAiTurn does not throw and never leaves impossible negative state', () => {
  const state = getInitialState(90);
  for (let i = 0; i < 20; i++) {
    assert.doesNotThrow(() => runAiTurn(state, 'rival_1'));
    const rival = state.colonies.rival_1;
    for (const v of Object.values(rival.resources)) assert.ok(v >= 0);
    for (const v of Object.values(rival.population)) assert.ok(v >= 0);
  }
});

test('runAiTurn eventually expands the rival colony (lays a trail or digs a chamber)', () => {
  const state = getInitialState(91);
  const rival = state.colonies.rival_1;
  const trailsBefore = rival.trails.length;
  const chambersBefore = rival.chambers.length;

  for (let i = 0; i < 5; i++) runAiTurn(state, 'rival_1');

  assert.ok(
    rival.trails.length > trailsBefore || rival.chambers.length > chambersBefore,
    'AI should take at least one expansion action within 5 turns',
  );
});

test('runAiTurn never digs a chamber on a resource-node tile', () => {
  const state = getInitialState(92);
  const rival = state.colonies.rival_1;
  for (let i = 0; i < 15; i++) runAiTurn(state, 'rival_1');
  for (const key of rival.chambers) {
    assert.equal(state.map.tiles[key].resourceNode, null);
  }
});
