import { generateMap, pickNestSites } from './mapgen.js';
import { keyOf, neighbors, hexDistance } from './hexgrid.js';
import {
  MAP_RADIUS, AP_PER_CYCLE, VISION_RADIUS, SAVE_VERSION,
  STARTING_RESOURCES, STARTING_STORAGE_CAP, STARTING_POPULATION, STARTING_POPULATION_CAP,
} from './constants.js';

export function getInitialState(seed) {
  const map = generateMap(seed, MAP_RADIUS);
  const nestSites = pickNestSites(map, 3);

  const colonies = {
    player: makeColony('player', true, nestSites[0]),
    rival_1: makeColony('rival_1', false, nestSites[1]),
    rival_2: makeColony('rival_2', false, nestSites[2]),
  };

  const state = {
    version: SAVE_VERSION,
    turn: 1,
    actionPointsRemaining: AP_PER_CYCLE,
    seed,
    map,
    colonies,
    pendingBattles: [],
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

  addLog(state, 'Cycle 1 begins. Three colonies stir in the soil.');
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
    traits: [],
    lifetimeStats: { resourcesHarvested: 0, battlesWon: 0, chambersBuilt: 0, longTrailCycles: 0 },
    // Any colony can now be a raid's attacker (garrisoned trails can be
    // defended by rivals too, and the player can be the one contesting a
    // rival's trail via territory overlap), so the cooldown that prevents
    // being raided every single cycle applies to everyone, not just rivals.
    raidCooldown: 0,
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
