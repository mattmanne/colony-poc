import { isAdjacentToOwnedChamber } from '../js/colony.js';
import { getInitialState } from '../js/state.js';

export function findDiscoveredResourceNode(state, colonyId) {
  for (const [key, tile] of Object.entries(state.map.tiles)) {
    if (tile.discoveredBy[colonyId] && tile.resourceNode) return key;
  }
  return null;
}

// A freshly-spawned colony's starting vision radius is small enough that some
// seeds reveal zero resource nodes at turn 1 (worth a game-design look — see
// the improvements list — but tests need to be robust to it regardless).
// Tries nearby seeds until one starts with a visible node for the player.
export function getInitialStateWithVisibleNode(seed) {
  for (let s = seed; s < seed + 50; s++) {
    const state = getInitialState(s);
    if (findDiscoveredResourceNode(state, 'player')) return state;
  }
  throw new Error(`No seed in [${seed}, ${seed + 50}) starts with a visible resource node`);
}

export function findDiggableTile(state, colonyId) {
  for (const key of Object.keys(state.map.tiles)) {
    const tile = state.map.tiles[key];
    if (!tile.chamber && !tile.resourceNode && tile.terrain !== 'water'
      && isAdjacentToOwnedChamber(state, colonyId, key)) {
      return key;
    }
  }
  return null;
}

export function findWaterTile(state) {
  for (const [key, tile] of Object.entries(state.map.tiles)) {
    if (tile.terrain === 'water') return key;
  }
  return null;
}
