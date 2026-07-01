import {
  findPath, parseKey, hexDistance, neighbors, keyOf,
} from './hexgrid.js';
import {
  TRAIL_BASE_CAPACITY, TRAIL_MAX_CAPACITY, TRAIL_UPGRADE_COST_MINERAL, MAX_GARRISON,
  NODE_REGEN_RATE, CONTESTED_LEAK_CHANCE, RAID_COOLDOWN_CYCLES,
} from './constants.js';
import { addLog } from './state.js';
import { availableForagers } from './colony.js';

let trailCounter = 0;
let pipCounter = 0;

// Shared by the auto-routed (layTrail) and player-drawn (layTrailManual)
// entry points — both end up with a concrete tile-by-tile path; this is what
// actually validates it and creates the trail.
function createTrailFromPath(state, colonyId, path) {
  const colony = state.colonies[colonyId];
  if (!path || path.length === 0) return { ok: false, reason: 'Invalid path.' };

  const sourceTile = state.map.tiles[path[0]];
  if (!sourceTile || !sourceTile.chamber || sourceTile.chamber.ownerColonyId !== colonyId) {
    return { ok: false, reason: 'A trail must start at one of your chambers.' };
  }

  const destKey = path[path.length - 1];
  const destTile = state.map.tiles[destKey];
  if (!destTile || !destTile.resourceNode) return { ok: false, reason: 'A trail must end at a resource node.' };
  if (colony.trails.some((t) => t.path[t.path.length - 1] === destKey)) {
    return { ok: false, reason: 'A trail already runs to that node.' };
  }
  if (availableForagers(state, colonyId) < TRAIL_BASE_CAPACITY) {
    return { ok: false, reason: 'No spare foragers to walk a new trail.' };
  }

  for (let i = 0; i < path.length; i++) {
    const tile = state.map.tiles[path[i]];
    if (!tile || tile.terrain === 'water' || !tile.discoveredBy[colonyId]) {
      return { ok: false, reason: 'Path crosses unknown or impassable ground.' };
    }
    if (i > 0 && hexDistance(parseKey(path[i - 1]), parseKey(path[i])) !== 1) {
      return { ok: false, reason: 'Path tiles must be adjacent to each other.' };
    }
  }

  const trail = {
    id: `trail_${colonyId}_${trailCounter++}`,
    ownerColonyId: colonyId,
    path: [...path],
    capacity: TRAIL_BASE_CAPACITY,
    garrison: 0,
    contested: false,
    inTransit: [],
  };
  colony.trails.push(trail);
  addLog(state, `${colonyId === 'player' ? 'You' : 'A rival colony'} laid a trail to a ${destTile.resourceNode.type} node (${path.length} tiles).`);
  return { ok: true, trail };
}

export function layTrail(state, colonyId, sourceChamberKey, resourceNodeKey) {
  const destTile = state.map.tiles[resourceNodeKey];
  if (!destTile || !destTile.resourceNode) return { ok: false, reason: 'No resource node there.' };

  const isBlocked = (key) => {
    const t = state.map.tiles[key];
    return !t || t.terrain === 'water' || !t.discoveredBy[colonyId];
  };
  const path = findPath(sourceChamberKey, resourceNodeKey, isBlocked);
  if (!path) return { ok: false, reason: 'No known path to that node.' };

  return createTrailFromPath(state, colonyId, path);
}

// Player-drawn alternative to layTrail's auto-routing — `path` is the exact
// tile-by-tile sequence the player tapped out, letting them route around a
// rival's territory or through a specific corridor instead of always taking
// the shortest path.
export function layTrailManual(state, colonyId, path) {
  return createTrailFromPath(state, colonyId, path);
}

// Which tiles can legally extend a trail being drawn one tap at a time —
// neighbors of the path's current end that are discovered, walkable, and not
// already part of the path (no doubling back on yourself).
export function nextHopCandidates(state, colonyId, path) {
  const { q, r } = parseKey(path[path.length - 1]);
  const used = new Set(path);
  return neighbors(q, r)
    .map((n) => keyOf(n.q, n.r))
    .filter((key) => {
      const tile = state.map.tiles[key];
      return tile && tile.terrain !== 'water' && tile.discoveredBy[colonyId] && !used.has(key);
    });
}

export function upgradeTrailCapacity(state, colonyId, trailId) {
  const colony = state.colonies[colonyId];
  const trail = colony.trails.find((t) => t.id === trailId);

  if (!trail) return { ok: false, reason: 'Trail not found.' };
  if (trail.capacity >= TRAIL_MAX_CAPACITY) return { ok: false, reason: 'Trail already at max capacity.' };
  if ((colony.resources.mineral || 0) < TRAIL_UPGRADE_COST_MINERAL) return { ok: false, reason: 'Not enough mineral.' };
  if (availableForagers(state, colonyId) < 1) return { ok: false, reason: 'No spare foragers to staff the upgrade.' };

  colony.resources.mineral -= TRAIL_UPGRADE_COST_MINERAL;
  trail.capacity += 1;
  addLog(state, `${colonyId === 'player' ? 'You' : 'A rival colony'} upgraded a trail to capacity ${trail.capacity}.`);
  return { ok: true };
}

export function availableSoldiers(state, colonyId) {
  const colony = state.colonies[colonyId];
  const garrisoned = colony.trails.reduce((sum, t) => sum + t.garrison, 0);
  return Math.max(0, colony.population.soldier - garrisoned);
}

