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
  // Per-position Wild instant-pay values assigned at reveal time.
  // Each entry maps a board position to the random pool value drawn for that Wild.
  wildValues: [] as Array<{ reel: number; row: number; value: number }>,
  // Per-spin symbol multiplier for super/hidden free spins.
  // A random non-scatter symbol and multiplier are drawn at the start of each
  // free spin; all cluster wins for that symbol are boosted by the value.
  // Null during base game and normal free spins.
  globalSymbolMulti: null as { symbol: string; multiplier: number } | null,
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
  // Wild pays an instant random amount from the WILD_PAY_POOL (defined in
  // onHandleGameFlow) and tumbles out immediately — it never forms clusters.
  W: new GameSymbol({
    id: "W",
    properties: {
      isWild: true,
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
  // superBonusFeature: 300x cost bonus-buy. The "superbonus" criteria forces
  // free spins with at least 4 scatters (see getScatterWeights in
  // onHandleGameFlow), so the feature always enters super (4-5 scatters) or
  // hidden (6 scatters) free spins — never the normal tier.
  superBonusFeature: new GameMode({
    name: "superBonusFeature",
    cost: 300,
    rtp: 0.96,
    reelsAmount: 6,
    symbolsPerReel: [5, 5, 5, 5, 5, 5],
    isBonusBuy: true,
    reelSets: [...Object.values(REELS)],
    resultSets: [
      new ResultSet({
        criteria: "superbonus",
        quota: 0.99,
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
  // bonusHunt: 2x cost. Triggers the bonus (any tier — normal, super or hidden)
  // 3x more often than base. The increased frequency is enforced by the
  // freespins fence hit rate in the optimization config (base 150 -> 50).
  bonusHunt: new GameMode({
    name: "bonusHunt",
    cost: 2,
    rtp: 0.96,
    reelsAmount: 6,
    symbolsPerReel: [5, 5, 5, 5, 5, 5],
    isBonusBuy: false,
    reelSets: [...Object.values(REELS)],
    resultSets: [
      new ResultSet({
        criteria: "0",
        quota: 0.3,
        multiplier: 0,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { bonus: 1 },
        },
      }),
      new ResultSet({
        criteria: "basegame",
        quota: 0.3,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { bonus: 1 },
        },
      }),
      new ResultSet({
        criteria: "freespins",
        quota: 0.35,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { bonus: 1 },
        },
      }),
      new ResultSet({
        criteria: "maxwin",
        quota: 0.05,
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
  // bonusHuntPlus: 5x cost. Triggers the bonus (any tier) 10x more often than
  // base. The freespins fence hit rate drops from base 150 -> 15.
  bonusHuntPlus: new GameMode({
    name: "bonusHuntPlus",
    cost: 5,
    rtp: 0.96,
    reelsAmount: 6,
    symbolsPerReel: [5, 5, 5, 5, 5, 5],
    isBonusBuy: false,
    reelSets: [...Object.values(REELS)],
    resultSets: [
      new ResultSet({
        criteria: "0",
        quota: 0.2,
        multiplier: 0,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { bonus: 1 },
        },
      }),
      new ResultSet({
        criteria: "basegame",
        quota: 0.2,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { bonus: 1 },
        },
      }),
      new ResultSet({
        criteria: "freespins",
        quota: 0.55,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { bonus: 1 },
        },
      }),
      new ResultSet({
        criteria: "maxwin",
        quota: 0.05,
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
  rootDir: process.cwd(), // use cwd so the path is correct whether running via tsx or the compiled bundle
})

game.configureSimulation({
  simRunsAmount: {
    base: 100000,
    bonusFeature: 100000,
    superBonusFeature: 100000,
    bonusHunt: 100000,
    bonusHuntPlus: 100000,
  },
  concurrency: 8,
})

game.configureOptimization({
  gameModes: {
    base: {
      conditions: {
        maxwin: new OptimizationConditions({
          rtp: 0.0015,
          avgWin: 15000,
          searchConditions: 15000,
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
          rtp: 0.5785,
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
          rtp: 0.0001,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 2,
        }),
        freespins: new OptimizationConditions({
          rtp: 0.9599,
          hitRate: "x",
          priority: 1,
        }),
      },
      scaling: new OptimizationScaling([]),
      parameters: new OptimizationParameters(),
    },
    // superBonusFeature (cost 300x): bonus-buy that always lands 4+ scatters
    // via the "superbonus" criteria, so it enters super or hidden free spins.
    superBonusFeature: {
      conditions: {
        maxwin: new OptimizationConditions({
          rtp: 0.0001,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 2,
        }),
        superbonus: new OptimizationConditions({
          rtp: 0.9599,
          hitRate: "x",
          searchConditions: {
            criteria: "superbonus",
          },
          priority: 1,
        }),
      },
      scaling: new OptimizationScaling([]),
      parameters: new OptimizationParameters(),
    },
    // bonusHunt (cost 2x): bonus triggers 3x more often than base.
    // freespins hitRate 50 = base 150 / 3. Max-win target is 1 in 5M spins.
    // RTP budget shifts from base game into the freespins fence.
    // Total: 0.0015 + 0 + 0.65 + 0.3085 = 0.96.
    //
    // NOTE: the maxwin fence MUST use an exact-number searchConditions (15000),
    // NOT { criteria: "maxwin" }. An exact number makes this a "win_type" fence:
    // the optimizer injects the single 15000x win straight into the lookup table
    // with probability 1/hr and never tries to fit a distribution. A criteria
    // search instead builds a distribution from the maxwin-tagged sims, which
    // all pay ~15000x (zero variance) and trips the Rust optimizer's
    // "Unable to optimize! RTP too low... Not enough variance/range in wins".
    bonusHunt: {
      conditions: {
        maxwin: new OptimizationConditions({
          rtp: 0.0015,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 8,
        }),
        "0": new OptimizationConditions({
          rtp: 0,
          avgWin: 0,
          searchConditions: 0,
          priority: 6,
        }),
        freespins: new OptimizationConditions({
          rtp: 0.65,
          hitRate: 50,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 2,
        }),
        basegame: new OptimizationConditions({
          rtp: 0.3085,
          hitRate: 4,
          priority: 1,
        }),
      },
      scaling: new OptimizationScaling([]),
      parameters: new OptimizationParameters(),
    },
    // bonusHuntPlus (cost 5x): bonus triggers 10x more often than base.
    // freespins hitRate 15 = base 150 / 10. Max-win target is 1 in 2M spins.
    // Total: 0.0015 + 0 + 0.80 + 0.1585 = 0.96.
    // maxwin uses exact-number searchConditions (15000) for the same win_type
    // reason described on the bonusHunt fence above.
    bonusHuntPlus: {
      conditions: {
        maxwin: new OptimizationConditions({
          rtp: 0.0015,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 8,
        }),
        "0": new OptimizationConditions({
          rtp: 0,
          avgWin: 0,
          searchConditions: 0,
          priority: 6,
        }),
        freespins: new OptimizationConditions({
          rtp: 0.8,
          hitRate: 15,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 2,
        }),
        basegame: new OptimizationConditions({
          rtp: 0.1585,
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
    gameModes: ["base", "bonusFeature", "superBonusFeature", "bonusHunt", "bonusHuntPlus"],
  },
  doAnalysis: true,
  analysisOpts: {
    gameModes: ["base", "bonusFeature", "superBonusFeature", "bonusHunt", "bonusHuntPlus"],
  },
})
