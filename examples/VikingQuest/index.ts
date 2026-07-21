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
  // Exploding wilds are never sticky as a symbol, but the multiplier value
  // they explode for IS sticky to the reel they landed on. Keyed by reel index.
  reelMultipliers: new Map<number, number>(),
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
  // Wild only pays as itself on a full 6-of-a-kind wild line (no 3/4/5 entries
  // per brief). It still substitutes normally into H/L combos via LinesWinType.
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
        // Keep this small: forceMaxWin books are expensive to generate.
        // 0.001 still feeds the optimizer with maxwin candidates while
        // reducing runtime pressure vs 0.01.
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
  // mysteryBonusFeature: 500x cost bonus-buy. Delivers a random bonus tier
  // per buy — 60% normal, 30% super, 10% hidden — enforced by the result set
  // quotas below, each forcing that tier's scatter count on the trigger spin.
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
        criteria: "freespins",
        quota: 0.6,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { freespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "superfreespins",
        quota: 0.3,
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
    // Retrigger during free spins: +2 FS per scatter symbol landed.
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
    base: 100000,
    // bonusHunt: 100000,
    // bonusFeature: 100000,
    // superBonusFeature: 100000,
    // mysteryBonusFeature: 100000,
  },
  concurrency: 24
})

game.configureOptimization({
  gameModes: {
    base: {
      // ─── CONDITIONS ────────────────────────────────────────────────────────
      // Each condition maps 1-to-1 with a ResultSet criteria defined above.
      // The optimizer groups simulations by criteria tag ("fences") and
      // independently optimises the win distribution of each group so that
      // the group contributes exactly its target RTP slice to the total.
      //
      // For each condition provide exactly 2 of the following 3 values and
      // the third is derived automatically:
      //   rtp      – fraction of total bet returned through this bucket
      //              (all rtp values must sum to the game mode rtp, here 0.96)
      //   hitRate  – 1-in-N spins that produce a win from this bucket
      //   avgWin   – average win per triggering spin  (= rtp * hitRate)
      //
      // searchConditions:
      //   0                     → selects simulations with an exact win of 0
      //   { criteria: "name" }  → selects by the force-record tag written at
      //                           simulation time (the ResultSet's criteria)
      //   [min, max]            → selects by payout multiplier range
      //
      // priority – when criteria tags overlap, the highest priority condition
      //            claims matching simulations first. Use { criteria } tags so
      //            buckets never overlap and priority becomes irrelevant.
      //
      // NOTE: all OptimizationScaling win-range shaping has been intentionally
      // removed from every mode below — only the RTP/hitRate fence conditions
      // remain, ready for a fresh optimization/balancing pass.
      conditions: {
        // Dead spins – no win. rtp:0 / avgWin:0 gives them zero LUT weight.
        "0": new OptimizationConditions({
          rtp: 0,
          avgWin: 0,
          searchConditions: 0,
          priority: 10,
        }),
        // Max win – exact 15000x payout, hit rate fixed at 1 in 2,000,000
        // (avgWin / hitRate / cost = 15000 / 2000000 / 1 = 0.0075 rtp).
        // searchConditions: 15000 selects only simulations whose win equals 15000 exactly.
        // Priority higher than the other fences so these entries are claimed
        // before basegame/freespins/superfreespins/hiddenfreespins.
        maxwin: new OptimizationConditions({
          rtp: 0.0075,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 5,
        }),
        // Base game wins (non-FS spins that produce a payout).
        basegame: new OptimizationConditions({
          rtp: 0.21,
          hitRate: 6,
          priority: 1,
        }),
        // Normal bonus tier (3-scatter trigger). Hit rate fixed at 1 in 150.
        freespins: new OptimizationConditions({
          rtp: 0.265,
          hitRate: 150,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 2,
        }),
        // Super bonus tier (4-scatter trigger). Hit rate fixed at 1 in 500.
        superfreespins: new OptimizationConditions({
          rtp: 0.178,
          hitRate: 500,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 3,
        }),
        // Hidden bonus tier (5-scatter trigger). Keep hit rate at 1 in 1000,
        // but allocate a much larger RTP share here so more of total game RTP
        // is concentrated in high-value hidden-bonus outcomes.
        hiddenfreespins: new OptimizationConditions({
          rtp: 0.2995,
          hitRate: 1000,
          searchConditions: {
            criteria: "hiddenfreespins",
          },
          priority: 4,
        }),
      },

      // ─── SCALING ───────────────────────────────────────────────────────────
      // Intentionally left empty — re-add OptimizationScaling entries here once
      // the fresh distribution/balancing pass is ready.
      scaling: new OptimizationScaling([]),

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
        // Brief calls for "Very High" volatility — use the engine defaults
        // (4 / 8) rather than the previously tightened 2 / 4, allowing the
        // wider rightward skew a Very High volatility profile implies.
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
        // Max win – exact 15000x payout.
        maxwin: new OptimizationConditions({
          rtp: 0.001,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 5,
        }),
        // BonusHunt costs 3x base for a 5x increased chance at a bonus. BG
        // hit rate stays the same so dead-ish base spins still feel alive
        // while you wait for the trigger.
        basegame: new OptimizationConditions({
          rtp: 0.14,
          hitRate: 4,
          priority: 1,
        }),
        // 5x increased chance vs base: 150 / 5 = 30.
        freespins: new OptimizationConditions({
          rtp: 0.46,
          hitRate: 30,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 2,
        }),
        // 500 / 5 = 100.
        superfreespins: new OptimizationConditions({
          rtp: 0.339,
          hitRate: 100,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 3,
        }),
        // 1000 / 5 = 200.
        hiddenfreespins: new OptimizationConditions({
          rtp: 0.02,
          hitRate: 200,
          searchConditions: {
            criteria: "hiddenfreespins",
          },
          priority: 4,
        }),
      },
      // Intentionally left empty — re-add OptimizationScaling entries here once
      // the fresh distribution/balancing pass is ready.
      scaling: new OptimizationScaling([]),
      parameters: new OptimizationParameters({
        // Brief calls for "Very High" volatility — use engine defaults.
        minMeanToMedian: 4,
        maxMeanToMedian: 8,
      }),
    },
    bonusFeature: {
      conditions: {
        // Max win – cost 100x, derived hitRate = avgWin / rtp / cost = 15000 / 0.0001 / 100 = 1.5M.
        maxwin: new OptimizationConditions({
          rtp: 0.0001,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 5,
        }),
        // Total check: 0.0001 + 0.9599 = 0.96 ✓
        freespins: new OptimizationConditions({
          rtp: 0.9599,
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
    superBonusFeature: {
      conditions: {
        // Max win – cost 500x, derived hitRate = avgWin / rtp / cost = 15000 / 0.0001 / 500 = 300K.
        maxwin: new OptimizationConditions({
          rtp: 0.0001,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 5,
        }),
        // Total check: 0.0001 + 0.9599 = 0.96 ✓
        superfreespins: new OptimizationConditions({
          rtp: 0.9599,
          hitRate: 1,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 1,
        }),
      },
      scaling: new OptimizationScaling([]),
      parameters: new OptimizationParameters(),
    },
    // ─── mysteryBonusFeature ───────────────────────────────────────────────
    // 500x cost bonus-buy with a random tier per buy (60% normal / 30% super /
    // 10% hidden, matching the ResultSet quotas above). Using explicit
    // fractional hit rates (1/quota) tells the optimizer each fence only
    // covers its share of spins:
    //   normal 60% → hitRate 1/0.6 ≈ 1.667
    //   super  30% → hitRate 1/0.3 ≈ 3.333
    //   hidden 10% → hitRate 1/0.1 = 10
    // maxwin priority MUST be higher than the FS fence priorities so it
    // claims win=15000 books before the FS fences see them.
    mysteryBonusFeature: {
      conditions: {
        maxwin: new OptimizationConditions({
          rtp: 0.0018,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 8,
        }),
        freespins: new OptimizationConditions({
          rtp: 0.1177,
          hitRate: 1.667,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 3,
        }),
        superfreespins: new OptimizationConditions({
          rtp: 0.2875,
          hitRate: 3.333,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 4,
        }),
        hiddenfreespins: new OptimizationConditions({
          rtp: 0.553,
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
    // gameModes: ["base", "bonusHunt", "bonusFeature", "superBonusFeature", "mysteryBonusFeature"],
    gameModes: ["base"],
  },
  doAnalysis: true,
  analysisOpts: {
    // gameModes: ["base", "bonusHunt", "bonusFeature", "superBonusFeature", "mysteryBonusFeature"],
    gameModes: ["base"],
  },
})
