import { keyOf, neighbors } from './hexgrid.js';
import { CHAMBER_TYPES } from './constants.js';
import { addLog, revealAroundChambers, claimTerritoryAroundChambers } from './state.js';
import { clampGarrisons } from './trails.js';

const CASTES = ['worker', 'forager', 'soldier', 'scout'];

export function canAffordChamber(colony, chamberType) {
  const cost = CHAMBER_TYPES[chamberType].digCost || {};
  return Object.entries(cost).every(([res, amt]) => (colony.resources[res] || 0) >= amt);
}

export function isAdjacentToOwnedChamber(state, colonyId, tileKey) {
  const { q, r } = state.map.tiles[tileKey];
  return neighbors(q, r).some((n) => {
    const nTile = state.map.tiles[keyOf(n.q, n.r)];
    return nTile && nTile.chamber && nTile.chamber.ownerColonyId === colonyId;
  });
}

export function digChamber(state, colonyId, tileKey, chamberType) {
  const colony = state.colonies[colonyId];
  const tile = state.map.tiles[tileKey];
  const def = CHAMBER_TYPES[chamberType];

  if (!tile || tile.chamber) return { ok: false, reason: 'That tile already has a chamber.' };
  if (tile.terrain === 'water') return { ok: false, reason: "Can't dig into water." };
  if (tile.resourceNode) return { ok: false, reason: "Can't dig into a resource node." };
  if (!isAdjacentToOwnedChamber(state, colonyId, tileKey)) {
    return { ok: false, reason: 'Must dig adjacent to an existing chamber.' };
  }
  if (!canAffordChamber(colony, chamberType)) return { ok: false, reason: 'Not enough resources.' };

  const cost = def.digCost || {};
  for (const [res, amt] of Object.entries(cost)) colony.resources[res] -= amt;

  tile.chamber = {
    id: `${colonyId}_${chamberType}_${tileKey}`,
    type: chamberType,
    ownerColonyId: colonyId,
    builtOnTurn: state.turn,
  };
  colony.chambers.push(tileKey);

  if (def.storageBonus) {
    for (const [res, amt] of Object.entries(def.storageBonus)) {
      colony.storageCap[res] = (colony.storageCap[res] || 0) + amt;
    }
  }
  if (def.populationCapBonus) {
    colony.populationCap += def.populationCapBonus;
  }
  colony.lifetimeStats.chambersBuilt += 1;

  revealAroundChambers(state, colonyId);
  claimTerritoryAroundChambers(state, colonyId);

  addLog(state, `${colonyId === 'player' ? 'You' : 'A rival colony'} dug a new ${def.name}.`);
  return { ok: true };
}

export function reassignCaste(state, colonyId, fromCaste, toCaste, amount) {
  const colony = state.colonies[colonyId];
  if (!CASTES.includes(fromCaste) || !CASTES.includes(toCaste)) {
    return { ok: false, reason: 'Invalid caste.' };
  }
  if ((colony.population[fromCaste] || 0) < amount) {
    return { ok: false, reason: `Not enough ${fromCaste} ants.` };
  }

  colony.population[fromCaste] -= amount;
  colony.population[toCaste] = (colony.population[toCaste] || 0) + amount;
  if (fromCaste === 'soldier') clampGarrisons(colony);
  addLog(state, `${colonyId === 'player' ? 'You' : 'A rival colony'} reassigned ${amount} ${fromCaste}(s) to ${toCaste}.`);
  return { ok: true };
}

export function availableForagers(state, colonyId) {
  const colony = state.colonies[colonyId];
  const assigned = colony.trails.reduce((sum, t) => sum + t.capacity, 0);
  return Math.max(0, colony.population.forager - assigned);
}
