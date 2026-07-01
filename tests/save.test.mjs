import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getInitialState } from '../js/state.js';

// save.js references the bare global `localStorage` (as it does in a browser).
// Node has no such global by default, so we install a minimal in-memory mock
// before importing it — this keeps the test hermetic (no real disk/browser storage).
function installMockLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  return store;
}

installMockLocalStorage();
const { saveGame, loadGame, clearSave } = await import('../js/save.js');

test('saveGame followed by loadGame round-trips the full state', () => {
  const state = getInitialState(80);
  saveGame(state);
  const loaded = loadGame();
  assert.deepEqual(loaded, state);
});

test('loadGame returns null when nothing has been saved', () => {
  clearSave();
  assert.equal(loadGame(), null);
});

test('clearSave removes a previously saved game', () => {
  const state = getInitialState(81);
  saveGame(state);
  assert.notEqual(loadGame(), null);
  clearSave();
  assert.equal(loadGame(), null);
});

test('loadGame does not throw on corrupted JSON in storage', () => {
  globalThis.localStorage.setItem('colony_save_v1', '{not valid json');
  assert.doesNotThrow(() => loadGame());
  assert.equal(loadGame(), null);
});
