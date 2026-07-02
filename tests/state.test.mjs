import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getInitialState, totalPopulation, addLog } from '../js/state.js';

test('getInitialState creates exactly one player and two rivals', () => {
  const state = getInitialState(1);
  assert.deepEqual(Object.keys(state.colonies).sort(), ['player', 'rival_1', 'rival_2']);
  assert.equal(state.colonies.player.isPlayer, true);
  assert.equal(state.colonies.rival_1.isPlayer, false);
  assert.equal(state.colonies.rival_2.isPlayer, false);
});

test('each colony starts with a nest chamber, owned tile, and revealed fog around it', () => {
  const state = getInitialState(2);
  for (const colony of Object.values(state.colonies)) {
    const nestTile = state.map.tiles[colony.nestTile];
    assert.equal(nestTile.chamber.type, 'nest');
    assert.equal(nestTile.chamber.ownerColonyId, colony.id);
    assert.equal(nestTile.owner, colony.id);
    assert.equal(nestTile.discoveredBy[colony.id], true);
    assert.equal(colony.chambers.length, 1);
  }
});

test('totalPopulation sums all castes', () => {
  const colony = { population: { worker: 3, forager: 2, soldier: 1 } };
  assert.equal(totalPopulation(colony), 6);
});

test('addLog prepends and caps the log at 30 entries', () => {
  const state = { turn: 1, log: [] };
  for (let i = 0; i < 40; i++) addLog(state, `event ${i}`);
  assert.equal(state.log.length, 30);
  assert.equal(state.log[0].text, 'event 39', 'most recent entry should be first');
});

test('nest sites never overlap between colonies', () => {
  const state = getInitialState(3);
  const nests = Object.values(state.colonies).map((c) => c.nestTile);
  assert.equal(new Set(nests).size, nests.length);
});
