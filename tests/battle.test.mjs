import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getInitialState } from '../js/state.js';
import {
  createBattle, getCurrentActor, movesInRange, adjacentEnemies, moveUnit, attackUnit, passTurn, resolveBattleOutcome,
  autoResolveBattle,
} from '../js/battle.js';

function makePending(state, garrison, attackerSoldiers) {
  const player = state.colonies.player;
  player.trails.push({ id: 'test-trail', garrison, capacity: 1, contested: true, path: ['x'] });
  state.colonies.rival_1.population.soldier = attackerSoldiers;
  return {
    trailId: 'test-trail', defenderColonyId: 'player', attackerColonyId: 'rival_1',
    pips: [{ resourceType: 'sugar', amount: 10 }],
  };
}

test('createBattle spawns a forager plus garrison soldiers for the defender, capped at attacker soldier count', () => {
  const state = getInitialState(50);
  const pending = makePending(state, 2, 5);
  const battle = createBattle(state, pending);

  const defenders = battle.units.filter((u) => u.side === 'defender');
  const attackers = battle.units.filter((u) => u.side === 'attacker');
  assert.equal(defenders.length, 3, '1 forager + 2 garrisoned soldiers');
  assert.equal(attackers.length, 3, 'capped at 3 even though rival has 5 soldiers');
  assert.equal(defenders.filter((u) => u.type === 'forager').length, 1);
});

test('createBattle applies the elite_soldier trait as an attack bonus to defender soldiers only', () => {
  const state = getInitialState(51);
  state.colonies.player.traits.push('elite_soldier');
  const pending = makePending(state, 1, 1);
  const battle = createBattle(state, pending);

  const defSoldier = battle.units.find((u) => u.side === 'defender' && u.type === 'soldier');
  const atkSoldier = battle.units.find((u) => u.side === 'attacker');
  assert.equal(defSoldier.atk, 4); // base 3 + 1 elite bonus
  assert.equal(atkSoldier.atk, 3);
});

test('movesInRange stays within grid bounds and avoids obstacles/occupied tiles', () => {
  const state = getInitialState(52);
  const pending = makePending(state, 1, 1);
  const battle = createBattle(state, pending);
  const actor = getCurrentActor(battle);

  const moves = movesInRange(battle, actor);
  for (const m of moves) {
    assert.ok(m.x >= 0 && m.x < battle.gridSize && m.y >= 0 && m.y < battle.gridSize);
    assert.ok(!battle.obstacles.some((o) => o.x === m.x && o.y === m.y));
  }
});

test('a full battle resolves within the 6-beat cap and always produces an outcome', () => {
  const state = getInitialState(53);
  const pending = makePending(state, 2, 2);
  const battle = createBattle(state, pending);

  let guard = 0;
  while (!battle.finished && guard < 20) {
    const actor = getCurrentActor(battle);
    if (!actor) break;
    if (actor.side === 'defender') {
      if (actor.type === 'forager') passTurn(battle);
      else {
        const enemies = adjacentEnemies(battle, actor);
        if (enemies.length > 0) attackUnit(battle, actor.id, enemies[0].id);
        else {
          const moves = movesInRange(battle, actor);
          if (moves.length > 0) moveUnit(battle, actor.id, moves[0].x, moves[0].y);
          else passTurn(battle);
        }
      }
    }
    guard++;
  }

  assert.equal(battle.finished, true);
  assert.ok(['defender', 'attacker'].includes(battle.outcome));
  assert.ok(guard <= 6, 'should never need more than 6 defender-side turns to resolve');
});

test('regression: a 1v1 skirmish can actually reach combat instead of always timing out (battle-pacing bug)', () => {
  // With move=1 units and tight starting positions, a soldier that holds the
  // forager back and engages should be able to land at least one hit within
  // the beat budget — this used to always end with outcome=defender and zero
  // HP change for anyone, because squads smaller than 3 ran out of beats
  // before ever closing the distance to fight.
  const state = getInitialState(54);
  const pending = makePending(state, 1, 1);
  const battle = createBattle(state, pending);

  let guard = 0;
  while (!battle.finished && guard < 20) {
    const actor = getCurrentActor(battle);
    if (!actor) break;
    if (actor.side === 'defender') {
      if (actor.type === 'forager') {
        passTurn(battle); // hold back — let the soldier do the fighting
      } else {
        const enemies = adjacentEnemies(battle, actor);
        if (enemies.length > 0) {
          attackUnit(battle, actor.id, enemies[0].id);
        } else {
          const moves = movesInRange(battle, actor);
          const attacker = battle.units.find((u) => u.side === 'attacker' && u.alive);
          let best = null;
          let bestDist = Infinity;
          for (const m of moves) {
            const d = Math.max(Math.abs(attacker.x - m.x), Math.abs(attacker.y - m.y));
            if (d < bestDist) { bestDist = d; best = m; }
          }
          if (best) moveUnit(battle, actor.id, best.x, best.y);
          else passTurn(battle);
        }
      }
    }
    guard++;
  }

  const anyHpChanged = battle.units.some((u) => u.hp !== u.maxHp);
  assert.ok(anyHpChanged, 'a soldier holding the forager back and engaging should land at least one hit within 6 beats');
});

