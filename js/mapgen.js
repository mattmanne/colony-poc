import { tilesInRadius, keyOf, hexDistance } from './hexgrid.js';
import { mulberry32 } from './rng.js';
import { RESOURCE_NODE_TYPES, NODE_AMOUNT, MAP_RADIUS } from './constants.js';

export function generateMap(seed, radius = MAP_RADIUS) {
  const rand = mulberry32(seed);
  const coords = tilesInRadius(radius);
  const tiles = {};

  for (const { q, r } of coords) {
    let terrain = 'soil';
    const roll = rand();
    if (roll < 0.06) terrain = 'water';
    else if (roll < 0.14) terrain = 'rock';

    tiles[keyOf(q, r)] = {
      q, r, terrain,
      resourceNode: null,
      owner: null,
      discoveredBy: {},
      chamber: null,
    };
  }

  for (const key of Object.keys(tiles)) {
    const tile = tiles[key];
    if (tile.terrain !== 'soil') continue;
    if (rand() < 1 / 7) {
      const type = RESOURCE_NODE_TYPES[Math.floor(rand() * RESOURCE_NODE_TYPES.length)];
      tile.resourceNode = { type, amount: NODE_AMOUNT[type], maxAmount: NODE_AMOUNT[type] };
    }
  }

  return { radius, tiles };
}

// Places `count` nest sites roughly evenly spaced near the map's edge,
// snapped to the nearest empty soil tile.
export function pickNestSites(map, count) {
  const targetDist = Math.floor(map.radius * 0.7);
  const angleStep = (Math.PI * 2) / count;
  const sites = [];
  const used = new Set();

  for (let i = 0; i < count; i++) {
    const angle = angleStep * i;
    const targetQ = Math.round(targetDist * Math.cos(angle));
    const targetR = Math.round(targetDist * Math.sin(angle) - targetQ / 2);

    let best = null;
    let bestDist = Infinity;
    for (const key of Object.keys(map.tiles)) {
      if (used.has(key)) continue;
      const tile = map.tiles[key];
      if (tile.terrain !== 'soil' || tile.resourceNode) continue;
      const d = hexDistance({ q: targetQ, r: targetR }, tile);
      if (d < bestDist) {
        bestDist = d;
        best = key;
      }
    }
    used.add(best);
    sites.push(best);
  }
  return sites;
}
