import { pixelForHex } from './hexgrid.js';
import { totalPopulation } from './state.js';
import { isAdjacentToOwnedChamber, canAffordChamber } from './colony.js';
import { availableSoldiers, nextHopCandidates } from './trails.js';
import { CHAMBER_TYPES, TRAIL_MAX_CAPACITY, TRAIL_UPGRADE_COST_MINERAL, MAX_GARRISON } from './constants.js';
import { escapeHtml } from './htmlEscape.js';
import { iconSvg } from './icons.js';

const HEX_SIZE = 26;
const OFFSET = 480;

const RESOURCE_ICON_KEYS = { sugar: 'sugar', protein: 'protein', fungus: 'fungus', mineral: 'mineral' };
const CHAMBER_ICON_KEYS = { nest: 'ant', storage: 'storage', farm: 'farm', nursery: 'nursery' };

// Resource pills rebuild their DOM every render, so the "currently displayed"
// value (which may be mid-animation) has to live outside the DOM entirely —
// otherwise every render would just snap straight to the new number instead
// of counting up/down to it.
const displayedResourceValues = {};

function animateNumber(key, from, to, onUpdate, duration = 450) {
  if (from === to) { onUpdate(to); return; }
  const start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) * (1 - t);
    const value = Math.round(from + (to - from) * eased);
    onUpdate(value);
    displayedResourceValues[key] = value;
    if (t < 1) requestAnimationFrame(step);
    else displayedResourceValues[key] = to;
  }
  requestAnimationFrame(step);
}

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
    span.innerHTML = iconSvg(RESOURCE_ICON_KEYS[res], 'pill-icon');
    const amountEl = document.createElement('span');
    span.appendChild(amountEl);
    bar.appendChild(span);

    const cap = player.storageCap[res];
    const target = Math.floor(player.resources[res]);
    const from = displayedResourceValues[res] !== undefined ? displayedResourceValues[res] : target;
    amountEl.textContent = ` ${from}/${cap}`;
    animateNumber(res, from, target, (v) => { amountEl.textContent = ` ${v}/${cap}`; });
  }
}

function ownerClass(owner) {
  if (owner === 'player') return 'owner-player';
  if (owner === 'contested') return 'owner-contested';
  if (owner === 'rival_1') return 'owner-rival-1';
  if (owner === 'rival_2') return 'owner-rival-2';
  return '';
}

// Chambers seen dug on a previous render don't replay their "just built" pop
// animation — only a tile transitioning from no-chamber to chamber gets it.
const knownChamberTiles = new Set();

