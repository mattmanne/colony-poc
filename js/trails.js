import { findPath } from './hexgrid.js';
import {
  TRAIL_BASE_CAPACITY, TRAIL_MAX_CAPACITY, TRAIL_UPGRADE_COST_MINERAL, MAX_GARRISON,
  NODE_REGEN_RATE, CONTESTED_LEAK_CHANCE, RAID_COOLDOWN_CYCLES,
} from './constants.js';
import { addLog } from './state.js';
import { availableForagers } from './colony.js';

let trailCounter = 0;

export function layTrail(state, colonyId, sourceChamberKey, resourceNodeKey) {
  const colony = state.colonies[colonyId];
  const destTile = state.map.tiles[resourceNodeKey];

  if (!destTile || !destTile.resourceNode) return { ok: false, reason: 'No resource node there.' };
  if (colony.trails.some((t) => t.path[t.path.length - 1] === resourceNodeKey)) {
    return { ok: false, reason: 'A trail already runs to that node.' };
  }
  if (availableForagers(state, colonyId) < TRAIL_BASE_CAPACITY) {
    return { ok: false, reason: 'No spare foragers to walk a new trail.' };
  }

  const isBlocked = (key) => {
    const t = state.map.tiles[key];
    return !t || t.terrain === 'water' || !t.discoveredBy[colonyId];
  };
  const path = findPath(sourceChamberKey, resourceNodeKey, isBlocked);
  if (!path) return { ok: false, reason: 'No known path to that node.' };

  const trail = {
    id: `trail_${colonyId}_${trailCounter++}`,
    ownerColonyId: colonyId,
    path,
    capacity: TRAIL_BASE_CAPACITY,
    garrison: 0,
    contested: false,
    inTransit: [],
  };
  colony.trails.push(trail);
  addLog(state, `${colonyId === 'player' ? 'You' : 'A rival colony'} laid a trail to a ${destTile.resourceNode.type} node (${path.length} tiles).`);
  return { ok: true, trail };
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

  for (const trail of colony.trails) {
    trail.contested = trail.path.some((key) => {
      const owner = state.map.tiles[key].owner;
      return owner && owner !== colonyId;
    });

    const destTile = state.map.tiles[trail.path[trail.path.length - 1]];
    const node = destTile.resourceNode;

    if (node && node.amount > 0) {
      const pickup = Math.min(trail.capacity, node.amount);
      if (pickup > 0) {
        node.amount -= pickup;
        trail.inTransit.push({ resourceType: node.type, amount: pickup, eta: pathLatency(state, colonyId, trail.path) });
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
      const canBattle = colonyId === 'player'
        && trail.garrison > 0
        && contester
        && contester.population.soldier > 0
        && contester.aiState.raidCooldown <= 0;

      if (canBattle) {
        contester.aiState.raidCooldown = RAID_COOLDOWN_CYCLES;
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
