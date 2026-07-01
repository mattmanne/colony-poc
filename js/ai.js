import { keyOf, neighbors, hexDistance } from './hexgrid.js';
import { digChamber, reassignCaste, availableForagers } from './colony.js';
import { layTrail, upgradeTrailCapacity } from './trails.js';
import { totalPopulation } from './state.js';
import { AP_PER_CYCLE } from './constants.js';

// Reuses the same action functions (and AP budget) the player uses, so the
// rival is bound by the same rules and never "cheats" with hidden info.
export function runAiTurn(state, colonyId) {
  let ap = AP_PER_CYCLE;

  while (ap > 0) {
    if (tryExpandToRichestNode(state, colonyId)) { ap--; continue; }
    if (tryUpgradeBottleneckedTrail(state, colonyId)) { ap--; continue; }
    if (tryDigChamber(state, colonyId)) { ap--; continue; }
    if (tryTrainSoldiers(state, colonyId)) { ap--; continue; }
    if (tryGrowForagers(state, colonyId)) { ap--; continue; }
    break;
  }
}

function tryExpandToRichestNode(state, colonyId) {
  const colony = state.colonies[colonyId];
  if (availableForagers(state, colonyId) < 1) return false;

  const candidates = [];
  for (const key of Object.keys(state.map.tiles)) {
    const tile = state.map.tiles[key];
    if (!tile.discoveredBy[colonyId] || !tile.resourceNode) continue;
    if (colony.trails.some((t) => t.path[t.path.length - 1] === key)) continue;

    const dist = hexDistance(state.map.tiles[colony.nestTile], tile);
    candidates.push({ key, score: tile.resourceNode.amount / Math.max(1, dist) });
  }
  if (candidates.length === 0) return false;

  candidates.sort((a, b) => b.score - a.score);
  return layTrail(state, colonyId, colony.nestTile, candidates[0].key).ok;
}

function tryUpgradeBottleneckedTrail(state, colonyId) {
  const colony = state.colonies[colonyId];
  const candidate = colony.trails.find((t) => t.capacity < 3 && t.inTransit.length >= t.capacity);
  if (!candidate) return false;
  return upgradeTrailCapacity(state, colonyId, candidate.id).ok;
}

function tryDigChamber(state, colonyId) {
  const colony = state.colonies[colonyId];
  const pop = totalPopulation(colony);
  const hasFarm = colony.chambers.some((key) => state.map.tiles[key].chamber.type === 'farm');

  let chamberType = null;
  if (pop >= colony.populationCap - 2) chamberType = 'nursery';
  else if (!hasFarm && colony.resources.mineral > 15) chamberType = 'farm';
  else if (colony.resources.mineral > 40) chamberType = 'storage';
  if (!chamberType) return false;

  for (const chamberKey of colony.chambers) {
    const { q, r } = state.map.tiles[chamberKey];
    for (const n of neighbors(q, r)) {
      const key = keyOf(n.q, n.r);
      const tile = state.map.tiles[key];
      if (tile && !tile.chamber && tile.terrain !== 'water' && tile.discoveredBy[colonyId]) {
        return digChamber(state, colonyId, key, chamberType).ok;
      }
    }
  }
  return false;
}

function tryTrainSoldiers(state, colonyId) {
  const colony = state.colonies[colonyId];
  if (colony.population.worker > 4 && colony.population.soldier < 3 && colony.resources.fungus > 10) {
    return reassignCaste(state, colonyId, 'worker', 'soldier', 1).ok;
  }
  return false;
}

function tryGrowForagers(state, colonyId) {
  const colony = state.colonies[colonyId];
  if (colony.population.worker > 3 && availableForagers(state, colonyId) < 1) {
    return reassignCaste(state, colonyId, 'worker', 'forager', 1).ok;
  }
  return false;
}
