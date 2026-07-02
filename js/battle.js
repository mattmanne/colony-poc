import { addLog } from './state.js';
import { deliverPip, clampGarrisons } from './trails.js';

const GRID_SIZE = 5;
const SOLDIER_STATS = { atk: 3, hp: 6, move: 1 };
const FORAGER_STATS = { atk: 0, hp: 3, move: 1 };

function makeUnit(id, side, type, x, y, atkBonus) {
  const stats = type === 'soldier' ? SOLDIER_STATS : FORAGER_STATS;
  return {
    id, side, type, x, y,
    hp: stats.hp, maxHp: stats.hp,
    atk: stats.atk + (atkBonus || 0),
    move: stats.move,
    alive: true, escaped: false,
  };
}

// `pending` is one entry from state.pendingBattles: { trailId, defenderColonyId, attackerColonyId, pips }
export function createBattle(state, pending) {
  const defenderColony = state.colonies[pending.defenderColonyId];
  const attackerColony = state.colonies[pending.attackerColonyId];
  const trail = defenderColony.trails.find((t) => t.id === pending.trailId);
  const garrison = trail ? trail.garrison : 0;
  // Elite bonus is a property of whichever colony trained the soldiers, not
  // of which side of this particular fight they end up on — a colony that
  // unlocked elite_soldier should get +1 atk whether it's raiding or being
  // raided.
  const defenderEliteBonus = defenderColony.traits.includes('elite_soldier') ? 1 : 0;
  const attackerEliteBonus = attackerColony.traits.includes('elite_soldier') ? 1 : 0;

  // Start columns 1 tile apart from the grid edges (distance 2 across the
  // middle) so units can close in and actually fight within the beat budget
  // — starting at the far edges (distance 4) left no beats left to attack.
  const units = [];
  units.push(makeUnit('d0', 'defender', 'forager', 1, 2));
  const defenderSoldierYs = [1, 3];
  for (let i = 0; i < garrison; i++) {
    units.push(makeUnit(`d${i + 1}`, 'defender', 'soldier', 1, defenderSoldierYs[i], defenderEliteBonus));
  }

  const attackerCount = Math.min(3, attackerColony.population.soldier);
  const attackerYs = [1, 2, 3];
  for (let i = 0; i < attackerCount; i++) {
    units.push(makeUnit(`a${i}`, 'attacker', 'soldier', GRID_SIZE - 2, attackerYs[i], attackerEliteBonus));
  }

  const battle = {
    pending,
    gridSize: GRID_SIZE,
    obstacles: [{ x: 2, y: 2 }],
    units,
    // 6 total beats (3 per side), alternating. Sides with fewer than 3 living
    // units cycle through them round-robin rather than running out of turns
    // early — otherwise a 1v1 or 2v2 skirmish could end after one move each,
    // before either side is ever close enough to fight.
    beatsRemaining: 6,
    nextSide: 'defender',
    defenderPointer: 0,
    attackerPointer: 0,
    finished: false,
    outcome: null,
    log: ['A raiding party intercepts your shipment!'],
  };

  autoPlayAttackerTurns(battle);
  return battle;
}

function livingUnitsOfSide(battle, side) {
  return battle.units.filter((u) => u.side === side && u.alive && !u.escaped);
}

function advanceBeat(battle) {
  if (battle.nextSide === 'defender') {
    battle.defenderPointer += 1;
    battle.nextSide = 'attacker';
  } else {
    battle.attackerPointer += 1;
    battle.nextSide = 'defender';
  }
  battle.beatsRemaining -= 1;
}

export function getCurrentActor(battle) {
  while (battle.beatsRemaining > 0 && !battle.finished) {
    const sideUnits = livingUnitsOfSide(battle, battle.nextSide);
    if (sideUnits.length === 0) {
      advanceBeat(battle);
      continue;
    }
    const pointer = battle.nextSide === 'defender' ? battle.defenderPointer : battle.attackerPointer;
    return sideUnits[pointer % sideUnits.length];
  }
  return null;
}

function isObstacle(battle, x, y) {
  return battle.obstacles.some((o) => o.x === x && o.y === y);
}

