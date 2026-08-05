import {
  GameMode,
  GameSymbol,
  InferGameType,
  OptimizationConditions,
  OptimizationParameters,
  OptimizationScaling,
  ResultSet,
  createSlotGame,
  defineGameModes,
  defineSymbols,
  defineUserState,
  SPIN_TYPE,
} from "@slot-engine/core"
import { maxwinReelsEvaluation } from "./src/evaluations"
import { GENERATORS } from "./src/reels"
import { onHandleGameFlow } from "./src/onHandleGameFlow"

export const userState = defineUserState({
  // Sticky wilds carry their own accumulated multiplier, keyed by "reel-row".
  persistentWilds: new Map<string, number>(),
  totalFreeSpinsWin: 0,
  isSuperFreeSpins: false,
  isHiddenFreeSpins: false,
})

export type UserStateType = typeof userState

export const symbols = defineSymbols({
  S: new GameSymbol({
    id: "S",
    properties: {
      isScatter: true,
    },
  }),
  W: new GameSymbol({
    id: "W",
    properties: {
      isWild: true,
    },
    pays: {
      6: 20,
    },
  }),
  H1: new GameSymbol({
    id: "H1",
    pays: {
      3: 5,
      4: 10,
      5: 20,
      6: 50,
    },
  }),
  H2: new GameSymbol({
    id: "H2",
    pays: {
      3: 3,
      4: 6,
      5: 12,
      6: 30,
    },
  }),
  H3: new GameSymbol({
    id: "H3",
    pays: {
      3: 2,
      4: 4,
      5: 8,
      6: 18,
    },
  }),
  H4: new GameSymbol({
    id: "H4",
    pays: {
      3: 1.5,
      4: 3,
      5: 6,
      6: 12,
    },
  }),
  L1: new GameSymbol({
    id: "L1",
    pays: {
      3: 0.4,
      4: 0.8,
      5: 1.6,
      6: 3,
    },
  }),
  L2: new GameSymbol({
    id: "L2",
    pays: {
      3: 0.3,
      4: 0.6,
      5: 1.2,
      6: 2.5,
    },
  }),
  L3: new GameSymbol({
    id: "L3",
    pays: {
      3: 0.2,
      4: 0.5,
      5: 1,
      6: 2,
    },
  }),
  L4: new GameSymbol({
    id: "L4",
    pays: {
      3: 0.1,
      4: 0.4,
      5: 0.8,
      6: 1.5,
    },
  }),
  L5: new GameSymbol({
    id: "L5",
    pays: {
      3: 0.1,
      4: 0.3,
      5: 0.6,
      6: 1.2,
    },
  }),
})

export type SymbolsType = typeof symbols

