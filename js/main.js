import { getInitialState } from './state.js';
import { loadGame, saveGame } from './save.js';
import { renderAll, centerMapOnTile } from './render.js';
import { initInput, initHelpModal } from './input.js';
import { SAVE_VERSION } from './constants.js';

const loaded = loadGame();
// A prior save from an older shape (e.g. the pre-battle POC) can't be safely
// reused, so start a fresh colony rather than crash on missing fields.
const existing = loaded && loaded.version === SAVE_VERSION ? loaded : null;

const store = {
  state: existing || getInitialState(Date.now()),
  ui: { selectedTile: null },
};

if (!existing) saveGame(store.state);

renderAll(store.state, store.ui);
centerMapOnTile(store.state.colonies.player.nestTile);
initInput(store);
initHelpModal(!existing);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}