function unitAt(battle, x, y) {
  return battle.units.find((u) => u.alive && !u.escaped && u.x === x && u.y === y);
}

export function movesInRange(battle, unit) {
  const moves = [];
  for (let dx = -unit.move; dx <= unit.move; dx++) {
    for (let dy = -unit.move; dy <= unit.move; dy++) {
      if (dx === 0 && dy === 0) continue;
      const x = unit.x + dx;
      const y = unit.y + dy;
      if (x < 0 || y < 0 || x >= battle.gridSize || y >= battle.gridSize) continue;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > unit.move) continue;
      if (isObstacle(battle, x, y) || unitAt(battle, x, y)) continue;
      moves.push({ x, y });
    }
  }
  return moves;
}

export function adjacentEnemies(battle, unit) {
  return battle.units.filter((u) => u.alive && !u.escaped && u.side !== unit.side
    && Math.max(Math.abs(u.x - unit.x), Math.abs(u.y - unit.y)) <= 1);
}

export function moveUnit(battle, unitId, x, y) {
  const unit = battle.units.find((u) => u.id === unitId);
  unit.x = x;
  unit.y = y;
  battle.log.unshift(`${labelFor(unit)} moves.`);
  endActorTurn(battle);
}

export function attackUnit(battle, attackerId, targetId) {
  const attacker = battle.units.find((u) => u.id === attackerId);
  const target = battle.units.find((u) => u.id === targetId);
  target.hp -= attacker.atk;
  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
    battle.log.unshift(`${labelFor(attacker)} kills ${labelFor(target)}!`);
  } else {
    battle.log.unshift(`${labelFor(attacker)} hits ${labelFor(target)} for ${attacker.atk}.`);
  }
  endActorTurn(battle);
}

export function passTurn(battle) {
  endActorTurn(battle);
}

function labelFor(unit) {
  const side = unit.side === 'defender' ? 'Your' : 'Raider';
  const type = unit.type === 'forager' ? 'forager' : 'soldier';
  return `${side} ${type}`;
}

function endActorTurn(battle) {
  advanceBeat(battle);
  checkBattleOver(battle);
  if (!battle.finished) autoPlayAttackerTurns(battle);
}

function autoPlayAttackerTurns(battle) {
  let actor = getCurrentActor(battle);
  while (actor && actor.side === 'attacker' && !battle.finished) {
    aiActUnit(battle, actor);
    advanceBeat(battle);
    checkBattleOver(battle);
    actor = getCurrentActor(battle);
  }
}

function aiActUnit(battle, unit) {
  const enemies = adjacentEnemies(battle, unit);
  if (enemies.length > 0) {
    const forager = enemies.find((e) => e.type === 'forager');
    const target = forager || enemies[0];
    attackUnitInPlace(battle, unit, target);
    return;
  }

  const forager = battle.units.find((u) => u.type === 'forager' && u.alive && !u.escaped);
  if (!forager) return;

  const dx = Math.sign(forager.x - unit.x);
  const dy = Math.sign(forager.y - unit.y);
  const candidates = [{ x: unit.x + dx, y: unit.y + dy }, { x: unit.x + dx, y: unit.y }, { x: unit.x, y: unit.y + dy }];
  for (const c of candidates) {
    if (c.x === unit.x && c.y === unit.y) continue;
    if (c.x < 0 || c.y < 0 || c.x >= battle.gridSize || c.y >= battle.gridSize) continue;
    if (isObstacle(battle, c.x, c.y) || unitAt(battle, c.x, c.y)) continue;
    unit.x = c.x;
    unit.y = c.y;
    battle.log.unshift(`${labelFor(unit)} closes in.`);
    return;
  }
}

// Attack that doesn't call endActorTurn — the caller (autoPlayAttackerTurns) advances the slot itself.
function attackUnitInPlace(battle, attacker, target) {
  target.hp -= attacker.atk;
  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
    battle.log.unshift(`${labelFor(attacker)} kills ${labelFor(target)}!`);
  } else {
    battle.log.unshift(`${labelFor(attacker)} hits ${labelFor(target)} for ${attacker.atk}.`);
  }
}