export const gameModes = defineGameModes({
  base: new GameMode({
    name: "base",
    cost: 1,
    rtp: 0.96,
    reelsAmount: 6,
    symbolsPerReel: [5, 5, 5, 5, 5, 5],
    isBonusBuy: false,
    reelSets: [...Object.values(GENERATORS)],
    resultSets: [
      new ResultSet({
        criteria: "0",
        quota: 0.10,
        multiplier: 0,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { freespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "basegame",
        quota: 0.30,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { freespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "freespins",
        quota: 0.20,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { freespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "superfreespins",
        quota: 0.2,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { superfreespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "hiddenfreespins",
        quota: 0.2,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { hiddenfreespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "maxwin",
        quota: 0.001,
        forceMaxWin: true,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { maxwin: 1 },
          evaluate: maxwinReelsEvaluation,
        },
      }),
    ],
  }),
  bonusHunt: new GameMode({
    name: "bonusHunt",
    cost: 3,
    rtp: 0.96,
    reelsAmount: 6,
    symbolsPerReel: [5, 5, 5, 5, 5, 5],
    isBonusBuy: false,
    reelSets: [...Object.values(GENERATORS)],
    resultSets: [
      new ResultSet({
        criteria: "0",
        quota: 0.20,
        multiplier: 0,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { freespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "basegame",
        quota: 0.25,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { freespin: 1, superfreespin: 1, hiddenfreespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "freespins",
        quota: 0.30,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { freespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "superfreespins",
        quota: 0.20,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { superfreespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "hiddenfreespins",
        quota: 0.05,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { hiddenfreespin: 1 },
        },
      }),
    ],
  }),
  bonusFeature: new GameMode({
    name: "bonusFeature",
    cost: 100,
    rtp: 0.96,
    reelsAmount: 6,
    symbolsPerReel: [5, 5, 5, 5, 5, 5],
    isBonusBuy: true,
    reelSets: [...Object.values(GENERATORS)],
    resultSets: [
      new ResultSet({
        criteria: "freespins",
        quota: 1,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { freespin: 1 },
        },
      }),
    ],
  }),
  superBonusFeature: new GameMode({
    name: "superBonusFeature",
    cost: 500,
    rtp: 0.96,
    reelsAmount: 6,
    symbolsPerReel: [5, 5, 5, 5, 5, 5],
    isBonusBuy: true,
    reelSets: [...Object.values(GENERATORS)],
    resultSets: [
      new ResultSet({
        criteria: "superfreespins",
        quota: 1,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { superfreespin: 1 },
        },
      }),
    ],
  }),
  mysteryBonusFeature: new GameMode({
    name: "mysteryBonusFeature",
    cost: 500,
    rtp: 0.96,
    reelsAmount: 6,
    symbolsPerReel: [5, 5, 5, 5, 5, 5],
    isBonusBuy: true,
    reelSets: [...Object.values(GENERATORS)],
    resultSets: [
      new ResultSet({
        criteria: "0",
        quota: 0.5,
        multiplier: 0,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { freespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "superfreespins",
        quota: 0.4,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { superfreespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "hiddenfreespins",
        quota: 0.1,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { hiddenfreespin: 1 },
        },
      }),
    ],
  }),
  featureSpin: new GameMode({
    name: "featureSpin",
    cost: 100,
    rtp: 0.96,
    reelsAmount: 6,
    symbolsPerReel: [5, 5, 5, 5, 5, 5],
    isBonusBuy: true,
    reelSets: [...Object.values(GENERATORS)],
    resultSets: [
      new ResultSet({
        criteria: "0",
        quota: 0.10,
        multiplier: 0,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { featureSpin: 1 },
          [SPIN_TYPE.FREE_SPINS]: { freespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "basegame",
        quota: 0.30,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { featureSpin: 1 },
          [SPIN_TYPE.FREE_SPINS]: { freespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "freespins",
        quota: 0.20,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { featureSpin: 1 },
          [SPIN_TYPE.FREE_SPINS]: { freespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "superfreespins",
        quota: 0.2,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { featureSpin: 1 },
          [SPIN_TYPE.FREE_SPINS]: { superfreespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "hiddenfreespins",
        quota: 0.2,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { featureSpin: 1 },
          [SPIN_TYPE.FREE_SPINS]: { hiddenfreespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "maxwin",
        quota: 0.001,
        forceMaxWin: true,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { featureSpin: 1 },
          [SPIN_TYPE.FREE_SPINS]: { maxwin: 1 },
          evaluate: maxwinReelsEvaluation,
        },
      }),
    ],
  }),
})

export type GameModesType = typeof gameModes

export type GameType = InferGameType<GameModesType, SymbolsType, UserStateType>

export const game = createSlotGame<GameType>({
  id: "gladiator",
  name: "Gladiator",
  maxWinX: 15000,
  gameModes,
  symbols,
  padSymbols: 1,
  scatterToFreespins: {
    // All three tiers (Normal/Super/Hidden) award 12 free spins; the tier only
    // changes reel sets / sticky-wild multiplier richness (see checkFreespins).
    [SPIN_TYPE.BASE_GAME]: {
      3: 12,
      4: 12,
      5: 12,
    },
    [SPIN_TYPE.FREE_SPINS]: {
      3: 6,
      4: 8,
      5: 10,
    },
  },
  userState,
  hooks: {
    onHandleGameFlow,
  },
})

// ─── NEUTRAL OPTIMIZATION SCALING ──────────────────────────────────────────
// Basic structure only: every win-range bin is left at scaleFactor 1 and
// probability 1 so distributions are unshaped and ready to be reconfigured.
const NEUTRAL_BINS: Array<[number, number]> = [
  [0.01, 1],
  [1, 2],
  [2, 5],
  [5, 10],
  [10, 20],
  [20, 50],
  [50, 100],
  [100, 200],
  [200, 500],
  [500, 1000],
  [1000, 2000],
  [2000, 5000],
  [5000, 10000],
  [10000, 15000],
  [15000, 15000],
]

function neutralScaling(...criterias: string[]) {
  return criterias.flatMap((criteria) =>
    NEUTRAL_BINS.map(([lo, hi]) => ({
      criteria,
      scaleFactor: 1,
      winRange: [lo, hi] as [number, number],
      probability: 1,
    })),
  )
}

// Add or remove from this to choose what gets simulated or not.
game.configureSimulation({
  simRunsAmount: {
    base: 100000,
    // bonusHunt: 300000,
    // featureSpin: 100000,
    // bonusFeature: 100000,
    // mysteryBonusFeature: 100000,
    // superBonusFeature: 100000,
  },
  concurrency: 24,
})

game.configureOptimization({
  gameModes: {
    base: {
      conditions: {
        "0": new OptimizationConditions({
          rtp: 0,
          avgWin: 0,
          searchConditions: 0,
          priority: 10,
        }),
        maxwin: new OptimizationConditions({
          rtp: 0.005,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 5,
        }),
        basegame: new OptimizationConditions({
          rtp: 0.2125,
          hitRate: 8,
          priority: 1,
        }),
        freespins: new OptimizationConditions({
          rtp: 0.265,
          hitRate: 150,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 2,
        }),
        superfreespins: new OptimizationConditions({
          rtp: 0.178,
          hitRate: 500,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 3,
        }),
        hiddenfreespins: new OptimizationConditions({
          rtp: 0.2995,
          hitRate: 1000,
          searchConditions: {
            criteria: "hiddenfreespins",
          },
          priority: 4,
        }),
      },
      scaling: new OptimizationScaling(
        neutralScaling("basegame", "freespins", "superfreespins", "hiddenfreespins"),
      ),
      parameters: new OptimizationParameters({
        minMeanToMedian: 2,
        maxMeanToMedian: 20,
      }),
    },
    bonusHunt: {
      conditions: {
        "0": new OptimizationConditions({
          rtp: 0,
          avgWin: 0,
          searchConditions: 0,
          priority: 10,
        }),
        maxwin: new OptimizationConditions({
          rtp: 0.0025,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 5,
        }),
        basegame: new OptimizationConditions({
          rtp: 0.0225,
          hitRate: 8,
          priority: 1,
        }),
        freespins: new OptimizationConditions({
          rtp: 0.4222,
          hitRate: 30,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 2,
        }),
        superfreespins: new OptimizationConditions({
          rtp: 0.2504,
          hitRate: 100,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 3,
        }),
        hiddenfreespins: new OptimizationConditions({
          rtp: 0.2624,
          hitRate: 200,
          searchConditions: {
            criteria: "hiddenfreespins",
          },
          priority: 4,
        }),
      },
      scaling: new OptimizationScaling(
        neutralScaling("basegame", "freespins", "superfreespins", "hiddenfreespins"),
      ),
      parameters: new OptimizationParameters({
        minMeanToMedian: 2,
        maxMeanToMedian: 20,
      }),
    },
    bonusFeature: {
      conditions: {
        maxwin: new OptimizationConditions({
          rtp: 0.003,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 5,
        }),
        freespins: new OptimizationConditions({
          rtp: 0.957,
          hitRate: 1,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 1,
        }),
      },
      scaling: new OptimizationScaling(neutralScaling("freespins")),
      parameters: new OptimizationParameters({
        minMeanToMedian: 2,
        maxMeanToMedian: 20,
      }),
    },
    superBonusFeature: {
      conditions: {
        maxwin: new OptimizationConditions({
          rtp: 0.006,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 5,
        }),
        superfreespins: new OptimizationConditions({
          rtp: 0.954,
          hitRate: 1,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 1,
        }),
      },
      scaling: new OptimizationScaling(neutralScaling("superfreespins")),
      parameters: new OptimizationParameters({
        minMeanToMedian: 2,
        maxMeanToMedian: 20,
      }),
    },
    mysteryBonusFeature: {
      conditions: {
        "0": new OptimizationConditions({
          rtp: 0,
          avgWin: 0,
          searchConditions: 0,
          priority: 10,
        }),
        maxwin: new OptimizationConditions({
          rtp: 0.0125,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 8,
        }),
        superfreespins: new OptimizationConditions({
          rtp: 0.38325,
          hitRate: 2.5,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 4,
        }),
        hiddenfreespins: new OptimizationConditions({
          rtp: 0.56425,
          hitRate: 10,
          searchConditions: {
            criteria: "hiddenfreespins",
          },
          priority: 5,
        }),
      },
      scaling: new OptimizationScaling(
        neutralScaling("superfreespins", "hiddenfreespins"),
      ),
      parameters: new OptimizationParameters({
        minMeanToMedian: 2,
        maxMeanToMedian: 20,
      }),
    },
    featureSpin: {
      conditions: {
        "0": new OptimizationConditions({
          rtp: 0,
          avgWin: 0,
          searchConditions: 0,
          priority: 10,
        }),
        maxwin: new OptimizationConditions({
          rtp: 0.005,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 5,
        }),
        basegame: new OptimizationConditions({
          rtp: 0.94585,
          hitRate: 1.2265,
          priority: 1,
        }),
        freespins: new OptimizationConditions({
          rtp: 0.00265,
          hitRate: 150,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 2,
        }),
        superfreespins: new OptimizationConditions({
          rtp: 0.0035,
          hitRate: 500,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 3,
        }),
        hiddenfreespins: new OptimizationConditions({
          rtp: 0.003,
          hitRate: 1000,
          searchConditions: {
            criteria: "hiddenfreespins",
          },
          priority: 4,
        }),
      },
      scaling: new OptimizationScaling(
        neutralScaling("basegame", "freespins", "superfreespins", "hiddenfreespins"),
      ),
      parameters: new OptimizationParameters({
        minMeanToMedian: 2,
        maxMeanToMedian: 20,
      }),
    },
  },
})

game.runTasks({
  doSimulation: true,
  doOptimization: true,
  optimizationOpts: {
    gameModes: ["base"],
  },
  doAnalysis: true,
  analysisOpts: {
    gameModes: ["base"],
  },
})