export function assignGarrison(state, colonyId, trailId, amount) {
  const colony = state.colonies[colonyId];
  const trail = colony.trails.find((t) => t.id === trailId);

  if (!trail) return { ok: false, reason: 'Trail not found.' };
  if (trail.garrison >= MAX_GARRISON) return { ok: false, reason: 'Trail is already fully garrisoned.' };
  if (availableSoldiers(state, colonyId) < amount) return { ok: false, reason: 'Not enough spare soldiers.' };

  trail.garrison = Math.min(MAX_GARRISON, trail.garrison + amount);
  addLog(state, `${colonyId === 'player' ? 'You' : 'A rival colony'} garrisoned a trail with ${amount} soldier(s).`);
  return { ok: true };
}

// Soldiers can be lost outside of assignGarrison (starvation desertion, battle
// casualties) without the trails they were garrisoned on being told — without
// this, a battle could later spawn more defender units than the colony
// actually has soldiers for. Call after anything that reduces population.soldier.
export function clampGarrisons(colony) {
  let excess = colony.trails.reduce((sum, t) => sum + t.garrison, 0) - colony.population.soldier;
  if (excess <= 0) return;
  for (const trail of colony.trails) {
    if (excess <= 0) break;
    const reduce = Math.min(trail.garrison, excess);
    trail.garrison -= reduce;
    excess -= reduce;
  }
}

function pathLatency(state, colonyId, path) {
  const colony = state.colonies[colonyId];
  const base = Math.max(1, Math.ceil(path.length / 2));
  return colony.traits.includes('waystations') ? Math.max(1, base - 1) : base;
}

function findContestingColonyId(state, trail) {
  for (const key of trail.path) {
    const owner = state.map.tiles[key].owner;
    if (owner && owner !== trail.ownerColonyId && owner !== 'contested') return owner;
  }
  return null;
}

export function resolveTrailsForColony(state, colonyId) {
  const colony = state.colonies[colonyId];
  // Capacity is only checked against forager supply at lay/upgrade time; if
  // foragers later die (starvation, etc.) trails would otherwise keep running
  // at full capacity with foragers that no longer exist. Throttle by whatever
  // forager budget is actually left, without touching the stored capacity
  // itself — that's the player's paid-for upgrade, not something to erase.
  let foragerBudget = colony.population.forager;

  for (const trail of colony.trails) {
    trail.contested = trail.path.some((key) => {
      const owner = state.map.tiles[key].owner;
      return owner && owner !== colonyId;
    });

    const destTile = state.map.tiles[trail.path[trail.path.length - 1]];
    const node = destTile.resourceNode;
    const effectiveCapacity = Math.min(trail.capacity, foragerBudget);
    foragerBudget -= effectiveCapacity;

    if (node && node.amount > 0) {
      const pickup = Math.min(effectiveCapacity, node.amount);
      if (pickup > 0) {
        node.amount -= pickup;
        const latency = pathLatency(state, colonyId, trail.path);
        // `id` gives the renderer a stable identity to animate against across
        // frames; `totalEta` (fixed) alongside the countdown `eta` lets it
        // compute how far along the path this pip currently is.
        trail.inTransit.push({
          id: `pip_${pipCounter++}`, resourceType: node.type, amount: pickup, eta: latency, totalEta: latency,
        });
      }
    }
    if (node) {
      const regen = NODE_REGEN_RATE[node.type] || 0;
      node.amount = Math.min(node.maxAmount, node.amount + regen);
    }

    const arrived = [];
    trail.inTransit = trail.inTransit.filter((pip) => {
      pip.eta -= 1;
      if (pip.eta <= 0) {
        arrived.push(pip);
        return false;
      }
      return true;
    });

    if (arrived.length === 0) continue;

    if (trail.contested) {
      const contesterId = findContestingColonyId(state, trail);
      const contester = contesterId && state.colonies[contesterId];
      // Any colony can defend a garrisoned trail now — the player defending
      // is played out interactively, anyone else is auto-resolved (see
      // cycle.js). Either way, whoever holds the trail needs a garrison, and
      // whoever's contesting it needs spare soldiers and an expired cooldown.
      const canBattle = trail.garrison > 0
        && contester
        && contester.population.soldier > 0
        && contester.raidCooldown <= 0;

      if (canBattle) {
        contester.raidCooldown = RAID_COOLDOWN_CYCLES;
        state.pendingBattles.push({
          trailId: trail.id,
          defenderColonyId: colonyId,
          attackerColonyId: contesterId,
          pips: arrived,
        });
        continue;
      }

      for (const pip of arrived) {
        if (Math.random() < CONTESTED_LEAK_CHANCE) {
          addLog(state, `${colonyId === 'player' ? 'Your' : "A rival's"} contested trail lost ${pip.amount} ${pip.resourceType} to raiders.`);
        } else {
          deliverPip(state, colony, trail, pip);
        }
      }
    } else {
      for (const pip of arrived) deliverPip(state, colony, trail, pip);
    }
  }
}

export function deliverPip(state, colony, trail, pip) {
  const cap = colony.storageCap[pip.resourceType] || 0;
  colony.resources[pip.resourceType] = Math.min(cap, (colony.resources[pip.resourceType] || 0) + pip.amount);
  colony.lifetimeStats.resourcesHarvested += pip.amount;
  if (trail.path.length >= 6) colony.lifetimeStats.longTrailCycles += 1;
}
