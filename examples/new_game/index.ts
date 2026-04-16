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
  persistentWildReels: new Map<number, number>(), // reelIndex -> multiplier
  totalFreeSpinsWin: 0,
  isSuperFreeSpins: false,
  isFirstSuperFreeSpin: false,
  isHiddenFreeSpins: false,
  isFirstHiddenFreeSpin: false,
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
      5: 14,
    },
  }),
  WR: new GameSymbol({
    id: "WR",
    properties: {
      isWildReel: true,
      isWild: true,
    },
  }),
  H1: new GameSymbol({
    id: "H1",
    pays: {
      3: 3,
      4: 6,
      5: 14,
    },
  }),
  H2: new GameSymbol({
    id: "H2",
    pays: {
      3: 1.2,
      4: 2,
      5: 4,
    },
  }),
  H3: new GameSymbol({
    id: "H3",
    pays: {
      3: 1.2,
      4: 2,
      5: 4,
    },
  }),
  H4: new GameSymbol({
    id: "H4",
    pays: {
      3: 1,
      4: 1.5,
      5: 2,
    },
  }),
  L1: new GameSymbol({
    id: "L1",
    pays: {
      3: 1,
      4: 1.5,
      5: 2,
    },
  }),
  L2: new GameSymbol({
    id: "L2",
    pays: {
      3: 0.2,
      4: 0.6,
      5: 1.2,
    },
  }),
  L3: new GameSymbol({
    id: "L3",
    pays: {
      3: 0.2,
      4: 0.6,
      5: 1.2,
    },
  }),
  L4: new GameSymbol({
    id: "L4",
    pays: {
      3: 0.1,
      4: 0.5,
      5: 1,
    },
  }),
  L5: new GameSymbol({
    id: "L5",
    pays: {
      3: 0.1,
      4: 0.5,
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
    symbolsPerReel: [5, 5, 5, 5, 5],
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
        quota: 0.40,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { freespin: 1, freespin2: 1, freespin3: 1 },
        },
      }),
      new ResultSet({
        criteria: "freespins",
        quota: 0.144,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { freespin: 55, maxwin: 30 },
        },
      }),
      new ResultSet({
        criteria: "superfreespins",
        quota: 0.133,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { superfreespin: 40, maxwin: 10 },
        },
      }),
      new ResultSet({
        criteria: "hiddenfreespins",
        quota: 0.113,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { hiddenfreespin: 30, maxwin: 10 },
        },
      }),
    ],
  }),
  extraChance: new GameMode({
    name: "extraChance",
    cost: 2,
    rtp: 0.96,
    reelsAmount: 5,
    symbolsPerReel: [5, 5, 5, 5, 5],
    isBonusBuy: false,
    reelSets: [...Object.values(GENERATORS)],
    resultSets: [
      new ResultSet({
        criteria: "0",
        quota: 0.14,
        multiplier: 0,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { freespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "basegame",
        quota: 0.367,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { freespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "freespins",
        quota: 0.254,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { freespin: 250, maxwin: 55 },
        },
      }),
      new ResultSet({
        criteria: "superfreespins",
        quota: 0.133,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { superfreespin: 130, maxwin: 22 },
        },
      }),
      new ResultSet({
        criteria: "hiddenfreespins",
        quota: 0.096,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { hiddenfreespin: 90, maxwin: 22 },
        },
      }),
    ],
  }),
  guaranteedWildReelAndWild: new GameMode({
    name: "guaranteedWildReelAndWild",
    cost: 50,
    rtp: 0.96,
    reelsAmount: 5,
    symbolsPerReel: [5, 5, 5, 5, 5],
    isBonusBuy: false,
    reelSets: [...Object.values(GENERATORS)],
    resultSets: [
      new ResultSet({
        criteria: "0",
        quota: 0.2,
        multiplier: 0,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { guaranteedWildReelAndWild: 1 },
          [SPIN_TYPE.FREE_SPINS]: { },
        },
      }),
      new ResultSet({
        criteria: "basegame",
        quota: 0.8,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { guaranteedWildReelAndWild: 1 },
          [SPIN_TYPE.FREE_SPINS]: { },
        },
      }),
    ],
  }),
  bonusbuy: new GameMode({
    name: "bonusbuy",
    cost: 100,
    rtp: 0.96,
    reelsAmount: 5,
    symbolsPerReel: [5, 5, 5, 5, 5],
    isBonusBuy: true,
    reelSets: [...Object.values(GENERATORS)],
    resultSets: [
      new ResultSet({
        criteria: "freespins",
        quota: 1,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { freespin: 1, freespin2: 3},
        },
      }),
    ],
  }),
  superBonusBuy: new GameMode({
    name: "superBonusBuy",
    cost: 300,
    rtp: 0.96,
    reelsAmount: 5,
    symbolsPerReel: [5, 5, 5, 5, 5],
    isBonusBuy: true,
    reelSets: [...Object.values(GENERATORS)],
    resultSets: [
      new ResultSet({
        criteria: "superfreespins",
        quota: 0.90,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { superfreespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "hiddenfreespins",
        quota: 0.10,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { hiddenfreespin: 1 },
        },
      }),
    ],
  }),
})

