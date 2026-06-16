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
  // scatters triggered the feature: 3 -> normal, 4 -> super, 5 -> hidden.
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
        quota: 0.3,
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
        quota: 0.12,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { bonus: 1 },
        },
      }),
      new ResultSet({
        criteria: "superfreespins",
        quota: 0.04,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { superBonus: 1 },
        },
      }),
      new ResultSet({
        criteria: "hiddenfreespins",
        quota: 0.02,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { hiddenBonus: 1 },
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
  // bonusFeature: 100x cost bonus-buy. The "freespins" criteria forces exactly
  // 3 scatters (see getScatterWeights in onHandleGameFlow), so this buy ALWAYS
  // delivers a normal-tier free-spin round — never super or hidden.
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
  // superBonusFeature: 300x cost bonus-buy. The "superfreespins" criteria forces
  // exactly 4 scatters (see getScatterWeights in onHandleGameFlow), so this buy
  // ALWAYS delivers a super-tier free-spin round — never normal or hidden.
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
        criteria: "superfreespins",
        quota: 0.99,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { superBonus: 1 },
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
  // bonusHunt: 3x cost. Triggers a bonus (any tier — normal, super or hidden)
  // 5x more often than base. The combined free-spin fence hit rate in the
  // optimization config enforces this (base ~1/150 -> ~1/30 overall).
  bonusHunt: new GameMode({
    name: "bonusHunt",
    cost: 3,
    rtp: 0.96,
    reelsAmount: 6,
    symbolsPerReel: [5, 5, 5, 5, 5, 5],
    isBonusBuy: false,
    reelSets: [...Object.values(REELS)],
    resultSets: [
      new ResultSet({
        criteria: "0",
        quota: 0.25,
        multiplier: 0,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { bonus: 1 },
        },
      }),
      new ResultSet({
        criteria: "basegame",
        quota: 0.25,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { bonus: 1 },
        },
      }),
      new ResultSet({
        criteria: "freespins",
        quota: 0.49,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { bonus: 1 },
        },
      }),
      new ResultSet({
        criteria: "superfreespins",
        quota: 0.1,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { superBonus: 1 },
        },
      }),
      new ResultSet({
        criteria: "hiddenfreespins",
        quota: 0.05,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { hiddenBonus: 1 },
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
  // bonusHuntPlus: 10x cost. Triggers a bonus (any tier) 20x more often than
  // base. The combined free-spin fence hit rate enforces this (base ~1/150 ->
  // ~1/7.5 overall).
  bonusHuntPlus: new GameMode({
    name: "bonusHuntPlus",
    cost: 10,
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
        quota: 0.59,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { bonus: 1 },
        },
      }),
      new ResultSet({
        criteria: "superfreespins",
        quota: 0.15,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { superBonus: 1 },
        },
      }),
      new ResultSet({
        criteria: "hiddenfreespins",
        quota: 0.05,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { hiddenBonus: 1 },
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
  // MysteryBonusFeature: 500x cost bonus-buy. Delivers a random bonus tier each
  // buy: 60% normal, 30% super, 10% hidden. The split is enforced by the result
  // set quotas below (0.6 / 0.3 / 0.1), each forcing its tier's scatter count.
  MysteryBonusFeature: new GameMode({
    name: "MysteryBonusFeature",
    cost: 500,
    rtp: 0.96,
    reelsAmount: 6,
    symbolsPerReel: [5, 5, 5, 5, 5, 5],
    isBonusBuy: true,
    reelSets: [...Object.values(REELS)],
    resultSets: [
      new ResultSet({
        criteria: "freespins",
        quota: 0.6,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { bonus: 1 },
        },
      }),
      new ResultSet({
        criteria: "superfreespins",
        quota: 0.3,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { superBonus: 1 },
        },
      }),
      new ResultSet({
        criteria: "hiddenfreespins",
        quota: 0.1,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { hiddenBonus: 1 },
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
  maxWinX: 25000,
  gameModes,
  symbols,
  padSymbols: 1,
  scatterToFreespins: {
    // Base-game trigger: a fixed 12 free spins regardless of tier.
    //   3 scatters -> Bonus, 4 -> Super Bonus, 5 -> Hidden Bonus.
    [SPIN_TYPE.BASE_GAME]: {
      3: 12,
      4: 12,
      5: 12,
    },
    // Free-spin retrigger: scaled by how many scatters land.
    //   3 -> +3, 4 -> +5, 5 -> +8 free spins.
    [SPIN_TYPE.FREE_SPINS]: {
      3: 3,
      4: 5,
      5: 8,
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
    bonusHunt: 100000,
    bonusHuntPlus: 100000,
    bonusFeature: 100000,
    superBonusFeature: 100000,
    MysteryBonusFeature: 100000,
  },
  concurrency: 8,
})

game.configureOptimization({
  gameModes: {
    base: {
      conditions: {
        maxwin: new OptimizationConditions({
          rtp: 0.0025,
          avgWin: 25000,
          searchConditions: 25000,
          priority: 8,
        }),
        "0": new OptimizationConditions({
          rtp: 0,
          avgWin: 0,
          searchConditions: 0,
          priority: 6,
        }),
        // Three bonus tiers, each its own fence with its own hit rate:
        //   normal 1/150, super 1/450, hidden 1/800.
        // The hunt modes scale these per-tier rates by their bonus multiplier.
        //
        // RTP is deliberately pulled OUT of the base game and concentrated into
        // the free-spin tiers so that landing a bonus feels genuinely rewarding,
        // with value escalating by tier. Per-trigger avg win = rtp * hitRate:
        //   normal 0.30  -> ~45x   super 0.18 -> ~81x   hidden 0.1785 -> ~143x
        // basegame drops to 0.299 (avg ~1.2x per winning spin).
        // Total: 0.0025 + 0 + 0.30 + 0.18 + 0.1785 + 0.299 = 0.96.
        freespins: new OptimizationConditions({
          rtp: 0.30,
          hitRate: 150,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 2,
        }),
        superfreespins: new OptimizationConditions({
          rtp: 0.18,
          hitRate: 450,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 3,
        }),
        hiddenfreespins: new OptimizationConditions({
          rtp: 0.1785,
          hitRate: 800,
          searchConditions: {
            criteria: "hiddenfreespins",
          },
          priority: 4,
        }),
        basegame: new OptimizationConditions({
          rtp: 0.299,
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
          rtp: 0.0002,
          avgWin: 25000,
          searchConditions: 25000,
          priority: 2,
        }),
        freespins: new OptimizationConditions({
          rtp: 0.9598,
          hitRate: "x",
          priority: 1,
        }),
      },
      scaling: new OptimizationScaling([]),
      parameters: new OptimizationParameters(),
    },
    // superBonusFeature (cost 300x): bonus-buy that always lands 4 scatters
    // via the "superfreespins" criteria, so it only ever enters the super tier.
    superBonusFeature: {
      conditions: {
        maxwin: new OptimizationConditions({
          rtp: 0.0002,
          avgWin: 25000,
          searchConditions: 25000,
          priority: 2,
        }),
        superfreespins: new OptimizationConditions({
          rtp: 0.9598,
          hitRate: "x",
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 1,
        }),
      },
      scaling: new OptimizationScaling([]),
      parameters: new OptimizationParameters(),
    },
    // bonusHunt (cost 3x): every bonus tier triggers 5x more often than base.
    //   normal 1/30 (150÷5), super 1/90 (450÷5), hidden 1/160 (800÷5).
    // Scaled from base: with bonuses 5x more frequent inside the same 0.96 RTP,
    // the base game is squeezed down and almost the entire budget feeds the FS
    // tiers. Value still escalates by tier. Per-trigger avg win = rtp * hitRate:
    //   normal 0.52 -> ~15.6x   super 0.19 -> ~17.1x   hidden 0.1285 -> ~20.6x
    // basegame 0.119 (avg ~0.48x).
    // Total: 0.0025 + 0 + 0.52 + 0.19 + 0.1285 + 0.119 = 0.96.
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
          rtp: 0.0025,
          avgWin: 25000,
          searchConditions: 25000,
          priority: 8,
        }),
        "0": new OptimizationConditions({
          rtp: 0,
          avgWin: 0,
          searchConditions: 0,
          priority: 6,
        }),
        freespins: new OptimizationConditions({
          rtp: 0.52,
          hitRate: 30,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 2,
        }),
        superfreespins: new OptimizationConditions({
          rtp: 0.19,
          hitRate: 90,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 3,
        }),
        hiddenfreespins: new OptimizationConditions({
          rtp: 0.1285,
          hitRate: 160,
          searchConditions: {
            criteria: "hiddenfreespins",
          },
          priority: 4,
        }),
        basegame: new OptimizationConditions({
          rtp: 0.119,
          hitRate: 4,
          priority: 1,
        }),
      },
      scaling: new OptimizationScaling([]),
      parameters: new OptimizationParameters(),
    },
    // bonusHuntPlus (cost 10x): every bonus tier triggers 20x more often than base.
    //   normal 1/7.5 (150÷20), super 1/22.5 (450÷20), hidden 1/40 (800÷20).
    // Scaled from base: bonuses are so frequent that the base game is reduced to
    // a sliver and nearly the whole 0.96 budget feeds the FS tiers, still
    // escalating by tier. Per-trigger avg win = rtp * hitRate:
    //   normal 0.55 -> ~4.1x   super 0.20 -> ~4.5x   hidden 0.1485 -> ~5.9x
    // basegame 0.059 (avg ~0.24x).
    // Total: 0.0025 + 0 + 0.55 + 0.20 + 0.1485 + 0.059 = 0.96.
    // maxwin uses exact-number searchConditions (15000) for the same win_type
    // reason described on the bonusHunt fence above.
    bonusHuntPlus: {
      conditions: {
        maxwin: new OptimizationConditions({
          rtp: 0.0025,
          avgWin: 25000,
          searchConditions: 25000,
          priority: 8,
        }),
        "0": new OptimizationConditions({
          rtp: 0,
          avgWin: 0,
          searchConditions: 0,
          priority: 6,
        }),
        freespins: new OptimizationConditions({
          rtp: 0.55,
          hitRate: 7.5,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 2,
        }),
        superfreespins: new OptimizationConditions({
          rtp: 0.20,
          hitRate: 22.5,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 3,
        }),
        hiddenfreespins: new OptimizationConditions({
          rtp: 0.1485,
          hitRate: 40,
          searchConditions: {
            criteria: "hiddenfreespins",
          },
          priority: 4,
        }),
        basegame: new OptimizationConditions({
          rtp: 0.059,
          hitRate: 4,
          priority: 1,
        }),
      },
      scaling: new OptimizationScaling([]),
      parameters: new OptimizationParameters(),
    },
    // MysteryBonusFeature (cost 500x): bonus-buy with a random tier per buy.
    // The 60/30/10 split is set by result-set quotas, which also drive these
    // hit rates. Using hitRate "x" + searchConditions on multiple fences causes
    // each to build a full-weight LUT independently (weight ×3 → RTP ÷3 = 32%).
    // Fix: explicit fractional hit rates from the quota split so the optimizer
    // knows each fence only covers its share of spins:
    //   normal 60% → hitRate 1/0.6 ≈ 1.667
    //   super  30% → hitRate 1/0.3 ≈ 3.333
    //   hidden 10% → hitRate 1/0.1 = 10
    // RTP split chosen so avg win per trigger escalates by tier
    // (avgWin = rtp × hitRate × cost):
    //   normal  0.299899 × 1.667 × 500 ≈  250 bets
    //   super   0.359914 × 3.333 × 500 ≈  600 bets
    //   hidden  0.299979 × 10    × 500 ≈ 1500 bets
    // Total: 0.000125 + 0.299899 + 0.359914 + 0.299979 = 0.959917 ✓
    //
    // IMPORTANT – maxwin priority MUST be higher than all FS fence priorities
    // (freespins=3, super=4, hidden=5). The Rust optimizer processes fences in
    // descending priority order; the win_type maxwin fence removes all win=25000x
    // books from the lookup_table first. If FS fences run first instead, their
    // organic 25000x books get high per-book weights (hr 1.667–10) and dominate
    // the maxwinHitRate (~1/15k), making the dedicated fence (1/400k) irrelevant.
    // With maxwin at priority 8 it runs first, claims every win=25000 book, and
    // the FS fences only see non-maxwin wins. Result: maxwinHitRate = 400k.
    // hr = avgWin / rtp / cost = 25000 / 0.000125 / 500 = 400,000.
    //
    // RTP FLOOR COMPENSATION: Because MysteryBonusFeature has no "0" or
    // basegame result sets, EVERY simulation book is a triggered bonus session.
    // The optimizer's pig algorithm has no cheap/zero-win ballast books to anchor
    // the low end of each fence's distribution, so it structurally overshoots the
    // target RTP by a consistent ~0.000084 (observed: 480.042 vs 480.0 credits).
    // To compensate, each FS fence rtp is reduced by its proportional quota share
    // of the excess (60%/30%/10%) so the optimized output lands at 0.96.
    // The declared sum (0.959917) still rounds to 0.96 at 3dp (assertion passes).
    MysteryBonusFeature: {
      conditions: {
        maxwin: new OptimizationConditions({
          rtp: 0.000125,
          avgWin: 25000,
          searchConditions: 25000,
          priority: 8,
        }),
        freespins: new OptimizationConditions({
          rtp: 0.299899,
          hitRate: 1.667,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 3,
        }),
        superfreespins: new OptimizationConditions({
          rtp: 0.359914,
          hitRate: 3.333,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 4,
        }),
        hiddenfreespins: new OptimizationConditions({
          rtp: 0.299979,
          hitRate: 10,
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
  doOptimization: true,
  optimizationOpts: {
    gameModes: ["base", "bonusHunt", "bonusHuntPlus", "bonusFeature", "superBonusFeature", "MysteryBonusFeature"],
  },
  doAnalysis: true,
  analysisOpts: {
    gameModes: ["base", "bonusHunt", "bonusHuntPlus", "bonusFeature", "superBonusFeature", "MysteryBonusFeature"],
  },
})
