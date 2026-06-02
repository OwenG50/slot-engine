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
import { GENERATORS } from "./src/reels"
import { onHandleGameFlow } from "./src/onHandleGameFlow"

export const userState = defineUserState({
  persistentWilds: new Map<string, number>(), // "reel-row" -> multiplier
  totalFreeSpinsWin: 0,
  isSuperFreeSpins: false,
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
      5: 20,
    },
  }),
  H1: new GameSymbol({
    id: "H1",
    pays: {
      3: 7.5,
      4: 10,
      5: 20,
    },
  }),
  H2: new GameSymbol({
    id: "H2",
    pays: {
      3: 5,
      4: 7.5,
      5: 15,
    },
  }),
  H3: new GameSymbol({
    id: "H3",
    pays: {
      3: 2.5,
      4: 5,
      5: 10,
    },
  }),
  H4: new GameSymbol({
    id: "H4",
    pays: {
      3: 2,
      4: 4,
      5: 8,
    },
  }),
  L1: new GameSymbol({
    id: "L1",
    pays: {
      3: 1,
      4: 2.5,
      5: 5,
    },
  }),
  L2: new GameSymbol({
    id: "L2",
    pays: {
      3: 0.5,
      4: 1.5,
      5: 3,
    },
  }),
  L3: new GameSymbol({
    id: "L3",
    pays: {
      3: 0.2,
      4: 0.5,
      5: 2,
    },
  }),
  L4: new GameSymbol({
    id: "L4",
    pays: {
      3: 0.1,
      4: 0.3,
      5: 1,
    },
  }),
  L5: new GameSymbol({
    id: "L5",
    pays: {
      3: 0.1,
      4: 0.3,
      5: 1,
    },
  }),
})

export type SymbolsType = typeof symbols