test('resolveBattleOutcome delivers pips and awards a win on defender victory', () => {
  const state = getInitialState(55);
  const player = state.colonies.player;
  const pending = makePending(state, 2, 1);
  const battle = createBattle(state, pending);
  // Force the win condition directly rather than depending on engine timing —
  // covered separately by the "reaches an outcome" and "battle-pacing" tests.
  battle.finished = true;
  battle.outcome = 'defender';

  const sugarBefore = player.resources.sugar;
  resolveBattleOutcome(state, battle);
  assert.equal(player.resources.sugar, sugarBefore + 10);
  assert.equal(player.lifetimeStats.battlesWon, 1);
});

test('resolveBattleOutcome applies casualties and reconciles garrisons on both sides', () => {
  const state = getInitialState(56);
  const player = state.colonies.player;
  const rival = state.colonies.rival_1;
  const pending = makePending(state, 2, 2);
  const battle = createBattle(state, pending);

  // Force a decisive outcome by killing every unit on one side directly.
  for (const u of battle.units) {
    if (u.side === 'attacker') { u.hp = 0; u.alive = false; }
  }
  battle.finished = true;
  battle.outcome = 'defender';

  resolveBattleOutcome(state, battle);
  assert.equal(rival.population.soldier, 0, 'both attacker soldiers should be recorded as casualties');

  const totalGarrisoned = player.trails.reduce((sum, t) => sum + t.garrison, 0);
  assert.ok(totalGarrisoned <= player.population.soldier);
});

test('resolveBattleOutcome does not deliver pips on an attacker victory', () => {
  const state = getInitialState(57);
  const player = state.colonies.player;
  const pending = makePending(state, 1, 1);
  const battle = createBattle(state, pending);
  battle.finished = true;
  battle.outcome = 'attacker';

  const sugarBefore = player.resources.sugar;
  resolveBattleOutcome(state, battle);
  assert.equal(player.resources.sugar, sugarBefore);
});

test('autoResolveBattle plays a rival defending against the player start to finish', () => {
  const state = getInitialState(58);
  const rival = state.colonies.rival_1;
  rival.trails.push({ id: 'rt', garrison: 2, capacity: 1, contested: true, path: ['x'] });
  rival.population.soldier = 2;
  state.colonies.player.population.soldier = 2;

  const pending = {
    trailId: 'rt', defenderColonyId: 'rival_1', attackerColonyId: 'player',
    pips: [{ resourceType: 'sugar', amount: 15 }],
  };
  const before = rival.resources.sugar;
  const battle = autoResolveBattle(state, pending);

  assert.equal(battle.finished, true);
  assert.ok(['defender', 'attacker'].includes(battle.outcome));
  if (battle.outcome === 'defender') assert.equal(rival.resources.sugar, before + 15);
  const totalGarrisoned = rival.trails.reduce((sum, t) => sum + t.garrison, 0);
  assert.ok(totalGarrisoned <= rival.population.soldier, 'garrison must be reconciled after casualties');
});

test('autoResolveBattle handles a rival-vs-rival skirmish (neither side is the player)', () => {
  const state = getInitialState(59);
  const r1 = state.colonies.rival_1;
  const r2 = state.colonies.rival_2;
  r1.trails.push({ id: 'rt', garrison: 1, capacity: 1, contested: true, path: ['x'] });
  r1.population.soldier = 1;
  r2.population.soldier = 2;

  const pending = {
    trailId: 'rt', defenderColonyId: 'rival_1', attackerColonyId: 'rival_2',
    pips: [{ resourceType: 'mineral', amount: 10 }],
  };
  const battle = autoResolveBattle(state, pending);

  assert.equal(battle.finished, true);
  assert.ok(['defender', 'attacker'].includes(battle.outcome));
  assert.match(state.log[0].text, /rival colony/i);
});

test('autoResolveBattle never runs away — it terminates within the beat budget', () => {
  const state = getInitialState(60);
  const rival = state.colonies.rival_1;
  rival.trails.push({ id: 'rt', garrison: 2, capacity: 1, contested: true, path: ['x'] });
  rival.population.soldier = 2;
  state.colonies.player.population.soldier = 3;

  const pending = {
    trailId: 'rt', defenderColonyId: 'rival_1', attackerColonyId: 'player',
    pips: [{ resourceType: 'sugar', amount: 5 }],
  };
  assert.doesNotThrow(() => autoResolveBattle(state, pending));
});
