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
      3: 2,
      4: 1.5,
      5: 1,
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
        quota: 0.3,
        multiplier: 0,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { freespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "basegame",
        quota: 0.6,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { freespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "freespins",
        quota: 0.075,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { freespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "superfreespins",
        quota: 0.015,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { superfreespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "hiddenfreespins",
        quota: 0.01,
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
  maxWinX: 15000,
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

game.configureSimulation({
  simRunsAmount: {
    base: 10000,
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
          priority: 3,
        }),
        basegame: new OptimizationConditions({
          rtp: 0.68,
          hitRate: 4,
          priority: 1,
        }),
        freespins: new OptimizationConditions({
          rtp: 0.22,
          hitRate: 150,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 2,
        }),
        superfreespins: new OptimizationConditions({
          rtp: 0.04,
          hitRate: 300,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 4,
        }),
        hiddenfreespins: new OptimizationConditions({
          rtp: 0.02,
          hitRate: 500,
          searchConditions: {
            criteria: "hiddenfreespins",
          },
          priority: 5,
        }),
      },
      scaling: new OptimizationScaling([]),
      parameters: new OptimizationParameters(),
    },
  },
})

game.runTasks({
  doSimulation: true,
  doOptimization: false,
  optimizationOpts: {
    gameModes: ["base"],
  },
  doAnalysis: true,
  analysisOpts: {
    gameModes: ["base"],
  },
})
