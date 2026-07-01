import { addLog, totalPopulation } from './state.js';
import { CHAMBER_TYPES, POP_UPKEEP_SUGAR_PER_ANT, POP_GROWTH_PROTEIN_COST } from './constants.js';

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

  const pop = totalPopulation(colony);
  const upkeep = Math.ceil(pop * POP_UPKEEP_SUGAR_PER_ANT);
  if (colony.resources.sugar >= upkeep) {
    colony.resources.sugar -= upkeep;
  } else {
    const shortfall = upkeep - colony.resources.sugar;
    colony.resources.sugar = 0;
    const starved = Math.min(colony.population.worker, Math.ceil(shortfall / 4));
    if (starved > 0) {
      colony.population.worker -= starved;
      addLog(state, `${colonyId === 'player' ? 'Your' : "A rival"} colony starved and lost ${starved} worker(s).`);
    }
  }

  if (pop < colony.populationCap && colony.resources.protein >= POP_GROWTH_PROTEIN_COST) {
    colony.resources.protein -= POP_GROWTH_PROTEIN_COST;
    colony.population.worker += 1;
    addLog(state, `${colonyId === 'player' ? 'Your' : "A rival"} colony grew by 1 new worker ant.`);
  }
}
