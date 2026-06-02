/// <reference types="node" />
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
import { REELS } from "./src/reels"
import { onHandleGameFlow } from "./src/onHandleGameFlow"
import { maxwinReelsEvaluation } from "./src/evaluations"

export const userState = defineUserState({
  boardMultis: [] as number[][],
  // Which free-spin tier the current feature is in. Determined by how many
  // scatters triggered the feature: 3 -> normal, 4-5 -> super, 6 -> hidden.
  fsTier: "normal" as "normal" | "super" | "hidden",
  // Feature-wide global multiplier applied to every win. Stays 1x in the base
  // game and normal free spins; ramps up during super/hidden free spins.
  fsGlobalMulti: 1,
})

export type UserStateType = typeof userState

/**
 * 6x5 cluster-pays game.
 * Wins are awarded for clusters of 5 or more matching symbols that are
 * horizontally or vertically adjacent. After every win the winning symbols
 * are removed and new symbols tumble down to fill the board.
 *
 * Pay table (cluster size -> multiplier of bet):
 *   Symbol | 10+  |   9  |   8  |   7  |   6  |   5
 *   H1     |  5x  | 2.5x |  2x  | 0.7x | 0.6x | 0.5x
 *   H2     |  4x  |  2x  | 1.5x | 0.6x | 0.5x | 0.4x
 *   H3     |  3x  | 1.5x | 1.2x | 0.5x | 0.4x | 0.3x
 *   H4     |  2x  | 1.2x |  1x  | 0.4x | 0.3x | 0.2x
 *   L1     | 0.8x | 0.7x | 0.6x | 0.3x | 0.2x | 0.1x
 *   L2     | 0.7x | 0.6x | 0.5x | 0.3x | 0.2x | 0.1x
 *   L3     | 0.6x | 0.5x | 0.4x | 0.3x | 0.2x | 0.1x
 *
 * The "10+" column is encoded as the pay for cluster size 10. Any cluster of
 * 10 or more symbols resolves to this value via `getSymbolPayout`.
 */
export const symbols = defineSymbols({
  S: new GameSymbol({
    id: "S",
    properties: {
      isScatter: true,
    },
  }),
  H1: new GameSymbol({
    id: "H1",
    pays: {
      5: 0.5,
      6: 0.6,
      7: 0.7,
      8: 2,
      9: 2.5,
      10: 5,
    },
  }),
  H2: new GameSymbol({
    id: "H2",
    pays: {
      5: 0.4,
      6: 0.5,
      7: 0.6,
      8: 1.5,
      9: 2,
      10: 4,
    },
  }),
  H3: new GameSymbol({
    id: "H3",
    pays: {
      5: 0.3,
      6: 0.4,
      7: 0.5,
      8: 1.2,
      9: 1.5,
      10: 3,
    },
  }),
  H4: new GameSymbol({
    id: "H4",
    pays: {
      5: 0.2,
      6: 0.3,
      7: 0.4,
      8: 1,
      9: 1.2,
      10: 2,
    },
  }),
  L1: new GameSymbol({
    id: "L1",
    pays: {
      5: 0.1,
      6: 0.2,
      7: 0.3,
      8: 0.6,
      9: 0.7,
      10: 0.8,
    },
  }),
  L2: new GameSymbol({
    id: "L2",
    pays: {
      5: 0.1,
      6: 0.2,
      7: 0.3,
      8: 0.5,
      9: 0.6,
      10: 0.7,
    },
  }),
  L3: new GameSymbol({
    id: "L3",
    pays: {
      5: 0.1,
      6: 0.2,
      7: 0.3,
      8: 0.4,
      9: 0.5,
      10: 0.6,
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
    reelSets: [...Object.values(REELS)],
    resultSets: [
      new ResultSet({
        criteria: "0",
        quota: 0.4,
        multiplier: 0,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { bonus: 1 },
        },
      }),
      new ResultSet({
        criteria: "basegame",
        quota: 0.4,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { bonus: 1 },
        },
      }),
      new ResultSet({
        criteria: "freespins",
        quota: 0.1,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { bonus: 1 },
        },
      }),
      new ResultSet({
        criteria: "maxwin",
        quota: 0.01,
        forceMaxWin: true,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { bonus: 1 },
          evaluate: maxwinReelsEvaluation,
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
    reelSets: [...Object.values(REELS)],
    resultSets: [
      new ResultSet({
        criteria: "freespins",
        quota: 0.9,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { bonus: 1 },
        },
      }),
      new ResultSet({
        criteria: "maxwin",
        quota: 0.01,
        forceMaxWin: true,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { bonus: 1 },
          evaluate: maxwinReelsEvaluation,
        },
      }),
    ],
  }),
})

export type GameModesType = typeof gameModes

export type GameType = InferGameType<GameModesType, SymbolsType, UserStateType>

export const game = createSlotGame<GameType>({
  id: "cluster-game-og",
  name: "Cluster Game OG",
  maxWinX: 15000,
  gameModes,
  symbols,
  padSymbols: 1,
  scatterToFreespins: {
    [SPIN_TYPE.BASE_GAME]: {
      3: 10,
      4: 12,
      5: 15,
      6: 20,
    },
    [SPIN_TYPE.FREE_SPINS]: {
      3: 10,
      4: 12,
      5: 15,
      6: 20,
    },
  },
  userState,
  hooks: {
    onHandleGameFlow,
  },
  rootDir: __dirname, // optional, but required if connecting this game to @slot-engine/panel
})

game.configureSimulation({
  simRunsAmount: {
    base: 100000,
    bonusFeature: 100000,
  },
  concurrency: 8,
})

game.configureOptimization({
  gameModes: {
    base: {
      conditions: {
        maxwin: new OptimizationConditions({
          rtp: 0.01,
          avgWin: 15000,
          searchConditions: {
            criteria: "maxwin",
          },
          priority: 8,
        }),
        "0": new OptimizationConditions({
          rtp: 0,
          avgWin: 0,
          searchConditions: 0,
          priority: 6,
        }),
        freespins: new OptimizationConditions({
          rtp: 0.38,
          hitRate: 150,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 2,
        }),
        basegame: new OptimizationConditions({
          rtp: 0.57,
          hitRate: 4,
          priority: 1,
        }),
      },
      scaling: new OptimizationScaling([]),
      parameters: new OptimizationParameters(),
    },
    bonusFeature: {
      conditions: {
        maxwin: new OptimizationConditions({
          rtp: 0.01,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 2,
        }),
        freespins: new OptimizationConditions({
          rtp: 0.95,
          hitRate: "x",
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
    gameModes: ["base", "bonusFeature"],
  },
  doAnalysis: true,
  analysisOpts: {
    gameModes: ["base", "bonusFeature"],
  },
})
