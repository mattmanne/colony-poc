import { addLog } from './state.js';
import { resolveTrailsForColony } from './trails.js';
import { resolveProduction } from './resources.js';
import { runAiTurn } from './ai.js';
import { checkMilestones } from './milestones.js';
import { AP_PER_CYCLE } from './constants.js';

const RIVAL_IDS = ['rival_1', 'rival_2'];

// Runs production, trail resolution, and AI turns; queues any battles that
// need player input into state.pendingBattles instead of resolving them.
// Returns true if the cycle can't finish yet (battles are pending).
export function beginAdvanceCycle(state) {
  state.pendingBattles = [];

  for (const rivalId of RIVAL_IDS) {
    const aiState = state.colonies[rivalId].aiState;
    aiState.raidCooldown = Math.max(0, aiState.raidCooldown - 1);
  }

  for (const colonyId of Object.keys(state.colonies)) {
    resolveProduction(state, colonyId);
    resolveTrailsForColony(state, colonyId);
  }

  for (const rivalId of RIVAL_IDS) runAiTurn(state, rivalId);

  return state.pendingBattles.length > 0;
}

export function finishAdvanceCycle(state) {
  checkMilestones(state, 'player');
  state.turn += 1;
  state.actionPointsRemaining = AP_PER_CYCLE;
  addLog(state, `— Cycle ${state.turn} begins —`);
}