function renderMap(state, ui) {
  const mapEl = document.getElementById('map');
  mapEl.innerHTML = '';
  const player = state.colonies.player;
  const drawing = ui.drawingTrail;
  const pathSet = drawing ? new Set(drawing.path) : null;
  const nextHops = drawing ? new Set(nextHopCandidates(state, 'player', drawing.path)) : null;

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

      if (tile.chamber && tile.chamber.type !== 'nest' && !knownChamberTiles.has(key)) {
        div.classList.add('tile-pop');
      }
      if (tile.chamber) knownChamberTiles.add(key);

      if (tile.chamber) {
        div.innerHTML = iconSvg(CHAMBER_ICON_KEYS[tile.chamber.type] || 'storage', 'tile-icon');
      } else if (tile.resourceNode) {
        div.innerHTML = iconSvg(RESOURCE_ICON_KEYS[tile.resourceNode.type], 'tile-icon');
      }

      if (drawing) {
        if (pathSet.has(key)) div.classList.add('hex-path-chosen');
        else if (nextHops.has(key)) div.classList.add('hex-path-next');
      } else {
        const diggable = !tile.chamber && !tile.resourceNode && tile.terrain !== 'water'
          && isAdjacentToOwnedChamber(state, 'player', key);
        if (diggable) div.classList.add('hex-diggable');

        if (tile.resourceNode && !player.trails.some((t) => t.path[t.path.length - 1] === key)) {
          div.classList.add('hex-linkable');
        }
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

// In-transit resource pips get persistent DOM elements (keyed by their
// stable id) so a CSS transition can actually animate their position between
// renders — the static route dots below are cheap to fully rebuild every
// time since they never move.
const pipElements = new Map();

function renderTrails(state) {
  const overlay = document.getElementById('trail-overlay');
  let routeLayer = overlay.querySelector('.route-layer');
  if (!routeLayer) {
    routeLayer = document.createElement('div');
    routeLayer.className = 'route-layer';
    overlay.appendChild(routeLayer);
  }
  routeLayer.innerHTML = '';

  const activePipIds = new Set();

  for (const colonyId of Object.keys(state.colonies)) {
    const colony = state.colonies[colonyId];
    for (const trail of colony.trails) {
      const colorClass = trail.contested ? 'trail-contested' : `trail-${colonyId === 'player' ? 'player' : colonyId}`;

      for (const key of trail.path) {
        const tile = state.map.tiles[key];
        if (!tile.discoveredBy.player) continue;
        const { x, y } = pixelForHex(tile.q, tile.r, HEX_SIZE);
        const dot = document.createElement('div');
        dot.className = `trail-dot ${colorClass}`;
        dot.style.left = `${x + OFFSET + HEX_SIZE - 4}px`;
        dot.style.top = `${y + OFFSET + HEX_SIZE - 4}px`;
        routeLayer.appendChild(dot);
      }

      if (!state.map.tiles[trail.path[trail.path.length - 1]].discoveredBy.player) continue;
      for (const pip of trail.inTransit) {
        activePipIds.add(pip.id);
        const pos = pipPixelPosition(state, trail.path, pip);
        let el = pipElements.get(pip.id);
        if (!el) {
          el = document.createElement('div');
          el.className = `trail-pip ${colorClass}`;
          overlay.appendChild(el);
          pipElements.set(pip.id, el);
        }
        el.style.left = `${pos.x}px`;
        el.style.top = `${pos.y}px`;
      }
    }
  }

  for (const [id, el] of pipElements) {
    if (!activePipIds.has(id)) {
      el.remove();
      pipElements.delete(id);
    }
  }
}

// Pips travel from the resource node (path's last tile) to the nest (path's
// first tile) as eta counts down — interpolated as a straight line between
// the two endpoints rather than hugging every intermediate tile, which reads
// just as well at this map scale for a lot less complexity.
function pipPixelPosition(state, path, pip) {
  const progress = pip.totalEta > 0 ? Math.min(1, Math.max(0, 1 - pip.eta / pip.totalEta)) : 1;
  const nodeTile = state.map.tiles[path[path.length - 1]];
  const nestTile = state.map.tiles[path[0]];
  const nodePos = pixelForHex(nodeTile.q, nodeTile.r, HEX_SIZE);
  const nestPos = pixelForHex(nestTile.q, nestTile.r, HEX_SIZE);
  return {
    x: OFFSET + HEX_SIZE + nodePos.x + (nestPos.x - nodePos.x) * progress,
    y: OFFSET + HEX_SIZE + nodePos.y + (nestPos.y - nodePos.y) * progress,
  };
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

  if (ui.drawingTrail) {
    renderDrawingPanel(state, ui, panel);
    return;
  }

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
    const chamberIcon = iconSvg(CHAMBER_ICON_KEYS[tile.chamber.type] || 'storage', 'inline-icon');
    html += `<p>${chamberIcon} ${escapeHtml(chamberDef ? chamberDef.name : tile.chamber.type)} (${escapeHtml(tile.chamber.ownerColonyId)})</p>`;
  }
  if (tile.resourceNode) {
    const resourceIcon = iconSvg(RESOURCE_ICON_KEYS[tile.resourceNode.type], 'inline-icon');
    html += `<p>${resourceIcon} ${escapeHtml(tile.resourceNode.type)} — ${Math.floor(tile.resourceNode.amount)}/${tile.resourceNode.maxAmount}</p>`;
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
      html += '<button data-action="lay-trail">Auto-Route Trail Here (1 forager)</button>';
      html += '<button data-action="start-draw-trail">Draw Path Manually&hellip;</button>';
    }
  }

  html += '</div>';
  panel.innerHTML = html;
}

function renderDrawingPanel(state, ui, panel) {
  const { path, targetNodeKey } = ui.drawingTrail;
  const targetTile = state.map.tiles[targetNodeKey];
  const nextHops = nextHopCandidates(state, 'player', path);
  const canReachTarget = nextHops.includes(targetNodeKey);

  let html = '<h3>Drawing a Trail</h3>';
  html += `<p>${path.length} tile(s) so far, heading to a ${escapeHtml(targetTile.resourceNode.type)} node.</p>`;
  html += canReachTarget
    ? '<p class="hint">Tap the target node to finish, or keep extending the path.</p>'
    : '<p class="hint">Tap a <span class="hint-blue">pulsing blue</span> tile to extend the path.</p>';

  html += '<div class="actions">';
  html += '<button data-action="cancel-draw-trail">Cancel</button>';
  if (path.length > 1) html += '<button data-action="undo-draw-trail">Undo Last Tile</button>';
  html += '</div>';

  panel.innerHTML = html;
}

function renderLog(state) {
  document.getElementById('log').innerHTML = state.log
    .map((e) => `<div class="log-line"><b>C${Number(e.turn)}</b> ${escapeHtml(e.text)}</div>`)
    .join('');
}