export const gameModes = defineGameModes({
  base: new GameMode({
    name: "base",
    cost: 1,
    rtp: 0.96,
    reelsAmount: 5,
    symbolsPerReel: [4, 4, 4, 4, 4],
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
        quota: 0.45,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { freespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "freespins",
        quota: 0.25,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { freespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "superfreespins",
        quota: 0.22,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { superfreespin: 1 },
        },
      }),
    ],
  }),
  bonusHunt: new GameMode({
    name: "bonusHunt",
    cost: 2,
    rtp: 0.96,
    reelsAmount: 5,
    symbolsPerReel: [4, 4, 4, 4, 4],
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
        quota: 0.30,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { freespin: 1, superfreespin: 1 },
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
    ],
  }),
  bonusHuntPlus: new GameMode({
    name: "bonusHuntPlus",
    cost: 10,
    rtp: 0.96,
    reelsAmount: 5,
    symbolsPerReel: [4, 4, 4, 4, 4],
    isBonusBuy: false,
    reelSets: [...Object.values(GENERATORS)],
    resultSets: [
      new ResultSet({
        criteria: "0",
        quota: 0.20,
        multiplier: 0,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { },
        },
      }),
      new ResultSet({
        criteria: "basegame",
        quota: 0.30,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { freeSpins: 1, superfreespin: 1 },
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
    ],
  }),
  bonusFeature: new GameMode({
    name: "bonusFeature",
    cost: 100,
    rtp: 0.96,
    reelsAmount: 5,
    symbolsPerReel: [4, 4, 4, 4, 4],
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
    cost: 300,
    rtp: 0.96,
    reelsAmount: 5,
    symbolsPerReel: [4, 4, 4, 4, 4],
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
  // guaranteedTwoWilds: 50x cost bonus-buy feature.
  // Every base game spin lands at least 2 wilds, each of which uses the new
  // wizard-wild spawn functionality (spawn count + multiplier pool spawns).
  // Can trigger regular and super free spins.
  guaranteedTwoWilds: new GameMode({
    name: "guaranteedTwoWilds",
    cost: 50,
    rtp: 0.96,
    reelsAmount: 5,
    symbolsPerReel: [4, 4, 4, 4, 4],
    isBonusBuy: true,
    reelSets: [...Object.values(GENERATORS)],
    resultSets: [
      new ResultSet({
        criteria: "0",
        quota: 0.50,
        multiplier: 0,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { guaranteedTwoWilds: 1 },
          [SPIN_TYPE.FREE_SPINS]: { freespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "basegame",
        quota: 0.03,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { guaranteedTwoWilds: 1 },
          [SPIN_TYPE.FREE_SPINS]: { freespin: 1, superfreespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "freespins",
        quota: 0.25,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { guaranteedTwoWilds: 1 },
          [SPIN_TYPE.FREE_SPINS]: { freespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "superfreespins",
        quota: 0.22,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { guaranteedTwoWilds: 1 },
          [SPIN_TYPE.FREE_SPINS]: { superfreespin: 1 },
        },
      }),
    ],
  }),
})

export type GameModesType = typeof gameModes

export type GameType = InferGameType<GameModesType, SymbolsType, UserStateType>

export const game = createSlotGame<GameType>({
  id: "wizard-wilds",
  name: "Wizard Wilds",
  maxWinX: 15000,
  gameModes,
  symbols,
  padSymbols: 0,
  scatterToFreespins: {
    [SPIN_TYPE.BASE_GAME]: {
      3: 10,
      4: 12,
      5: 15,
    },
    [SPIN_TYPE.FREE_SPINS]: {
      1: 2,
      2: 4,
      3: 6,
      4: 8,
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
    base: 300000,
    // bonusHunt: 300000,
    // bonusHuntPlus: 300000,
    // guaranteedTwoWilds: 600000,
    // bonusFeature: 300000,
    // superBonusFeature: 300000,
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
          rtp: 0.001,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 5,
        }),
        basegame: new OptimizationConditions({
          rtp: 0.50,
          hitRate: 4,
          priority: 1,
        }),
        freespins: new OptimizationConditions({
          rtp: 0.28,
          hitRate: 200,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 2,
        }),
        superfreespins: new OptimizationConditions({
          rtp: 0.179,
          hitRate: 700,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 3,
        }),
      },
      scaling: new OptimizationScaling([
        { criteria: "basegame", scaleFactor: 0.001,winRange: [0.01,  1],     probability: 1 },
        { criteria: "basegame", scaleFactor: 38.0, winRange: [1,     2],     probability: 1 },
        { criteria: "basegame", scaleFactor: 4.5,   winRange: [2,     5],     probability: 1 },
        { criteria: "basegame", scaleFactor: 4.0,   winRange: [5,     10],    probability: 1 },
        { criteria: "basegame", scaleFactor: 1.5,   winRange: [10,    20],    probability: 1 },
        { criteria: "basegame", scaleFactor: 0.06,  winRange: [20,    50],    probability: 1 },
        { criteria: "basegame", scaleFactor: 0.02,  winRange: [50,    100],   probability: 1 },
        { criteria: "basegame", scaleFactor: 0.007, winRange: [100,   200],   probability: 1 },
        { criteria: "basegame", scaleFactor: 0.005, winRange: [200,   500],   probability: 1 },
        { criteria: "basegame", scaleFactor: 0.003, winRange: [500,   1000],  probability: 1 },
        { criteria: "basegame", scaleFactor: 0.0015,winRange: [1000,  2000],  probability: 1 },
        { criteria: "basegame", scaleFactor: 0.0,   winRange: [2000,  5000],  probability: 1 },
        { criteria: "basegame", scaleFactor: 0.003,winRange: [5000,  10000], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.002,winRange: [10000, 15000], probability: 1 },
        { criteria: "basegame", scaleFactor: 1,    winRange: [15000, 15000], probability: 1 },
        { criteria: "freespins", scaleFactor: 0.5,  winRange: [0.01,  1],     probability: 1 },
        { criteria: "freespins", scaleFactor: 0.7,  winRange: [1,     2],     probability: 1 },
        { criteria: "freespins", scaleFactor: 0.9,  winRange: [2,     5],     probability: 1 },
        { criteria: "freespins", scaleFactor: 1.1,  winRange: [5,     10],    probability: 1 },
        { criteria: "freespins", scaleFactor: 1.3,  winRange: [10,    20],    probability: 1 },
        { criteria: "freespins", scaleFactor: 1.4,  winRange: [20,    50],    probability: 1 },
        { criteria: "freespins", scaleFactor: 1.3,  winRange: [50,    100],   probability: 1 },
        { criteria: "freespins", scaleFactor: 1.15, winRange: [100,   200],   probability: 1 },
        { criteria: "freespins", scaleFactor: 0.95, winRange: [200,   500],   probability: 1 },
        { criteria: "freespins", scaleFactor: 5.0,  winRange: [500,   1000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 4.0,  winRange: [1000,  2000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 0.35, winRange: [2000,  5000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 0.2,  winRange: [5000,  10000], probability: 1 },
        { criteria: "freespins", scaleFactor: 0.12, winRange: [10000, 15000], probability: 1 },
        { criteria: "freespins", scaleFactor: 1,    winRange: [15000, 15000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.25, winRange: [0.01,  1],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.4,  winRange: [1,     2],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.6,  winRange: [2,     5],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.8,  winRange: [5,     10],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.0,  winRange: [10,    20],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.25, winRange: [20,    50],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.5,  winRange: [50,    100],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.55, winRange: [100,   200],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.45, winRange: [200,   500],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 4.0,  winRange: [500,   1000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 3.5,  winRange: [1000,  2000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.6,  winRange: [2000,  5000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.4,  winRange: [5000,  10000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.22, winRange: [10000, 15000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1,    winRange: [15000, 15000], probability: 1 },
      ]),
      parameters: new OptimizationParameters({
        minMeanToMedian: 2,
        maxMeanToMedian: 4,
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
          rtp: 0.001,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 5,
        }),
        basegame: new OptimizationConditions({
          rtp: 0.16,
          hitRate: 4,
          priority: 1,
        }),
        freespins: new OptimizationConditions({
          rtp: 0.46,
          hitRate: 67,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 2,
        }),
        superfreespins: new OptimizationConditions({
          rtp: 0.339,
          hitRate: 233,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 3,
        }),
      },
      scaling: new OptimizationScaling([
        { criteria: "basegame", scaleFactor: 0.001,  winRange: [0.01,  1],     probability: 1 },
        { criteria: "basegame", scaleFactor: 38.0,   winRange: [1,     2],     probability: 1 },
        { criteria: "basegame", scaleFactor: 3.5,    winRange: [2,     5],     probability: 1 },
        { criteria: "basegame", scaleFactor: 3.0,    winRange: [5,     10],    probability: 1 },
        { criteria: "basegame", scaleFactor: 1.2,    winRange: [10,    20],    probability: 1 },
        { criteria: "basegame", scaleFactor: 0.06,   winRange: [20,    50],    probability: 1 },
        { criteria: "basegame", scaleFactor: 0.02,   winRange: [50,    100],   probability: 1 },
        { criteria: "basegame", scaleFactor: 0.007,  winRange: [100,   200],   probability: 1 },
        { criteria: "basegame", scaleFactor: 0.005,  winRange: [200,   500],   probability: 1 },
        { criteria: "basegame", scaleFactor: 0.003,  winRange: [500,   1000],  probability: 1 },
        { criteria: "basegame", scaleFactor: 0.0015, winRange: [1000,  2000],  probability: 1 },
        { criteria: "basegame", scaleFactor: 0.0,    winRange: [2000,  5000],  probability: 1 },
        { criteria: "basegame", scaleFactor: 0.003,  winRange: [5000,  10000], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.002,  winRange: [10000, 15000], probability: 1 },
        { criteria: "basegame", scaleFactor: 1,      winRange: [15000, 15000], probability: 1 },
        { criteria: "freespins", scaleFactor: 0.08,  winRange: [0.01,  1],     probability: 1 },
        { criteria: "freespins", scaleFactor: 0.35,  winRange: [1,     2],     probability: 1 },
        { criteria: "freespins", scaleFactor: 0.65,  winRange: [2,     5],     probability: 1 },
        { criteria: "freespins", scaleFactor: 1.0,   winRange: [5,     10],    probability: 1 },
        { criteria: "freespins", scaleFactor: 1.4,   winRange: [10,    20],    probability: 1 },
        { criteria: "freespins", scaleFactor: 1.6,   winRange: [20,    50],    probability: 1 },
        { criteria: "freespins", scaleFactor: 1.5,   winRange: [50,    100],   probability: 1 },
        { criteria: "freespins", scaleFactor: 1.0,   winRange: [100,   200],   probability: 1 },
        { criteria: "freespins", scaleFactor: 1.2,   winRange: [200,   500],   probability: 1 },
        { criteria: "freespins", scaleFactor: 5.0,   winRange: [500,   1000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 3.0,   winRange: [1000,  2000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 0.4,   winRange: [2000,  5000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 0.15,  winRange: [5000,  10000], probability: 1 },
        { criteria: "freespins", scaleFactor: 0.06,  winRange: [10000, 15000], probability: 1 },
        { criteria: "freespins", scaleFactor: 1,     winRange: [15000, 15000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.08,  winRange: [0.01,  1],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.2,   winRange: [1,     2],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.4,   winRange: [2,     5],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.7,   winRange: [5,     10],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.1,   winRange: [10,    20],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.6,   winRange: [20,    50],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 2.0,   winRange: [50,    100],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.2,   winRange: [100,   200],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.8,   winRange: [200,   500],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 6.0,   winRange: [500,   1000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 4.0,   winRange: [1000,  2000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.0,   winRange: [2000,  5000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.5,   winRange: [5000,  10000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.25,  winRange: [10000, 15000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1,     winRange: [15000, 15000], probability: 1 },
      ]),
      parameters: new OptimizationParameters({
        minMeanToMedian: 2,
        maxMeanToMedian: 4,
      }),
    },
    bonusHuntPlus: {
      conditions: {
        "0": new OptimizationConditions({
          rtp: 0,
          avgWin: 0,
          searchConditions: 0,
          priority: 10,
        }),
        maxwin: new OptimizationConditions({
          rtp: 0.001,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 5,
        }),
        basegame: new OptimizationConditions({
          rtp: 0.10,
          hitRate: 8,
          priority: 1,
        }),
        freespins: new OptimizationConditions({
          rtp: 0.45,
          hitRate: 10,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 2,
        }),
        superfreespins: new OptimizationConditions({
          rtp: 0.409,
          hitRate: 35,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 3,
        }),
      },
      scaling: new OptimizationScaling([
        { criteria: "basegame", scaleFactor: 1.0,  winRange: [0.01,  1],     probability: 1 },
        { criteria: "basegame", scaleFactor: 1.3,  winRange: [1,     2],     probability: 1 },
        { criteria: "basegame", scaleFactor: 0.7,  winRange: [2,     5],     probability: 1 },
        { criteria: "basegame", scaleFactor: 0.4,  winRange: [5,     10],    probability: 1 },
        { criteria: "basegame", scaleFactor: 0.2,  winRange: [10,    20],    probability: 1 },
        { criteria: "basegame", scaleFactor: 0.08, winRange: [20,    50],    probability: 1 },
        { criteria: "basegame", scaleFactor: 0.03, winRange: [50,    100],   probability: 1 },
        { criteria: "basegame", scaleFactor: 0.01, winRange: [100,   200],   probability: 1 },
        { criteria: "basegame", scaleFactor: 0.005,winRange: [200,   500],   probability: 1 },
        { criteria: "basegame", scaleFactor: 0.003,winRange: [500,   1000],  probability: 1 },
        { criteria: "basegame", scaleFactor: 0.003,winRange: [1000,  2000],  probability: 1 },
        { criteria: "basegame", scaleFactor: 0.0,  winRange: [2000,  5000],  probability: 1 },
        { criteria: "basegame", scaleFactor: 0.003,winRange: [5000,  10000], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.002,winRange: [10000, 15000], probability: 1 },
        { criteria: "basegame", scaleFactor: 1,    winRange: [15000, 15000], probability: 1 },
        { criteria: "freespins", scaleFactor: 0.9,  winRange: [0.01,  1],     probability: 1 },
        { criteria: "freespins", scaleFactor: 1.0,  winRange: [1,     2],     probability: 1 },
        { criteria: "freespins", scaleFactor: 0.8,  winRange: [2,     5],     probability: 1 },
        { criteria: "freespins", scaleFactor: 0.7,  winRange: [5,     10],    probability: 1 },
        { criteria: "freespins", scaleFactor: 0.7,  winRange: [10,    20],    probability: 1 },
        { criteria: "freespins", scaleFactor: 0.8,  winRange: [20,    50],    probability: 1 },
        { criteria: "freespins", scaleFactor: 1.1,  winRange: [50,    100],   probability: 1 },
        { criteria: "freespins", scaleFactor: 1.6,  winRange: [100,   200],   probability: 1 },
        { criteria: "freespins", scaleFactor: 2.2,  winRange: [200,   500],   probability: 1 },
        { criteria: "freespins", scaleFactor: 4.0,  winRange: [500,   1000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 3.5,  winRange: [1000,  2000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 2.0,  winRange: [2000,  5000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 1.0,  winRange: [5000,  10000], probability: 1 },
        { criteria: "freespins", scaleFactor: 0.5,  winRange: [10000, 15000], probability: 1 },
        { criteria: "freespins", scaleFactor: 1,    winRange: [15000, 15000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.5,  winRange: [0.01,  1],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.7,  winRange: [1,     2],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.7,  winRange: [2,     5],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.8,  winRange: [5,     10],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.9,  winRange: [10,    20],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.0,  winRange: [20,    50],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.2,  winRange: [50,    100],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.6,  winRange: [100,   200],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 2.2,  winRange: [200,   500],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 4.5,  winRange: [500,   1000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 4.0,  winRange: [1000,  2000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 2.5,  winRange: [2000,  5000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.2,  winRange: [5000,  10000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.6,  winRange: [10000, 15000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1,    winRange: [15000, 15000], probability: 1 },
      ]),
      parameters: new OptimizationParameters(),
    },
    bonusFeature: {
      conditions: {
        maxwin: new OptimizationConditions({
          rtp: 0.0001,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 5,
        }),
        freespins: new OptimizationConditions({
          rtp: 0.9599,
          hitRate: 1,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 1,
        }),
      },
      scaling: new OptimizationScaling([
        { criteria: "freespins", scaleFactor: 0.25, winRange: [0.01,  1],     probability: 1 },
        { criteria: "freespins", scaleFactor: 0.35, winRange: [1,     2],     probability: 1 },
        { criteria: "freespins", scaleFactor: 0.5,  winRange: [2,     5],     probability: 1 },
        { criteria: "freespins", scaleFactor: 0.7,  winRange: [5,     10],    probability: 1 },
        { criteria: "freespins", scaleFactor: 0.85, winRange: [10,    20],    probability: 1 },
        { criteria: "freespins", scaleFactor: 1.0,  winRange: [20,    50],    probability: 1 },
        { criteria: "freespins", scaleFactor: 1.2,  winRange: [50,    100],   probability: 1 },
        { criteria: "freespins", scaleFactor: 1.6,  winRange: [100,   200],   probability: 1 },
        { criteria: "freespins", scaleFactor: 2.2,  winRange: [200,   500],   probability: 1 },
        { criteria: "freespins", scaleFactor: 2.8,  winRange: [500,   1000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 2.0,  winRange: [1000,  2000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 1.0,  winRange: [2000,  5000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 0.5,  winRange: [5000,  10000], probability: 1 },
        { criteria: "freespins", scaleFactor: 0.25, winRange: [10000, 15000], probability: 1 },
        { criteria: "freespins", scaleFactor: 1,    winRange: [15000, 15000], probability: 1 },
      ]),
      parameters: new OptimizationParameters(),
    },
    superBonusFeature: {
      conditions: {
        maxwin: new OptimizationConditions({
          rtp: 0.0001,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 5,
        }),
        superfreespins: new OptimizationConditions({
          rtp: 0.9599,
          hitRate: 1,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 1,
        }),
      },
      scaling: new OptimizationScaling([
        { criteria: "superfreespins", scaleFactor: 0.15, winRange: [0.01,  1],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.25, winRange: [1,     2],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.4,  winRange: [2,     5],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.6,  winRange: [5,     10],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.8,  winRange: [10,    20],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.0,  winRange: [20,    50],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.2,  winRange: [50,    100],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.5,  winRange: [100,   200],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 2.0,  winRange: [200,   500],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 3.5,  winRange: [500,   1000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 3.0,  winRange: [1000,  2000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 2.0,  winRange: [2000,  5000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.0,  winRange: [5000,  10000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.5,  winRange: [10000, 15000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1,    winRange: [15000, 15000], probability: 1 },
      ]),
      parameters: new OptimizationParameters(),
    },
    guaranteedTwoWilds: {
      conditions: {
        "0": new OptimizationConditions({
          rtp: 0,
          avgWin: 0,
          searchConditions: 0,
          priority: 10,
        }),
        maxwin: new OptimizationConditions({
          rtp: 0.0001,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 5,
        }),
        basegame: new OptimizationConditions({
          rtp: 0.42,
          hitRate: 4,
          priority: 1,
        }),
        freespins: new OptimizationConditions({
          rtp: 0.30,
          hitRate: 200,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 2,
        }),
        superfreespins: new OptimizationConditions({
          rtp: 0.2399,
          hitRate: 700,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 3,
        }),
      },
      scaling: new OptimizationScaling([
        { criteria: "basegame", scaleFactor: 0.001,  winRange: [0.01,  1],     probability: 1 },
        { criteria: "basegame", scaleFactor: 35.0,   winRange: [1,     2],     probability: 1 },
        { criteria: "basegame", scaleFactor: 8.0,    winRange: [2,     5],     probability: 1 },
        { criteria: "basegame", scaleFactor: 5.0,    winRange: [5,     10],    probability: 1 },
        { criteria: "basegame", scaleFactor: 2.5,    winRange: [10,    20],    probability: 1 },
        { criteria: "basegame", scaleFactor: 1.0,    winRange: [20,    50],    probability: 1 },
        { criteria: "basegame", scaleFactor: 0.35,   winRange: [50,    100],   probability: 1 },
        { criteria: "basegame", scaleFactor: 0.12,   winRange: [100,   200],   probability: 1 },
        { criteria: "basegame", scaleFactor: 0.04,   winRange: [200,   500],   probability: 1 },
        { criteria: "basegame", scaleFactor: 0.015,  winRange: [500,   1000],  probability: 1 },
        { criteria: "basegame", scaleFactor: 0.006,  winRange: [1000,  2000],  probability: 1 },
        { criteria: "basegame", scaleFactor: 0.0,    winRange: [2000,  5000],  probability: 1 },
        { criteria: "basegame", scaleFactor: 0.003,  winRange: [5000,  10000], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.002,  winRange: [10000, 15000], probability: 1 },
        { criteria: "basegame", scaleFactor: 1,      winRange: [15000, 15000], probability: 1 },
        { criteria: "freespins", scaleFactor: 0.15,  winRange: [0.01,  1],     probability: 1 },
        { criteria: "freespins", scaleFactor: 0.4,   winRange: [1,     2],     probability: 1 },
        { criteria: "freespins", scaleFactor: 0.8,   winRange: [2,     5],     probability: 1 },
        { criteria: "freespins", scaleFactor: 1.5,   winRange: [5,     10],    probability: 1 },
        { criteria: "freespins", scaleFactor: 3.0,   winRange: [10,    20],    probability: 1 },
        { criteria: "freespins", scaleFactor: 5.5,   winRange: [20,    50],    probability: 1 },
        { criteria: "freespins", scaleFactor: 2.5,   winRange: [50,    100],   probability: 1 },
        { criteria: "freespins", scaleFactor: 0.7,   winRange: [100,   200],   probability: 1 },
        { criteria: "freespins", scaleFactor: 0.35,  winRange: [200,   500],   probability: 1 },
        { criteria: "freespins", scaleFactor: 3.2,   winRange: [500,   1000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 2.0,   winRange: [1000,  2000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 0.004, winRange: [2000,  5000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 0.002, winRange: [5000,  10000], probability: 1 },
        { criteria: "freespins", scaleFactor: 0.005, winRange: [10000, 15000], probability: 1 },
        { criteria: "freespins", scaleFactor: 1,     winRange: [15000, 15000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.1,   winRange: [0.01,  1],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.25,  winRange: [1,     2],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.5,   winRange: [2,     5],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.0,   winRange: [5,     10],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 2.0,   winRange: [10,    20],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 4.0,   winRange: [20,    50],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 3.0,   winRange: [50,    100],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.0,   winRange: [100,   200],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.55,  winRange: [200,   500],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 4.0,   winRange: [500,   1000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 3.0,   winRange: [1000,  2000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.007, winRange: [2000,  5000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.04,  winRange: [5000,  10000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.005, winRange: [10000, 15000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1,     winRange: [15000, 15000], probability: 1 },
      ]),
      parameters: new OptimizationParameters({
        minMeanToMedian: 2,
        maxMeanToMedian: 5,
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
