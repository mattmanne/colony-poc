import { movesInRange, adjacentEnemies, getCurrentActor } from './battle.js';

const CELL = 50;
const UNIT_ICONS = { forager: '🐜', soldier: '⚔️' };

export function renderBattle(battle) {
  renderGrid(battle);
  renderStatus(battle);
  renderLog(battle);
}

function renderGrid(battle) {
  const gridEl = document.getElementById('battle-grid');
  gridEl.innerHTML = '';
  gridEl.style.width = `${battle.gridSize * CELL}px`;
  gridEl.style.height = `${battle.gridSize * CELL}px`;

  const actor = getCurrentActor(battle);
  const selectedUnit = actor && actor.side === 'defender' ? actor : null;
  const validMoveSet = new Set();
  const attackableIds = new Set();

  if (selectedUnit) {
    for (const m of movesInRange(battle, selectedUnit)) validMoveSet.add(`${m.x},${m.y}`);
    for (const e of adjacentEnemies(battle, selectedUnit)) attackableIds.add(e.id);
  }

  for (let y = 0; y < battle.gridSize; y++) {
    for (let x = 0; x < battle.gridSize; x++) {
      const cell = document.createElement('div');
      cell.className = 'battle-cell';
      cell.style.left = `${x * CELL}px`;
      cell.style.top = `${y * CELL}px`;

      if (battle.obstacles.some((o) => o.x === x && o.y === y)) cell.classList.add('obstacle');

      const unit = battle.units.find((u) => u.alive && !u.escaped && u.x === x && u.y === y);
      if (unit) {
        cell.classList.add(unit.side === 'defender' ? 'battle-unit-defender' : 'battle-unit-attacker');
        cell.textContent = UNIT_ICONS[unit.type];
        const hp = document.createElement('span');
        hp.className = 'battle-hp';
        hp.textContent = unit.hp;
        cell.appendChild(hp);

        if (attackableIds.has(unit.id)) {
          cell.classList.add('battle-attackable');
          cell.dataset.attackTarget = unit.id;
        }
      } else if (validMoveSet.has(`${x},${y}`)) {
        cell.classList.add('battle-movable');
        cell.dataset.moveX = x;
        cell.dataset.moveY = y;
      }

      gridEl.appendChild(cell);
    }
  }
}

function renderStatus(battle) {
  const statusEl = document.getElementById('battle-status');
  const actor = getCurrentActor(battle);

  if (battle.finished) {
    statusEl.textContent = battle.outcome === 'defender' ? 'Victory — shipment saved!' : 'Defeat — shipment lost.';
  } else if (actor && actor.side === 'defender') {
    statusEl.textContent = actor.type === 'forager'
      ? "Your forager's turn — tap a glowing tile to move, or hold position."
      : "Your soldier's turn — tap a glowing tile to move, or tap an enemy to attack.";
  } else {
    statusEl.textContent = 'Raiders are moving...';
  }

  const actionsEl = document.getElementById('battle-actions');
  actionsEl.innerHTML = '';
  if (battle.finished) {
    actionsEl.innerHTML = '<button id="battle-continue-btn">Continue</button>';
  } else if (actor && actor.side === 'defender' && actor.type === 'forager') {
    actionsEl.innerHTML = '<button id="battle-hold-btn">Hold Position</button>';
  }
}

function renderLog(battle) {
  document.getElementById('battle-log').innerHTML = battle.log
    .slice(0, 6)
    .map((l) => `<div class="log-line">${l}</div>`)
    .join('');
}
