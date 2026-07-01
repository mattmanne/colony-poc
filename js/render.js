import { pixelForHex } from './hexgrid.js';
import { totalPopulation } from './state.js';
import { isAdjacentToOwnedChamber, canAffordChamber } from './colony.js';
import { availableSoldiers } from './trails.js';
import { CHAMBER_TYPES, TRAIL_MAX_CAPACITY, TRAIL_UPGRADE_COST_MINERAL, MAX_GARRISON } from './constants.js';
import { escapeHtml } from './htmlEscape.js';

const HEX_SIZE = 26;
const OFFSET = 480;

const RESOURCE_ICONS = { sugar: '🍬', protein: '🥩', fungus: '🍄', mineral: '💎' };
const CHAMBER_ICONS = { nest: '🐜', storage: '📦', farm: '🍄', nursery: '🥚' };

export function renderAll(state, ui) {
  renderTopbar(state);
  renderMap(state, ui);
  renderColonyPanel(state);
  renderTilePanel(state, ui);
  renderLog(state);
}

function renderTopbar(state) {
  const player = state.colonies.player;

  document.getElementById('turn-counter').textContent = `Cycle ${state.turn}`;
  document.getElementById('ap-counter').textContent = `AP: ${state.actionPointsRemaining}/3`;
  document.getElementById('pop-counter').textContent = `Pop: ${totalPopulation(player)}/${player.populationCap}`;

  const bar = document.getElementById('resource-bar');
  bar.innerHTML = '';
  for (const res of ['sugar', 'protein', 'fungus', 'mineral']) {
    const span = document.createElement('span');
    span.className = 'resource-pill';
    span.textContent = `${RESOURCE_ICONS[res]} ${Math.floor(player.resources[res])}/${player.storageCap[res]}`;
    bar.appendChild(span);
  }
}

function ownerClass(owner) {
  if (owner === 'player') return 'owner-player';
  if (owner === 'contested') return 'owner-contested';
  if (owner) return 'owner-rival';
  return '';
}

function renderMap(state, ui) {
  const mapEl = document.getElementById('map');
  mapEl.innerHTML = '';
  const player = state.colonies.player;

  for (const key of Object.keys(state.map.tiles)) {
    const tile = state.map.tiles[key];
    const discovered = !!tile.discoveredBy.player;

    const { x, y } = pixelForHex(tile.q, tile.r, HEX_SIZE);
    const div = document.createElement('div');
    div.className = `hex ${discovered ? '' : 'hex-fog'} ${ownerClass(tile.owner)}`;
    if (key === ui.selectedTile) div.classList.add('hex-selected');
    div.style.left = `${x + OFFSET}px`;
    div.style.top = `${y + OFFSET}px`;
    div.dataset.key = key;

    if (discovered) {
      if (tile.terrain === 'water') div.classList.add('terrain-water');
      if (tile.terrain === 'rock') div.classList.add('terrain-rock');

      if (tile.chamber) {
        div.textContent = CHAMBER_ICONS[tile.chamber.type] || '🏠';
      } else if (tile.resourceNode) {
        div.textContent = RESOURCE_ICONS[tile.resourceNode.type];
      }

      const diggable = !tile.chamber && !tile.resourceNode && tile.terrain !== 'water'
        && isAdjacentToOwnedChamber(state, 'player', key);
      if (diggable) div.classList.add('hex-diggable');

      if (tile.resourceNode && !player.trails.some((t) => t.path[t.path.length - 1] === key)) {
        div.classList.add('hex-linkable');
      }
    }

    mapEl.appendChild(div);
  }

  renderTrails(state);
}

// Scrolls the map viewport so the given tile is centered — used to orient
// the player on load, since the raw hex grid gives no visual starting cue.
export function centerMapOnTile(tileKey) {
  const div = document.querySelector(`.hex[data-key="${tileKey}"]`);
  if (div) div.scrollIntoView({ block: 'center', inline: 'center' });
}

function renderTrails(state) {
  const overlay = document.getElementById('trail-overlay');
  overlay.innerHTML = '';

  for (const colonyId of Object.keys(state.colonies)) {
    const colony = state.colonies[colonyId];
    for (const trail of colony.trails) {
      for (const key of trail.path) {
        const tile = state.map.tiles[key];
        if (!tile.discoveredBy.player) continue;

        const { x, y } = pixelForHex(tile.q, tile.r, HEX_SIZE);
        const dot = document.createElement('div');
        const colorClass = trail.contested ? 'trail-contested' : (colonyId === 'player' ? 'trail-player' : 'trail-rival');
        dot.className = `trail-dot ${colorClass}`;
        dot.style.left = `${x + OFFSET + HEX_SIZE - 4}px`;
        dot.style.top = `${y + OFFSET + HEX_SIZE - 4}px`;
        overlay.appendChild(dot);
      }
    }
  }
}

