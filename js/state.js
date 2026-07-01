import { generateMap, pickNestSites } from './mapgen.js';
import { keyOf, neighbors, hexDistance } from './hexgrid.js';
import {
  MAP_RADIUS, AP_PER_CYCLE, VISION_RADIUS,
  STARTING_RESOURCES, STARTING_STORAGE_CAP, STARTING_POPULATION, STARTING_POPULATION_CAP,
} from './constants.js';

export function getInitialState(seed) {
  const map = generateMap(seed, MAP_RADIUS);
  const nestSites = pickNestSites(map, 2);

  const colonies = {
    player: makeColony('player', true, nestSites[0]),
    rival_1: makeColony('rival_1', false, nestSites[1]),
  };

  const state = {
    version: 1,
    turn: 1,
    actionPointsRemaining: AP_PER_CYCLE,
    seed,
    map,
    colonies,
    log: [],
  };

  for (const colonyId of Object.keys(colonies)) {
    const colony = colonies[colonyId];
    const nestTile = map.tiles[colony.nestTile];
    nestTile.chamber = { id: `${colonyId}_nest`, type: 'nest', ownerColonyId: colonyId, builtOnTurn: 1 };
    nestTile.owner = colonyId;
    colony.chambers.push(colony.nestTile);
    revealAroundChambers(state, colonyId);
    claimTerritoryAroundChambers(state, colonyId);
  }

  addLog(state, 'Cycle 1 begins. Two colonies stir in the soil.');
  return state;
}

function makeColony(id, isPlayer, nestTile) {
  return {
    id,
    isPlayer,
    nestTile,
    resources: { ...STARTING_RESOURCES },
    storageCap: { ...STARTING_STORAGE_CAP },
    population: { ...STARTING_POPULATION },
    populationCap: STARTING_POPULATION_CAP,
    chambers: [],
    trails: [],
    aiState: isPlayer ? null : { raidCooldown: 0 },
  };
}

export function totalPopulation(colony) {
  return Object.values(colony.population).reduce((a, b) => a + b, 0);
}

export function addLog(state, text) {
  state.log.unshift({ turn: state.turn, text });
  if (state.log.length > 30) state.log.length = 30;
}

export function revealAroundChambers(state, colonyId) {
  const colony = state.colonies[colonyId];
  for (const chamberKey of colony.chambers) {
    const { q, r } = state.map.tiles[chamberKey];
    revealAround(state, colonyId, q, r, VISION_RADIUS);
  }
}

function revealAround(state, colonyId, q, r, radius) {
  for (const key of Object.keys(state.map.tiles)) {
    const tile = state.map.tiles[key];
    if (hexDistance({ q, r }, tile) <= radius) {
      tile.discoveredBy[colonyId] = true;
    }
  }
}

export function claimTerritoryAroundChambers(state, colonyId) {
  const colony = state.colonies[colonyId];
  for (const chamberKey of colony.chambers) {
    const selfTile = state.map.tiles[chamberKey];
    if (!selfTile.owner) selfTile.owner = colonyId;

    const { q, r } = selfTile;
    for (const n of neighbors(q, r)) {
      const tile = state.map.tiles[keyOf(n.q, n.r)];
      if (!tile) continue;
      if (!tile.owner) tile.owner = colonyId;
      else if (tile.owner !== colonyId) tile.owner = 'contested';
    }
  }
}
