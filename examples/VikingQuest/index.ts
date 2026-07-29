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
  reelMultipliers: new Map<number, number>(),
  stickyWildPositions: new Map<string, boolean>(),
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
      6: 12,
    },
  }),
  H1: new GameSymbol({
    id: "H1",
    pays: {
      3: 4,
      4: 6,
      5: 9,
      6: 12,
    },
  }),
  H2: new GameSymbol({
    id: "H2",
    pays: {
      3: 2,
      4: 3.5,
      5: 5,
      6: 8,
    },
  }),
  H3: new GameSymbol({
    id: "H3",
    pays: {
      3: 1,
      4: 1.5,
      5: 3,
      6: 5,
    },
  }),
  H4: new GameSymbol({
    id: "H4",
    pays: {
      3: 1,
      4: 1.5,
      5: 3,
      6: 5,
    },
  }),
  L1: new GameSymbol({
    id: "L1",
    pays: {
      3: 0.5,
      4: 1,
      5: 2,
      6: 4,
    },
  }),
  L2: new GameSymbol({
    id: "L2",
    pays: {
      3: 0.3,
      4: 0.8,
      5: 1.5,
      6: 3,
    },
  }),
  L3: new GameSymbol({
    id: "L3",
    pays: {
      3: 0.2,
      4: 0.6,
      5: 1.2,
      6: 2,
    },
  }),
  L4: new GameSymbol({
    id: "L4",
    pays: {
      3: 0.1,
      4: 0.5,
      5: 1,
      6: 1.5,
    },
  }),
  L5: new GameSymbol({
    id: "L5",
    pays: {
      3: 0.1,
      4: 0.5,
      5: 1,
      6: 1.5,
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
        // Keep this small: forceMaxWin books are expensive to generate.
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
  id: "viking-quest",
  name: "Viking Quest",
  maxWinX: 15000,
  gameModes,
  symbols,
  padSymbols: 1,
  scatterToFreespins: {
    // All three tiers (Normal/Super/Hidden) award 12 free spins; the tier only
    // changes reel sets / wild explosion richness (see checkFreespins).
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

// Add or remove from this to choose what gets simulated or not.
game.configureSimulation({
  simRunsAmount: {
    // base: 600000,
    // bonusHunt: 300000,
    // featureSpin: 100000,
    // bonusFeature: 100000,
    mysteryBonusFeature: 100000,
    // superBonusFeature: 100000,
  },
  concurrency: 24
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
      scaling: new OptimizationScaling([
        { criteria: "basegame", scaleFactor: 0.001, winRange: [0.01, 1], probability: 1 },
        { criteria: "basegame", scaleFactor: 116.0, winRange: [1, 2], probability: 1 },
        { criteria: "basegame", scaleFactor: 8.0, winRange: [2, 5], probability: 1 },
        { criteria: "basegame", scaleFactor: 4.0, winRange: [5, 10], probability: 1 },
        { criteria: "basegame", scaleFactor: 1.0, winRange: [10, 20], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.11, winRange: [20, 35], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.08, winRange: [35, 50], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.04, winRange: [50, 75], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.03, winRange: [75, 100], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.0006, winRange: [100, 125], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.0004, winRange: [125, 150], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.0003, winRange: [150, 175], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.00022, winRange: [175, 200], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.0018, winRange: [200, 300], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.0013, winRange: [300, 400], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.001, winRange: [400, 500], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.02, winRange: [500, 1000], probability: 1 },
        { criteria: "basegame", scaleFactor: 1, winRange: [1000, 1000], probability: 1 },
      ]),

      // ─── PARAMETERS ────────────────────────────────────────────────────────
      // Controls the internal Rust optimizer algorithm. All values are optional;
      // omitted values fall back to the defaults shown below.
      //
      // numShowPigs              – candidate win distributions evaluated at the end.
      //                           Higher = more diversity in final picks. (default: 5000)
      // numPigsPerFence          – candidates generated per fence during construction.
      //                           Higher = more thorough search. (default: 10000)
      // threadsFenceConstruction – CPU threads for building fence distributions. (default: 16)
      // threadsShowConstruction  – CPU threads for combining distributions. (default: 16)
      // testSpins                – session lengths to simulate when scoring candidates.
      //                           (default: [50, 100, 200])
      // testSpinsWeights         – importance weighting for each session length.
      //                           Must be same length as testSpins. (default: [0.3, 0.4, 0.3])
      // simulationTrials         – sessions run per candidate to compute its score. (default: 5000)
      // minMeanToMedian          – lower bound on the mean/median ratio the optimizer accepts.
      //                           Lower = tighter distribution, more mid-range wins. (default: 4)
      // maxMeanToMedian          – upper bound on the mean/median ratio.
      //                           Lower = less rightward skew, fewer extreme outliers. (default: 8)
      // pmbRtp                   – RTP scaling for progressive-multiplier-bonus logic. (default: 1.0)
      parameters: new OptimizationParameters({
        minMeanToMedian: 4,
        maxMeanToMedian: 8,
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
        // 500 / 5 = 100.
        superfreespins: new OptimizationConditions({
          rtp: 0.2504,
          hitRate: 100,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 3,
        }),
        // 1000 / 5 = 200.
        hiddenfreespins: new OptimizationConditions({
          rtp: 0.2624,
          hitRate: 200,
          searchConditions: {
            criteria: "hiddenfreespins",
          },
          priority: 4,
        }),
      },
      scaling: new OptimizationScaling([
        { criteria: "basegame", scaleFactor: 0.001, winRange: [0.01, 1], probability: 1 },
        { criteria: "basegame", scaleFactor: 350.0, winRange: [1, 2], probability: 1 },
        { criteria: "basegame", scaleFactor: 8.0, winRange: [2, 5], probability: 1 },
        { criteria: "basegame", scaleFactor: 4.0, winRange: [5, 10], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.2, winRange: [10, 20], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.275, winRange: [20, 35], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.2, winRange: [35, 50], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.1, winRange: [50, 75], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.075, winRange: [75, 100], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.0000625, winRange: [100, 125], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.0000417, winRange: [125, 150], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.0000333, winRange: [150, 175], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.000025, winRange: [175, 200], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.0018, winRange: [200, 300], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.0013, winRange: [300, 400], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.001, winRange: [400, 500], probability: 1 },
        { criteria: "basegame", scaleFactor: 2.0, winRange: [500, 1000], probability: 1 },
        { criteria: "basegame", scaleFactor: 1, winRange: [1000, 1000], probability: 1 },
        { criteria: "freespins", scaleFactor: 0.5, winRange: [0.01, 20], probability: 1 },
        { criteria: "freespins", scaleFactor: 1.3, winRange: [20, 50], probability: 1 },
        { criteria: "freespins", scaleFactor: 1.0, winRange: [50, 100], probability: 1 },
        { criteria: "freespins", scaleFactor: 0.4, winRange: [100, 200], probability: 1 },
        { criteria: "freespins", scaleFactor: 0.15, winRange: [200, 500], probability: 1 },
        { criteria: "freespins", scaleFactor: 4.0, winRange: [500, 1000], probability: 1 },
        { criteria: "freespins", scaleFactor: 2.5, winRange: [1000, 2000], probability: 1 },
        { criteria: "freespins", scaleFactor: 1.5, winRange: [2000, 5000], probability: 1 },
        { criteria: "freespins", scaleFactor: 1.0, winRange: [5000, 10000], probability: 1 },
        { criteria: "freespins", scaleFactor: 0.3, winRange: [10000, 15000], probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [15000, 15000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.4, winRange: [0.01, 20], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.2, winRange: [20, 50], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.5, winRange: [50, 150], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.8, winRange: [150, 300], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.3, winRange: [300, 600], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 3.0, winRange: [600, 1000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 2.0, winRange: [1000, 2000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.2, winRange: [2000, 5000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.6, winRange: [5000, 10000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.2, winRange: [10000, 15000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [15000, 15000], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 0.3, winRange: [0.01, 50], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 1.0, winRange: [50, 150], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 1.8, winRange: [150, 300], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 1.0, winRange: [300, 600], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 2.5, winRange: [600, 1000], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 2.0, winRange: [1000, 2000], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 1.5, winRange: [2000, 5000], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 1.0, winRange: [5000, 10000], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 0.3, winRange: [10000, 15000], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 1, winRange: [15000, 15000], probability: 1 },
      ]),
      parameters: new OptimizationParameters({
        minMeanToMedian: 4,
        maxMeanToMedian: 8,
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
      scaling: new OptimizationScaling([
        { criteria: "freespins", scaleFactor: 3.0, winRange: [0.01, 1], probability: 1 },
        { criteria: "freespins", scaleFactor: 2.0, winRange: [1, 2], probability: 1 },
        { criteria: "freespins", scaleFactor: 1.1, winRange: [2, 5], probability: 1 },
        { criteria: "freespins", scaleFactor: 0.46, winRange: [5, 10], probability: 1 },
        { criteria: "freespins", scaleFactor: 0.16, winRange: [10, 20], probability: 1 },
        { criteria: "freespins", scaleFactor: 0.034, winRange: [20, 50], probability: 1 },
        { criteria: "freespins", scaleFactor: 1.5, winRange: [50, 100], probability: 1 },
        { criteria: "freespins", scaleFactor: 0.5, winRange: [100, 200], probability: 1 },
        { criteria: "freespins", scaleFactor: 0.21, winRange: [200, 500], probability: 1 },
        { criteria: "freespins", scaleFactor: 0.077, winRange: [500, 1000], probability: 1 },
        { criteria: "freespins", scaleFactor: 0.036, winRange: [1000, 2000], probability: 1 },
        { criteria: "freespins", scaleFactor: 0.08, winRange: [2000, 5000], probability: 1 },
        { criteria: "freespins", scaleFactor: 0.5, winRange: [5000, 10000], probability: 1 },
        { criteria: "freespins", scaleFactor: 1.2, winRange: [10000, 15000], probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [15000, 15000], probability: 1 },
      ]),
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
      scaling: new OptimizationScaling([
        { criteria: "superfreespins", scaleFactor: 0.8, winRange: [100, 200], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.8, winRange: [200, 500], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 124.5, winRange: [500, 1000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 36, winRange: [1000, 2000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 12.6, winRange: [2000, 5000], probability: 1 },
        // ROUND 2 (2026-07-27): user still needs 5000x+/10000x+ less
        // frequent. Cut further ~1.6x (8->5, 6->3.5).
        { criteria: "superfreespins", scaleFactor: 5, winRange: [5000, 10000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 3.5, winRange: [10000, 15000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [15000, 15000], probability: 1 },
      ]),
      parameters: new OptimizationParameters({
        minMeanToMedian: 2,
        maxMeanToMedian: 15,
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
        // Total check: 0 + 0.0125 + 0.57325 + 0.37425 = 0.96 ✓
        hiddenfreespins: new OptimizationConditions({
          rtp: 0.56425,
          hitRate: 10,
          searchConditions: {
            criteria: "hiddenfreespins",
          },
          priority: 5,
        }),
      },
      scaling: new OptimizationScaling([
        { criteria: "superfreespins", scaleFactor: 0.3, winRange: [0.01, 50], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.0, winRange: [50, 100], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 2.3, winRange: [100, 200], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.0, winRange: [200, 500], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.7, winRange: [500, 1000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.15, winRange: [1000, 2000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.12, winRange: [2000, 5000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.004, winRange: [5000, 10000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.002, winRange: [10000, 15000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [15000, 15000], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 0.3, winRange: [0.01, 200], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 1.5, winRange: [200, 500], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 2.2, winRange: [500, 1000], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 1.3, winRange: [1000, 2000], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 0.24, winRange: [2000, 5000], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 0.0015, winRange: [5000, 10000], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 0.0004, winRange: [10000, 15000], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 1, winRange: [15000, 15000], probability: 1 },
      ]),
      parameters: new OptimizationParameters({
        minMeanToMedian: 2,
        maxMeanToMedian: 32,
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
      scaling: new OptimizationScaling([
        { criteria: "basegame", scaleFactor: 8, winRange: [100, 200], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.3, winRange: [0.01, 20], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.5, winRange: [20, 50], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 2.5, winRange: [50, 100], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 3.5, winRange: [100, 150], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 3.0, winRange: [150, 250], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.5, winRange: [250, 500], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.5, winRange: [500, 1000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.25, winRange: [1000, 2000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.08, winRange: [2000, 5000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.04, winRange: [5000, 10000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.02, winRange: [10000, 15000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [15000, 15000], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 0.3, winRange: [0.01, 50], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 0.6, winRange: [50, 100], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 1.0, winRange: [100, 150], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 1.5, winRange: [150, 250], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 1.2, winRange: [250, 400], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 1.5, winRange: [400, 700], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 0.6, winRange: [700, 1500], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 0.6, winRange: [1500, 2500], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 1.6, winRange: [2500, 5000], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 7.8, winRange: [5000, 10000], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 3.7, winRange: [10000, 15000], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 1, winRange: [15000, 15000], probability: 1 },
      ]),
      parameters: new OptimizationParameters({
        minMeanToMedian: 4,
        maxMeanToMedian: 8,
        numPigsPerFence: 20000,
      }),
    },
  },
})

game.runTasks({
  doSimulation: false,
  doOptimization: true,
  optimizationOpts: {
    //gameModes: ["base", "bonusHunt", "bonusFeature", "superBonusFeature", "mysteryBonusFeature", "featureSpin"],
    gameModes: ["mysteryBonusFeature"],
  },
  doAnalysis: false,
  analysisOpts: {
    //gameModes: ["base", "bonusHunt", "bonusFeature", "superBonusFeature", "mysteryBonusFeature", "featureSpin"],
    gameModes: ["mysteryBonusFeature"],
  },
})
