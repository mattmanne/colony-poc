import { addLog } from './state.js';
import { resolveTrailsForColony } from './trails.js';
import { resolveProduction } from './resources.js';
import { runAiTurn } from './ai.js';
import { AP_PER_CYCLE } from './constants.js';

export function advanceCycle(state) {
  for (const colonyId of Object.keys(state.colonies)) {
    resolveProduction(state, colonyId);
    resolveTrailsForColony(state, colonyId);
  }

  runAiTurn(state, 'rival_1');

  state.turn += 1;
  state.actionPointsRemaining = AP_PER_CYCLE;
  addLog(state, `— Cycle ${state.turn} begins —`);
}
