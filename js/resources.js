import { addLog, totalPopulation } from './state.js';
import { clampGarrisons } from './trails.js';
import {
  CHAMBER_TYPES, POP_UPKEEP_SUGAR_PER_ANT, POP_UPKEEP_FUNGUS_PER_ANT, POP_GROWTH_PROTEIN_COST,
} from './constants.js';

export function resolveProduction(state, colonyId) {
  const colony = state.colonies[colonyId];

  const farmCount = colony.chambers.filter((key) => {
    const tile = state.map.tiles[key];
    return tile.chamber && tile.chamber.type === 'farm';
  }).length;

  if (farmCount > 0) {
    const rate = CHAMBER_TYPES.farm.sugarToFungusRate * farmCount;
    const conversion = Math.min(rate, colony.resources.sugar);
    if (conversion > 0) {
      colony.resources.sugar -= conversion;
      colony.resources.fungus = Math.min(colony.storageCap.fungus, colony.resources.fungus + conversion);
    }
  }

  // Workers/foragers run on sugar; soldiers/scouts (the "elite" castes) need fungus.
  const laborPop = colony.population.worker + colony.population.forager;
  const militaryPop = colony.population.soldier + colony.population.scout;

  const sugarUpkeep = Math.ceil(laborPop * POP_UPKEEP_SUGAR_PER_ANT);
  if (colony.resources.sugar >= sugarUpkeep) {
    colony.resources.sugar -= sugarUpkeep;
  } else {
    const shortfall = sugarUpkeep - colony.resources.sugar;
    colony.resources.sugar = 0;
    // Workers starve first (protecting the specialized forager caste as long
    // as possible), but if workers run out and the deficit persists, foragers
    // are no longer exempt — otherwise an all-forager colony could sit at 0
    // sugar forever with zero consequence.
    let toStarve = Math.min(colony.population.worker + colony.population.forager, Math.ceil(shortfall / 4));
    const workerLoss = Math.min(colony.population.worker, toStarve);
    colony.population.worker -= workerLoss;
    toStarve -= workerLoss;
    const foragerLoss = Math.min(colony.population.forager, toStarve);
    colony.population.forager -= foragerLoss;

    if (workerLoss + foragerLoss > 0) {
      const who = workerLoss > 0
        ? `${workerLoss} worker(s)${foragerLoss > 0 ? ` and ${foragerLoss} forager(s)` : ''}`
        : `${foragerLoss} forager(s)`;
      addLog(state, `${colonyId === 'player' ? 'Your' : 'A rival'} colony starved and lost ${who}.`);
    }
  }

  const fungusUpkeep = Math.ceil(militaryPop * POP_UPKEEP_FUNGUS_PER_ANT);
  if (colony.resources.fungus >= fungusUpkeep) {
    colony.resources.fungus -= fungusUpkeep;
  } else {
    const shortfall = fungusUpkeep - colony.resources.fungus;
    colony.resources.fungus = 0;
    const deserted = Math.min(colony.population.soldier, Math.ceil(shortfall / 4));
    if (deserted > 0) {
      colony.population.soldier -= deserted;
      clampGarrisons(colony);
      addLog(state, `${colonyId === 'player' ? 'Your' : 'A rival'} colony went hungry and lost ${deserted} soldier(s).`);
    }
  }

  const pop = totalPopulation(colony);
  if (pop < colony.populationCap && colony.resources.protein >= POP_GROWTH_PROTEIN_COST) {
    colony.resources.protein -= POP_GROWTH_PROTEIN_COST;
    colony.population.worker += 1;
    addLog(state, `${colonyId === 'player' ? 'Your' : 'A rival'} colony grew by 1 new worker ant.`);
  }
}
