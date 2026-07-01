import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getInitialState } from '../js/state.js';
import { runAiTurn } from '../js/ai.js';
import { MAX_GARRISON } from '../js/constants.js';

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

test('the AI garrisons a contested trail once it has spare soldiers', () => {
  const state = getInitialState(93);
  const rival = state.colonies.rival_1;
  rival.trails.push({
    id: 'contested-trail', garrison: 0, capacity: 1, contested: true,
    path: [rival.nestTile], inTransit: [],
  });
  rival.population.soldier = 2;
  rival.population.worker = 0; // force garrisoning to be the only useful action available

  runAiTurn(state, 'rival_1');

  assert.ok(rival.trails[0].garrison > 0, 'AI should garrison a contested trail when it has spare soldiers');
});

test('the AI never garrisons past MAX_GARRISON', () => {
  const state = getInitialState(94);
  const rival = state.colonies.rival_1;
  rival.trails.push({
    id: 'contested-trail', garrison: 0, capacity: 1, contested: true,
    path: [rival.nestTile], inTransit: [],
  });
  rival.population.soldier = 10;

  for (let i = 0; i < 10; i++) runAiTurn(state, 'rival_1');

  assert.ok(rival.trails[0].garrison <= MAX_GARRISON, 'garrison should never exceed MAX_GARRISON');
});
