import { keyOf, neighbors, hexDistance } from './hexgrid.js';
import { digChamber, reassignCaste, availableForagers } from './colony.js';
import { layTrail, upgradeTrailCapacity, assignGarrison, availableSoldiers } from './trails.js';
import { totalPopulation } from './state.js';
import { AP_PER_CYCLE, TRAIL_MAX_CAPACITY, MAX_GARRISON } from './constants.js';

// Reuses the same action functions (and AP budget) the player uses, so the
// rival is bound by the same rules and never "cheats" with hidden info.
export function runAiTurn(state, colonyId) {
  let ap = AP_PER_CYCLE;

  while (ap > 0) {
    if (tryExpandToRichestNode(state, colonyId)) { ap--; continue; }
    if (tryUpgradeBottleneckedTrail(state, colonyId)) { ap--; continue; }
    if (tryGarrisonContestedTrail(state, colonyId)) { ap--; continue; }
    if (tryDigChamber(state, colonyId)) { ap--; continue; }
    if (tryTrainSoldiers(state, colonyId)) { ap--; continue; }
    if (tryGrowForagers(state, colonyId)) { ap--; continue; }
    break;
  }
}

function tryExpandToRichestNode(state, colonyId) {
  const colony = state.colonies[colonyId];
  if (availableForagers(state, colonyId) < 1) return false;

  // Sugar keeps everyone alive; protein/mineral are useless if the colony
  // starves first. Left purely to "richest node wins", the AI would happily
  // stack up protein/mineral trails while sitting on zero sugar income and
  // slowly starve to death — so secure at least one sugar trail before
  // chasing whatever's objectively richest.
  const hasSugarTrail = colony.trails.some((t) => {
    const destTile = state.map.tiles[t.path[t.path.length - 1]];
    return destTile.resourceNode && destTile.resourceNode.type === 'sugar';
  });
  const needsSugar = !hasSugarTrail || colony.resources.sugar < 50;

  const candidates = [];
  for (const key of Object.keys(state.map.tiles)) {
    const tile = state.map.tiles[key];
    if (!tile.discoveredBy[colonyId] || !tile.resourceNode) continue;
    if (colony.trails.some((t) => t.path[t.path.length - 1] === key)) continue;

    const dist = hexDistance(state.map.tiles[colony.nestTile], tile);
    let score = tile.resourceNode.amount / Math.max(1, dist);
    if (needsSugar && tile.resourceNode.type === 'sugar') score *= 3;
    candidates.push({ key, score });
  }
  if (candidates.length === 0) return false;

  candidates.sort((a, b) => b.score - a.score);
  return layTrail(state, colonyId, colony.nestTile, candidates[0].key).ok;
}

function tryUpgradeBottleneckedTrail(state, colonyId) {
  const colony = state.colonies[colonyId];
  const bottlenecked = colony.trails.filter((t) => t.capacity < TRAIL_MAX_CAPACITY && t.inTransit.length >= t.capacity);
  if (bottlenecked.length === 0) return false;

  // A single low-capacity sugar trail can't keep pace with upkeep as a colony
  // grows — if sugar is tight, upgrading a sugar trail matters far more than
  // upgrading a protein/mineral one, even if the latter is also bottlenecked.
  const isLowSugar = colony.resources.sugar < 50;
  const trailType = (t) => state.map.tiles[t.path[t.path.length - 1]].resourceNode.type;
  const candidate = (isLowSugar && bottlenecked.find((t) => trailType(t) === 'sugar')) || bottlenecked[0];

  return upgradeTrailCapacity(state, colonyId, candidate.id).ok;
}

function tryGarrisonContestedTrail(state, colonyId) {
  const colony = state.colonies[colonyId];
  if (availableSoldiers(state, colonyId) < 1) return false;

  // Prioritize the contested trail carrying the richest node — losing that
  // one to a raid hurts most, so it's worth defending first.
  const candidates = colony.trails.filter((t) => t.contested && t.garrison < MAX_GARRISON);
  if (candidates.length === 0) return false;
  candidates.sort((a, b) => {
    const nodeOf = (t) => state.map.tiles[t.path[t.path.length - 1]].resourceNode;
    return (nodeOf(b)?.amount || 0) - (nodeOf(a)?.amount || 0);
  });

  return assignGarrison(state, colonyId, candidates[0].id, 1).ok;
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
      if (tile && !tile.chamber && !tile.resourceNode && tile.terrain !== 'water' && tile.discoveredBy[colonyId]) {
        // Try every candidate tile, not just the first found — the first one
        // failing (e.g. it happens to be unaffordable this turn even though
        // affordability was already checked above — a defensive fallback)
        // shouldn't stop the AI from digging elsewhere.
        const result = digChamber(state, colonyId, key, chamberType);
        if (result.ok) return true;
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
