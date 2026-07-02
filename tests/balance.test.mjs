import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getInitialState, totalPopulation } from '../js/state.js';
import { resolveProduction } from '../js/resources.js';
import { resolveTrailsForColony } from '../js/trails.js';
import { runAiTurn } from '../js/ai.js';

// Regression coverage for a real bug: population growth used to be gated on
// protein alone, a single base-capacity trail couldn't remotely keep pace
// with upkeep, and the AI never specifically secured sugar income — the
// result was that colonies (even AI-controlled ones) reliably starved to
// total extinction over a long unattended game. This runs every colony under
// the AI heuristic (a lower bound on competence — real players do better)
// across a spread of seeds and asserts nobody goes fully extinct.
function runUnattended(seed, cycles) {
  const state = getInitialState(seed);
  for (let i = 0; i < cycles; i++) {
    state.pendingBattles = [];
    for (const colonyId of Object.keys(state.colonies)) {
      resolveProduction(state, colonyId);
      resolveTrailsForColony(state, colonyId);
    }
    for (const colonyId of Object.keys(state.colonies)) runAiTurn(state, colonyId);
    state.turn += 1;
  }
  return state;
}

test('no colony goes fully extinct over 100 unattended cycles, across a spread of seeds', () => {
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
  const extinctions = [];

  for (const seed of seeds) {
    const state = runUnattended(seed, 100);
    for (const [id, colony] of Object.entries(state.colonies)) {
      if (totalPopulation(colony) === 0) extinctions.push(`seed ${seed}: ${id}`);
    }
  }

  assert.deepEqual(extinctions, [], `expected no extinctions, got: ${extinctions.join(', ')}`);
});

test('a starving colony always keeps at least one forager alive (trail throughput floor)', () => {
  const state = getInitialState(100);
  const player = state.colonies.player;
  player.resources.sugar = 0;
  player.resources.protein = 0;
  player.population = { worker: 5, forager: 5, soldier: 0 };

  for (let i = 0; i < 20; i++) resolveProduction(state, 'player');

  assert.ok(player.population.forager >= 1, 'at least one forager must survive so the colony can ever recover income');
});

test('a colony survives 300 unattended cycles without ever reaching total extinction', () => {
  // Longer horizon spot-check on a single seed — catches slow-burn collapse
  // that a 100-cycle run might not have time to reach.
  const state = runUnattended(1, 300);
  const total = Object.values(state.colonies).reduce((sum, c) => sum + totalPopulation(c), 0);
  assert.ok(total > 0, 'at least one colony should still be alive after 300 cycles');
});
