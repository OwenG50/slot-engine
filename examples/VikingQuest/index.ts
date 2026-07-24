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
  // Exploding wilds are never sticky as a symbol in the base game, but the
  // multiplier value they explode for IS sticky to the reel they landed on.
  // Keyed by reel index.
  reelMultipliers: new Map<number, number>(),
  // During free spins, a wild that has already exploded (collected its
  // value) remains sticky at its exact board position for the rest of the
  // feature — it is restored on every subsequent free-spin draw and no
  // longer rolls/collects again. Keyed by "reel-row".
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
  // mysteryBonusFeature: 500x cost bonus-buy. Delivers a random outcome per
  // buy — 50% no win (0x), 40% super bonus, 10% hidden bonus — enforced by
  // the result set quotas below. No normal-tier bonus is ever awarded here.
  mysteryBonusFeature: new GameMode({
    name: "mysteryBonusFeature",
    cost: 500,
    rtp: 0.96,
    reelsAmount: 6,
    symbolsPerReel: [5, 5, 5, 5, 5, 5],
    isBonusBuy: true,
    reelSets: [...Object.values(GENERATORS)],
    resultSets: [
      // No win — forced to an exact 0x payout, no bonus triggered.
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
  // featureSpin: 100x cost feature-buy. Every base spin (including ones
  // that happen to trigger a bonus) guarantees 2-5 wilds land on the board
  // — see drawBoard's isFeatureSpin branches in onHandleGameFlow.ts. Result
  // sets and optimization conditions below MIRROR base exactly (same
  // criteria, quotas, hit rates and RTP split) so bonuses trigger at the
  // SAME rate as base mode. Once a bonus is triggered, free spins use the
  // normal freespin/superfreespin/hiddenfreespin reel sets and play out with
  // completely standard rules — the guaranteed wilds only ever apply to
  // this mode's own base spin.
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
    // Retrigger during free spins: requires the SAME minimum scatter count as
    // a base-game trigger (3+) rather than any single scatter landing. The
    // lookup in getFreeSpinsForScatters is an EXACT match on scatterCount
    // (freespinsConfig[scatterCount] || 0) with no implicit minimum, so
    // previously a lone 1-scatter (or 2-scatter) landing during free spins
    // awarded a retrigger — since single/double scatters land far more often
    // than 3+, that was firing constantly and made retriggers way too
    // frequent regardless of how sparse the reels' scatter density is.
    // Dropping the 1/2 entries means those counts now resolve to 0 (no
    // retrigger) via the `|| 0` fallback.
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
    base: 100000,
    bonusHunt: 100000,
    featureSpin: 100000,
    bonusFeature: 100000,
    superBonusFeature: 100000,
    mysteryBonusFeature: 100000,
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
          hitRate: 8,
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
        // Max win – exact 15000x payout, targeted at 1-in-666k (3x more
        // likely than base's 1-in-2,000,000), matching bonusHunt's 3x cost.
        // hitRate = avgWin/rtp/cost = 15000/0.0075/3 = 666,666.7 ≈ 1 in 666k.
        // (rtp happens to equal base's maxwin rtp 0.0075 because the /3
        // hitRate and the 3x cost cancel out.) The extra 0.0065 rtp vs the
        // old 0.001 value is funded by trimming basegame's rtp below.
        maxwin: new OptimizationConditions({
          rtp: 0.0075,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 5,
        }),
        // BonusHunt costs 3x base for a 5x increased chance at a bonus. rtp
        // cut further 0.08 -> 0.02 (near the feasible floor — see the
        // AVG-FS-WIN REWORK comment below) so almost all remaining budget
        // funds the FS tiers; basegame still pays SOMETHING (not zeroed).
        basegame: new OptimizationConditions({
          rtp: 0.02,
          hitRate: 8,
          priority: 1,
        }),
        // AVG FS WIN CLOSER TO BASE (2026-07-23, pass 2 — supersedes the
        // "70% of base" pass 1 comment below with the same reasoning):
        // basegame's rtp was cut further 0.08 -> 0.02 and the freed 0.06 was
        // redistributed into the three FS tiers PROPORTIONALLY to their
        // existing shares (freespins/superfreespins/hiddenfreespins were
        // ~35.7%/24.0%/40.3% of the FS budget, unchanged by this pass) —
        // freespins 0.3114->0.3328, superfreespins 0.2092->0.2236,
        // hiddenfreespins 0.3519->0.3761. This pushes the avg-FS-win ratio
        // to base from ~70% up to ~75% (freespins ~30x, superfreespins
        // ~67x, hiddenfreespins ~226x, vs base's ~40x/89x/306x). basegame's
        // own avg win drops from ~1.9x to ~0.48x accordingly.
        //
        // PASS 1 (superseded numbers, kept for history): matching base's raw
        // rtp values made bonusHunt's FS tiers pay out ~40% SMALLER average
        // wins than base's, even though their RTP *share* was identical —
        // because the published "avg FS win" is reported in base-bet-
        // equivalent units (avgWin = rtp * hitRate * cost, per
        // scripts/analyze-build.ts), and bonusHunt's hitRate is base/5 while
        // its cost is base*3, giving a structural 3/5 = 0.6x multiplier on
        // avgWin for any given rtp value vs base.
        //
        // HARD MATH CEILING (unchanged): 100% parity with base's avg win is
        // mathematically impossible while holding mode rtp at 0.96, hitRate
        // at base/5, and cost at 3x — even zeroing basegame's rtp entirely
        // only reaches ~77% of base's avg win (ceiling = (5/3) * 0.6 = 1.0
        // requires ALL of the 0.9525 non-maxwin budget in the FS tiers,
        // i.e. 0 basegame rtp). We're now at ~75%, very close to that
        // ceiling while still leaving basegame a small nonzero rtp.
        // 5x increased chance vs base: 150 / 5 = 30.
        freespins: new OptimizationConditions({
          rtp: 0.3328,
          hitRate: 30,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 2,
        }),
        // 500 / 5 = 100.
        superfreespins: new OptimizationConditions({
          rtp: 0.2236,
          hitRate: 100,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 3,
        }),
        // 1000 / 5 = 200.
        hiddenfreespins: new OptimizationConditions({
          rtp: 0.3761,
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
    // 500x cost bonus-buy with a random outcome per buy: 50% no win (0x),
    // 40% super bonus, 10% hidden bonus (matching the ResultSet quotas
    // above, no normal-tier bonus). "0" mirrors base/bonusHunt's exact-zero
    // fence (rtp:0, avgWin:0, win_type via searchConditions:0) so it costs
    // nothing against the RTP budget. hitRate = 1/quota for the FS fences:
    //   super  40% → hitRate 1/0.4 = 2.5
    //   hidden 10% → hitRate 1/0.1 = 10
    // maxwin priority MUST be higher than the FS fence priorities so it
    // claims win=15000 books before the FS fences see them; "0" stays
    // highest priority of all (mirrors base/bonusHunt ordering).
    mysteryBonusFeature: {
      conditions: {
        "0": new OptimizationConditions({
          rtp: 0,
          avgWin: 0,
          searchConditions: 0,
          priority: 10,
        }),
        maxwin: new OptimizationConditions({
          rtp: 0.0018,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 8,
        }),
        superfreespins: new OptimizationConditions({
          rtp: 0.33,
          hitRate: 2.5,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 4,
        }),
        hiddenfreespins: new OptimizationConditions({
          rtp: 0.6282,
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
    // ─── featureSpin ───────────────────────────────────────────────────────
    // 100x cost feature-buy. The rust optimizer internally computes each
    // fence's target average win as `rtp * hitRate * cost` (see repo notes on
    // the "cost scaling" quirk) — so simply copying base's rtp values here
    // (as before) blew the hiddenfreespins target target past maxWinX by
    // ~100x (cost), causing "RTP too low... not enough variance" and a
    // runaway 2598% overall RTP once that fence's optimization aborted.
    // FIX: keep every BONUS fence's hitRate IDENTICAL to base (so bonuses
    // still trigger at the SAME rate as base mode, per the original
    // requirement) but divide each bonus fence's rtp by cost (100) so its
    // real avgWin target stays the same magnitude as base's (e.g.
    // hiddenfreespins target ~299.5x, same as base, instead of ~29,950x).
    //
    // OVERALL HIT RATE 80-85%: the mode's total nonzero-win probability is
    // the sum of 1/hitRate across every fence that has an explicit hitRate
    // (the "0" fence has none, so it absorbs whatever probability mass is
    // left over — see OptimizationConditions/optimizer-rust fence.hr==-1.0
    // handling). Bonus fences only contribute ~0.97% combined
    // (1/150 + 1/500 + 1/1000 + 1/2000000 ≈ 0.00967), so basegame's hitRate
    // is the only practical lever to hit an 80-85% overall rate. Lowered
    // basegame hitRate 3.333 (1-in-3.333, ~30% of spins) -> 1.2265
    // (1-in-1.2265, ~81.5% of spins) so total ≈ 0.815 + 0.00967 ≈ 82.5%,
    // landing users a hit on roughly 4 out of 5 spins. rtp stays fixed at
    // 0.9525 (same RTP budget as before), so avgWin per basegame hit drops
    // from ~3.175x to ~1.168x (hr*rtp) — more frequent, smaller wins, which
    // is exactly the intent (every spin already guarantees 2-5 exploding
    // wilds, so small-but-frequent wins feel earned rather than empty).
    // Sum check: 0 + 0.000075 + 0.9525 + 0.00265 + 0.00178 + 0.002995 =
    // 0.96 ✓ (rtp values unchanged, only basegame's hitRate moved).
    featureSpin: {
      conditions: {
        "0": new OptimizationConditions({
          rtp: 0,
          avgWin: 0,
          searchConditions: 0,
          priority: 10,
        }),
        // Same 1-in-2,000,000 rate as base: hitRate = avgWin/(rtp*cost) =
        // 15000/(0.000075*100) = 2,000,000.
        maxwin: new OptimizationConditions({
          rtp: 0.000075,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 5,
        }),
        // Absorbs almost all of the mode's RTP budget (see comment above) —
        // hitRate 1.2265 (~1-in-1.2265, ~81.5% of spins) is the main lever
        // that pushes the mode's OVERALL hit rate into the 80-85% band.
        basegame: new OptimizationConditions({
          rtp: 0.9525,
          hitRate: 1.2265,
          priority: 1,
        }),
        // Same 1-in-150 rate as base; rtp divided by cost (0.265/100) so the
        // real avgWin target stays ~39.75x, matching base instead of ~3975x.
        freespins: new OptimizationConditions({
          rtp: 0.00265,
          hitRate: 150,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 2,
        }),
        // Same 1-in-500 rate as base; rtp divided by cost (0.178/100).
        superfreespins: new OptimizationConditions({
          rtp: 0.00178,
          hitRate: 500,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 3,
        }),
        // Same 1-in-1000 rate as base; rtp divided by cost (0.2995/100).
        hiddenfreespins: new OptimizationConditions({
          rtp: 0.002995,
          hitRate: 1000,
          searchConditions: {
            criteria: "hiddenfreespins",
          },
          priority: 4,
        }),
      },
      scaling: new OptimizationScaling([]),
      parameters: new OptimizationParameters({
        minMeanToMedian: 4,
        maxMeanToMedian: 8,
      }),
    },
  },
})

game.runTasks({
  doSimulation: true,
  doOptimization: true,
  optimizationOpts: {
    gameModes: ["base", "bonusHunt", "bonusFeature", "superBonusFeature", "mysteryBonusFeature", "featureSpin"],
    // gameModes: ["bonusHunt"],
  },
  doAnalysis: true,
  analysisOpts: {
    gameModes: ["base", "bonusHunt", "bonusFeature", "superBonusFeature", "mysteryBonusFeature", "featureSpin"],
    //gameModes: ["bonusHunt"],
  },
})
