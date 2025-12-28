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

export const userState = defineUserState({})

export type UserStateType = typeof userState

export const symbols = defineSymbols({
  W: new GameSymbol({
    id: "W",
    properties: {
      isWild: true,
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
      3: 20,
      4: 75,
      5: 200,
    },
  }),
  H2: new GameSymbol({
    id: "H2",
    pays: {
      3: 10,
      4: 35,
      5: 150,
    },
  }),
  H3: new GameSymbol({
    id: "H3",
    pays: {
      3: 5,
      4: 10,
      5: 50,
    },
  }),
  H4: new GameSymbol({
    id: "H4",
    pays: {
      3: 3,
      4: 5,
      5: 10,
    },
  }),
  L1: new GameSymbol({
    id: "L1",
    pays: {
      3: 1,
      4: 2,
      5: 4,
    },
  }),
  L2: new GameSymbol({
    id: "L2",
    pays: {
      3: 0.6,
      4: 0.8,
      5: 1.2,
    },
  }),
  L3: new GameSymbol({
    id: "L3",
    pays: {
      3: 0.5,
      4: 0.8,
      5: 1,
    },
  }),
  L4: new GameSymbol({
    id: "L4",
    pays: {
      3: 0.2,
      4: 0.5,
      5: 0.8,
    },
  }),
  L5: new GameSymbol({
    id: "L5",
    pays: {
      3: 0.2,
      4: 0.5,
      5: 0.8,
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
          [SPIN_TYPE.FREE_SPINS]: { base: 1 },
        },
      }),
      new ResultSet({
        criteria: "basegame",
        quota: 0.7,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { base: 1 },
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
  scatterToFreespins: {},
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
          priority: 2,
        }),
        basegame: new OptimizationConditions({
          rtp: 0.96,
          hitRate: 4,
          priority: 1,
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
    gameModes: ["base"],
  },
  doAnalysis: true,
  analysisOpts: {
    gameModes: ["base"],
  },
})