function renderColonyPanel(state) {
  const player = state.colonies.player;
  const panel = document.getElementById('colony-panel');
  const traitNote = player.traits.length > 0
    ? `<p class="hint">Unlocked: ${player.traits.map(escapeHtml).join(', ')}</p>`
    : '';
  panel.innerHTML = `
    <h3>Colony</h3>
    <p>Population: ${totalPopulation(player)} / ${player.populationCap}</p>
    <p>Workers: ${player.population.worker} &nbsp; Foragers: ${player.population.forager} &nbsp; Soldiers: ${player.population.soldier}</p>
    <div class="actions">
      <button data-action="reassign" data-from="worker" data-to="forager" ${player.population.worker < 1 ? 'disabled' : ''}>Worker &rarr; Forager</button>
      <button data-action="reassign" data-from="forager" data-to="worker" ${player.population.forager < 1 ? 'disabled' : ''}>Forager &rarr; Worker</button>
      <button data-action="reassign" data-from="worker" data-to="soldier" ${player.population.worker < 1 ? 'disabled' : ''}>Worker &rarr; Soldier</button>
      <button data-action="reassign" data-from="soldier" data-to="worker" ${player.population.soldier < 1 ? 'disabled' : ''}>Soldier &rarr; Worker</button>
    </div>
    ${traitNote}
  `;
}

function formatCost(cost) {
  const entries = Object.entries(cost || {});
  if (entries.length === 0) return 'free';
  return entries.map(([res, amt]) => `${amt} ${res}`).join(', ');
}

function renderTilePanel(state, ui) {
  const panel = document.getElementById('tile-panel');
  const key = ui.selectedTile;

  if (!key) {
    panel.innerHTML = '<p class="hint">Tap a tile to inspect it.</p>';
    return;
  }

  const tile = state.map.tiles[key];
  if (!tile.discoveredBy.player) {
    panel.innerHTML = '<p class="hint">Unexplored territory.</p>';
    return;
  }

  const player = state.colonies.player;
  let html = `<h3>Tile (${Number(tile.q)}, ${Number(tile.r)})</h3>`;
  html += `<p>Terrain: ${escapeHtml(tile.terrain)}</p>`;
  html += `<p>Owner: ${escapeHtml(tile.owner || 'unclaimed')}</p>`;

  if (tile.chamber) {
    const chamberDef = CHAMBER_TYPES[tile.chamber.type];
    html += `<p>Chamber: ${escapeHtml(chamberDef ? chamberDef.name : tile.chamber.type)} (${escapeHtml(tile.chamber.ownerColonyId)})</p>`;
  }
  if (tile.resourceNode) {
    html += `<p>Resource: ${escapeHtml(tile.resourceNode.type)} — ${Math.floor(tile.resourceNode.amount)}/${tile.resourceNode.maxAmount}</p>`;
  }

  html += '<div class="actions">';

  if (!tile.chamber && !tile.resourceNode && tile.terrain !== 'water' && isAdjacentToOwnedChamber(state, 'player', key)) {
    for (const type of ['storage', 'farm', 'nursery']) {
      const def = CHAMBER_TYPES[type];
      const afford = canAffordChamber(player, type);
      html += `<button data-action="dig" data-chamber-type="${type}" ${afford ? '' : 'disabled'}>Dig ${def.name} (${formatCost(def.digCost)})</button>`;
    }
  }

  if (tile.resourceNode) {
    const existingTrail = player.trails.find((t) => t.path[t.path.length - 1] === key);
    if (existingTrail) {
      html += `<p>Your trail: capacity ${existingTrail.capacity}, garrison ${existingTrail.garrison}/${MAX_GARRISON}${existingTrail.contested ? ' — <span class="contested">CONTESTED</span>' : ''}</p>`;
      if (existingTrail.capacity < TRAIL_MAX_CAPACITY) {
        html += `<button data-action="upgrade-trail" data-trail-id="${escapeHtml(existingTrail.id)}">Upgrade Capacity (${TRAIL_UPGRADE_COST_MINERAL} mineral)</button>`;
      }
      if (existingTrail.garrison < MAX_GARRISON) {
        const canGarrison = availableSoldiers(state, 'player') >= 1;
        html += `<button data-action="garrison" data-trail-id="${escapeHtml(existingTrail.id)}" ${canGarrison ? '' : 'disabled'}>Garrison +1 Soldier</button>`;
      }
    } else {
      html += '<button data-action="lay-trail">Lay Trail Here (1 forager)</button>';
    }
  }

  html += '</div>';
  panel.innerHTML = html;
}

function renderLog(state) {
  document.getElementById('log').innerHTML = state.log
    .map((e) => `<div class="log-line"><b>C${Number(e.turn)}</b> ${escapeHtml(e.text)}</div>`)
    .join('');
}
