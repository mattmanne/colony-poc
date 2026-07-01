import { digChamber, reassignCaste } from './colony.js';
import {
  layTrail, layTrailManual, upgradeTrailCapacity, assignGarrison, nextHopCandidates,
} from './trails.js';
import { beginAdvanceCycle, finishAdvanceCycle } from './cycle.js';
import { createBattle, getCurrentActor, moveUnit, attackUnit, passTurn, resolveBattleOutcome } from './battle.js';
import { saveGame, clearSave } from './save.js';
import { getInitialState } from './state.js';
import { renderAll, centerMapOnTile } from './render.js';
import { renderBattle } from './render_battle.js';

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
    const key = div.dataset.key;

    if (store.ui.drawingTrail) {
      handleDrawingTap(store, key);
      return;
    }

    store.ui.selectedTile = key;
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
    const hasBattles = beginAdvanceCycle(store.state);
    saveGame(store.state);
    if (hasBattles) {
      startNextBattle(store);
    } else {
      finishAdvanceCycle(store.state);
      saveGame(store.state);
      render(store);
    }
  });

  document.getElementById('battle-grid').addEventListener('click', (e) => battleGridClick(store, e));
  document.getElementById('battle-actions').addEventListener('click', (e) => battleActionClick(store, e));

  document.getElementById('new-colony-btn').addEventListener('click', () => {
    if (!confirm('Start a brand new colony? This discards your current save.')) return;
    clearSave();
    store.state = getInitialState(Date.now());
    store.battle = null;
    store.ui.selectedTile = null;
    store.ui.drawingTrail = null;
    document.getElementById('battle-overlay').classList.add('hidden');
    saveGame(store.state);
    render(store);
    centerMapOnTile(store.state.colonies.player.nestTile);
  });
}

function handleAction(store, btn) {
  const state = store.state;
  const action = btn.dataset.action;

  // Path-drawing navigation is free — only the final committed trail costs AP.
  if (action === 'start-draw-trail') {
    store.ui.drawingTrail = { targetNodeKey: store.ui.selectedTile, path: [state.colonies.player.nestTile] };
    render(store);
    return;
  }
  if (action === 'cancel-draw-trail') {
    store.ui.drawingTrail = null;
    render(store);
    return;
  }
  if (action === 'undo-draw-trail') {
    if (store.ui.drawingTrail && store.ui.drawingTrail.path.length > 1) {
      store.ui.drawingTrail.path.pop();
      render(store);
    }
    return;
  }

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
  } else if (action === 'garrison') {
    result = assignGarrison(state, 'player', btn.dataset.trailId, 1);
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

function handleDrawingTap(store, key) {
  const state = store.state;
  const drawing = store.ui.drawingTrail;
  const candidates = nextHopCandidates(state, 'player', drawing.path);
  if (!candidates.includes(key)) return;

  drawing.path.push(key);

  if (key !== drawing.targetNodeKey) {
    render(store);
    return;
  }

  if (state.actionPointsRemaining <= 0) {
    showMessage('No action points left this cycle.');
    drawing.path.pop();
    render(store);
    return;
  }

  const result = layTrailManual(state, 'player', drawing.path);
  if (!result.ok) {
    showMessage(result.reason);
    drawing.path.pop();
    render(store);
    return;
  }

  state.actionPointsRemaining -= 1;
  store.ui.drawingTrail = null;
  store.ui.selectedTile = null;
  saveGame(state);
  render(store);
}

function startNextBattle(store) {
  const pending = store.state.pendingBattles.shift();
  if (!pending) {
    finishAdvanceCycle(store.state);
    saveGame(store.state);
    store.battle = null;
    document.getElementById('battle-overlay').classList.add('hidden');
    render(store);
    return;
  }

  store.battle = createBattle(store.state, pending);
  document.getElementById('battle-overlay').classList.remove('hidden');
  renderBattle(store.battle);
}

function battleGridClick(store, e) {
  const battle = store.battle;
  if (!battle || battle.finished) return;

  const actor = getCurrentActor(battle);
  if (!actor || actor.side !== 'defender') return;

  const cell = e.target.closest('.battle-cell');
  if (!cell) return;

  if (cell.dataset.attackTarget) {
    attackUnit(battle, actor.id, cell.dataset.attackTarget);
  } else if (cell.dataset.moveX !== undefined) {
    moveUnit(battle, actor.id, Number(cell.dataset.moveX), Number(cell.dataset.moveY));
  } else {
    return;
  }

  renderBattle(battle);
}

function battleActionClick(store, e) {
  const battle = store.battle;
  if (!battle) return;

  if (e.target.id === 'battle-hold-btn') {
    passTurn(battle);
    renderBattle(battle);
  } else if (e.target.id === 'battle-continue-btn') {
    resolveBattleOutcome(store.state, battle);
    saveGame(store.state);
    startNextBattle(store);
  }
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
