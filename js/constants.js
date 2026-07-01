export const MAP_RADIUS = 8;
export const AP_PER_CYCLE = 3;
export const VISION_RADIUS = 3;

export const STARTING_RESOURCES = { sugar: 60, protein: 40, fungus: 0, mineral: 30 };
export const STARTING_STORAGE_CAP = { sugar: 200, protein: 200, fungus: 150, mineral: 150 };
export const STARTING_POPULATION = { worker: 6, forager: 4, soldier: 0, scout: 0 };
export const STARTING_POPULATION_CAP = 12;

export const CHAMBER_TYPES = {
  nest: { name: 'Nest', digCost: {} },
  storage: {
    name: 'Storage Chamber',
    digCost: { mineral: 12 },
    storageBonus: { sugar: 100, protein: 100, fungus: 100, mineral: 100 },
  },
  farm: {
    name: 'Fungus Farm',
    digCost: { mineral: 15 },
    sugarToFungusRate: 3,
  },
  nursery: {
    name: 'Nursery',
    digCost: { mineral: 15 },
    populationCapBonus: 6,
  },
};

export const RESOURCE_NODE_TYPES = ['sugar', 'protein', 'mineral'];
export const NODE_AMOUNT = { sugar: 200, protein: 160, mineral: 240 };
export const NODE_REGEN_RATE = { sugar: 3, protein: 2, mineral: 0 };

export const TRAIL_BASE_CAPACITY = 2;
export const TRAIL_MAX_CAPACITY = 4;
export const TRAIL_UPGRADE_COST_MINERAL = 6;
export const MAX_GARRISON = 2;

export const POP_UPKEEP_SUGAR_PER_ANT = 0.3;
export const POP_UPKEEP_FUNGUS_PER_ANT = 0.5;
export const POP_GROWTH_PROTEIN_COST = 8;
export const POP_GROWTH_SUGAR_BUFFER_MIN = 15;
export const POP_GROWTH_SUGAR_BUFFER_MULTIPLIER = 5;

export const CONTESTED_LEAK_CHANCE = 0.5;
export const RAID_COOLDOWN_CYCLES = 3;

export const SAVE_VERSION = 3;

export const MILESTONES = [
  {
    id: 'silo',
    label: 'Harvested 300 resources — unlocked a Sugar Silo (+100 sugar storage)',
    check: (colony) => colony.lifetimeStats.resourcesHarvested >= 300,
    apply: (colony) => { colony.storageCap.sugar += 100; },
  },
  {
    id: 'elite_soldier',
    label: 'Won 3 battles — soldiers are now Elite (+1 attack)',
    check: (colony) => colony.lifetimeStats.battlesWon >= 3,
    apply: () => {},
  },
  {
    id: 'tunnelers',
    label: 'Built 5 chambers — efficient tunneling (+4 population cap)',
    check: (colony) => colony.lifetimeStats.chambersBuilt >= 5,
    apply: (colony) => { colony.populationCap += 4; },
  },
  {
    id: 'waystations',
    label: 'Sustained a long trail for 10 cycles — Waystations built (-1 cycle trail latency)',
    check: (colony) => colony.lifetimeStats.longTrailCycles >= 10,
    apply: () => {},
  },
];