export type GameModesType = typeof gameModes

export type GameType = InferGameType<GameModesType, SymbolsType, UserStateType>

export const game = createSlotGame<GameType>({
  id: "new-game",
  name: "New Slot Game",
  maxWinX: 10000,
  gameModes,
  symbols,
  padSymbols: 1,
  scatterToFreespins: {
    [SPIN_TYPE.BASE_GAME]: {
      3: 10,
      4: 10,
      5: 10,
    },
    [SPIN_TYPE.FREE_SPINS]: {
      // No retriggering in this implementation
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
    base: 100000,
    extraChance: 100000,
    guaranteedWildReelAndWild: 100000,
    bonusbuy: 100000,
    superBonusBuy: 100000,
  },
  concurrency: 8,
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
        basegame: new OptimizationConditions({
          rtp: 0.29,
          hitRate: 4,
          priority: 1,
        }),
        freespins: new OptimizationConditions({
          rtp: 0.30,
          hitRate: 150,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 2,
        }),
        superfreespins: new OptimizationConditions({
          rtp: 0.17,
          hitRate: 300,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 3,
        }),
        hiddenfreespins: new OptimizationConditions({
          rtp: 0.20,
          hitRate: 450,
          searchConditions: {
            criteria: "hiddenfreespins",
          },
          priority: 4,
        }),
      },
      scaling: new OptimizationScaling([]),
      parameters: new OptimizationParameters(),
    },
    extraChance: {
      conditions: {
        "0": new OptimizationConditions({
          rtp: 0,
          avgWin: 0,
          searchConditions: 0,
          priority: 10,
        }),
        basegame: new OptimizationConditions({
          rtp: 0.30,
          hitRate: 5,
          priority: 1,
        }),
        freespins: new OptimizationConditions({
          rtp: 0.31,
          hitRate: 50,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 2,
        }),
        superfreespins: new OptimizationConditions({
          rtp: 0.18,
          hitRate: 100,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 3,
        }),
        hiddenfreespins: new OptimizationConditions({
          rtp: 0.17,
          hitRate: 150,
          searchConditions: {
            criteria: "hiddenfreespins",
          },
          priority: 4,
        }),
      },
      scaling: new OptimizationScaling([]),
      parameters: new OptimizationParameters(),
    },
    guaranteedWildReelAndWild: {
      conditions: {
        "0": new OptimizationConditions({
          rtp: 0,
          avgWin: 0,
          searchConditions: 0,
          priority: 4,
        }),
        basegame: new OptimizationConditions({
          rtp: 0.96,
          hitRate: 3,
          priority: 1,
        }),
      },
      scaling: new OptimizationScaling([]),
      parameters: new OptimizationParameters(),
    },
    bonusbuy: {
      conditions: {
        freespins: new OptimizationConditions({
          rtp: 0.96,
          hitRate: 1,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 1,
        }),
      },
      scaling: new OptimizationScaling([]),
      parameters: new OptimizationParameters(),
    },
    superBonusBuy: {
      conditions: {
        superfreespins: new OptimizationConditions({
          rtp: 0.81,
          hitRate: "x",
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 1,
        }),
        hiddenfreespins: new OptimizationConditions({
          rtp: 0.15,
          hitRate: 40,
          searchConditions: {
            criteria: "hiddenfreespins",
          },
          priority: 2,
        }),
      },
      scaling: new OptimizationScaling([]),
      parameters: new OptimizationParameters(),
    },
  },
})

game.runTasks({
  doSimulation: true,
  doOptimization: true,
  optimizationOpts: {
    gameModes: ["base", "extraChance", "guaranteedWildReelAndWild", "bonusbuy", "superBonusBuy"],
  },
  doAnalysis: true,
  analysisOpts: {
    gameModes: ["base", "extraChance", "guaranteedWildReelAndWild", "bonusbuy", "superBonusBuy"],
  },
})
