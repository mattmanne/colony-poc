import { digChamber, reassignCaste } from './colony.js';
import { layTrail, upgradeTrailCapacity } from './trails.js';
import { advanceCycle } from './cycle.js';
import { saveGame, clearSave } from './save.js';
import { getInitialState } from './state.js';
import { renderAll, centerMapOnTile } from './render.js';

export function initHelpModal(showOnLoad) {
  const modal = document.getElementById('help-modal');
  document.getElementById('help-btn').addEventListener('click', () => modal.classList.remove('hidden'));
  document.getElementById('help-close-btn').addEventListener('click', () => modal.classList.add('hidden'));
  if (showOnLoad) modal.classList.remove('hidden');
}

export function initInput(store) {
  document.getElementById('map').addEventListener('click', (e) => {
    const div = e.target.closest('.hex');
    if (!div) return;
    store.ui.selectedTile = div.dataset.key;
    render(store);
  });

  document.getElementById('tile-panel').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (btn) handleAction(store, btn);
  });

  document.getElementById('colony-panel').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (btn) handleAction(store, btn);
  });

  document.getElementById('advance-cycle-btn').addEventListener('click', () => {
    advanceCycle(store.state);
    saveGame(store.state);
    render(store);
  });

  document.getElementById('new-colony-btn').addEventListener('click', () => {
    if (!confirm('Start a brand new colony? This discards your current save.')) return;
    clearSave();
    store.state = getInitialState(Date.now());
    store.ui.selectedTile = null;
    saveGame(store.state);
    render(store);
    centerMapOnTile(store.state.colonies.player.nestTile);
  });
}

function handleAction(store, btn) {
  const state = store.state;
  const action = btn.dataset.action;

  if (state.actionPointsRemaining <= 0) {
    showMessage('No action points left this cycle.');
    return;
  }

  let result;
  if (action === 'dig') {
    result = digChamber(state, 'player', store.ui.selectedTile, btn.dataset.chamberType);
  } else if (action === 'lay-trail') {
    result = layTrail(state, 'player', state.colonies.player.nestTile, store.ui.selectedTile);
  } else if (action === 'upgrade-trail') {
    result = upgradeTrailCapacity(state, 'player', btn.dataset.trailId);
  } else if (action === 'reassign') {
    result = reassignCaste(state, 'player', btn.dataset.from, btn.dataset.to, 1);
  } else {
    return;
  }

  if (!result.ok) {
    showMessage(result.reason);
    return;
  }

  state.actionPointsRemaining -= 1;
  saveGame(state);
  render(store);
}

let messageTimer = null;
function showMessage(text) {
  const el = document.getElementById('message');
  el.textContent = text;
  el.classList.add('visible');
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => el.classList.remove('visible'), 2500);
}

function render(store) {
  renderAll(store.state, store.ui);
}