// Non-interactive defender behavior, used when the defending colony isn't
// the player (an auto-resolved battle — see autoResolveBattle below). Mirrors
// the attacker's aiActUnit but inverted: the forager runs from danger instead
// of chasing an objective, and soldiers screen for it instead of hunting it.
function defenderAiAct(battle, unit) {
  const enemies = adjacentEnemies(battle, unit);
  if (unit.type === 'soldier' && enemies.length > 0) {
    attackUnit(battle, unit.id, enemies[0].id);
    return;
  }

  const nearestAttacker = battle.units
    .filter((u) => u.side === 'attacker' && u.alive)
    .sort((a, b) => chebyshev(unit, a) - chebyshev(unit, b))[0];
  if (!nearestAttacker) {
    passTurn(battle);
    return;
  }

  const moves = movesInRange(battle, unit);
  let best = null;
  // Foragers maximize distance from the nearest threat; soldiers close in on it.
  let bestScore = unit.type === 'forager' ? -Infinity : Infinity;
  for (const m of moves) {
    const d = Math.max(Math.abs(nearestAttacker.x - m.x), Math.abs(nearestAttacker.y - m.y));
    if (unit.type === 'forager' ? d > bestScore : d < bestScore) {
      bestScore = d;
      best = m;
    }
  }

  if (best) moveUnit(battle, unit.id, best.x, best.y);
  else passTurn(battle);
}

function chebyshev(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

// Plays out a battle where the defender isn't the player (rival-vs-rival, or
// the player raiding a rival's garrisoned trail) start to finish, with no UI
// involved, then applies the outcome. Returns the finished battle.
export function autoResolveBattle(state, pending) {
  const battle = createBattle(state, pending);
  let guard = 0;
  while (!battle.finished && guard < 20) {
    const actor = getCurrentActor(battle);
    if (!actor) break;
    if (actor.side === 'defender') defenderAiAct(battle, actor);
    guard += 1;
  }
  resolveBattleOutcome(state, battle);
  return battle;
}

function checkBattleOver(battle) {
  const forager = battle.units.find((u) => u.type === 'forager');
  const attackersAlive = battle.units.filter((u) => u.side === 'attacker' && u.alive);

  if (!forager.alive) {
    battle.finished = true;
    battle.outcome = 'attacker';
  } else if (attackersAlive.length === 0) {
    battle.finished = true;
    battle.outcome = 'defender';
  } else if (battle.beatsRemaining <= 0) {
    battle.finished = true;
    battle.outcome = forager.alive ? 'defender' : 'attacker';
  }
}

// Applies casualties, delivers or drops the contested shipment, and logs the result.
export function resolveBattleOutcome(state, battle) {
  const { defenderColonyId, attackerColonyId, trailId, pips } = battle.pending;
  const defenderColony = state.colonies[defenderColonyId];
  const attackerColony = state.colonies[attackerColonyId];

  const defenderDead = battle.units.filter((u) => u.side === 'defender' && u.type === 'soldier' && !u.alive).length;
  const attackerDead = battle.units.filter((u) => u.side === 'attacker' && !u.alive).length;
  defenderColony.population.soldier = Math.max(0, defenderColony.population.soldier - defenderDead);
  attackerColony.population.soldier = Math.max(0, attackerColony.population.soldier - attackerDead);
  clampGarrisons(defenderColony);
  clampGarrisons(attackerColony);

  const defenderLabel = defenderColonyId === 'player' ? 'You' : 'A rival colony';
  const attackerLabel = attackerColonyId === 'player' ? 'you' : 'a rival colony';

  if (battle.outcome === 'defender') {
    const trail = defenderColony.trails.find((t) => t.id === trailId);
    for (const pip of pips) deliverPip(state, defenderColony, trail || { path: [] }, pip);
    defenderColony.lifetimeStats.battlesWon += 1;
    addLog(state, `${defenderLabel} fought off a raid by ${attackerLabel} and saved the shipment! (${attackerDead} raider(s) killed, ${defenderDead} defender(s) lost)`);
  } else {
    addLog(state, `${defenderLabel} was raided by ${attackerLabel} and lost the shipment. (${attackerDead} raider(s) killed, ${defenderDead} defender(s) lost)`);
  }
}
