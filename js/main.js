import { getInitialState } from './state.js';
import { loadGame, saveGame } from './save.js';
import { renderAll, centerMapOnTile } from './render.js';
import { initInput, initHelpModal } from './input.js';

const existing = loadGame();
const store = {
  state: existing || getInitialState(Date.now()),
  ui: { selectedTile: null },
};

if (!existing) saveGame(store.state);

renderAll(store.state, store.ui);
centerMapOnTile(store.state.colonies.player.nestTile);
initInput(store);
initHelpModal(!existing);
