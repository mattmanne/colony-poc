import { addLog } from './state.js';
import { MILESTONES } from './constants.js';

export function checkMilestones(state, colonyId) {
  const colony = state.colonies[colonyId];
  for (const milestone of MILESTONES) {
    if (colony.traits.includes(milestone.id)) continue;
    if (milestone.check(colony)) {
      colony.traits.push(milestone.id);
      milestone.apply(colony);
      addLog(state, `🏆 Milestone: ${milestone.label}`);
    }
  }
}
