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
  // that happen to trigger a bonus) guarantees AT LEAST 3 wilds (3-5) land
  // on the board — see drawBoard's isFeatureSpin branches in
  // onHandleGameFlow.ts. Result sets and optimization conditions below
  // MIRROR base exactly (same criteria, quotas, hit rates and RTP split) so
  // bonuses trigger at the SAME rate as base mode. Once a bonus is
  // triggered, free spins use the normal freespin/superfreespin/
  // hiddenfreespin reel sets and play out with completely standard rules —
  // the guaranteed wilds only ever apply to this mode's own base spin.
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
    // base: 300000,
    bonusHunt: 100000,
    // featureSpin: 100000,
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
        // MAXWIN 1-IN-3,000,000 (2026-07-24): raised from 1 in 2,000,000 —
        // this is now the reference baseline every cost-scaled mode derives
        // from (bonusHunt/featureSpin's maxwin hitRate = 3,000,000/cost).
        // (avgWin / hitRate / cost = 15000 / 3000000 / 1 = 0.005 rtp).
        // searchConditions: 15000 selects only simulations whose win equals 15000 exactly.
        // Priority higher than the other fences so these entries are claimed
        // before basegame/freespins/superfreespins/hiddenfreespins.
        maxwin: new OptimizationConditions({
          rtp: 0.005,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 5,
        }),
        // Base game wins (non-FS spins that produce a payout). rtp bumped
        // 0.21 -> 0.2125 to absorb the 0.0025 freed by maxwin's rtp cut above.
        basegame: new OptimizationConditions({
          rtp: 0.2125,
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
      // BASEGAME SHAPE PASS (2026-07-26): the published hit-rate table was
      // extremely erratic — a huge cliff from 0.01-1x (12.3% of spins) down
      // to 1-2x (0.03%), then a bumpy non-monotonic climb/fall through
      // 2-5x/5-10x/10-20x/20-50x/50-100x/100-200x/200-500x (e.g. 100-200x
      // at 0.19% was HIGHER than both its neighbors 50-100x at 0.11% and
      // 200-500x at 0.10%). User wants a smooth, gradually-scaling curve
      // instead, with MORE weight specifically in the 1x-20x low-range
      // tier (a triggered/landed small win should feel common, not almost
      // as rare as a 500x+ win). Mirrors cabin_fever's PROVEN basegame
      // scaling shape verbatim (see examples/cabin_fever/index.ts) — that
      // reference curve uses the exact same "crush sub-1x hard, one big
      // peak at 1-2x, then a smooth taper down through 2x-20x, then crush
      // the 20x+ range hard (FS bonuses handle the big wins, not basegame)"
      // philosophy, and basegame is a large/dense fence (12.5% hit rate,
      // huge natural sample) where big adjacent-bin factor jumps are safe
      // (unlike the earlier sparse hiddenfreespins fence, where cliffs
      // backfired — that lesson does NOT generalize to dense fences like
      // this one, cabin_fever's own basegame curve uses a 38,000x cliff
      // between its sub-1x and 1-2x bins and works fine).
      // Range stops at [500,1000] since VikingQuest base's basegame max win
      // is 1000x (not 15000x like cabin_fever's) — a neutral [1000,1000]
      // entry sits at that ceiling, matching the pattern used elsewhere in
      // this file for exact max-value entries.
      scaling: new OptimizationScaling([
        { criteria: "basegame", scaleFactor: 0.001, winRange: [0.01, 1], probability: 1 },
        // 1x-2x TUNED FURTHER (2026-07-26): user wants this bucket's odds to
        // land BETWEEN 0.01-1x's 1-in-11 and 2-5x's 1-in-62 (i.e. a smooth
        // step in between), but two passes at 38.0x only reached 1-in-92/83
        // — still rarer than BOTH neighbors instead of sitting between them.
        // Boosted further (38.0->116.0, ~3x) to actually land in that gap.
        { criteria: "basegame", scaleFactor: 116.0, winRange: [1, 2], probability: 1 },
        { criteria: "basegame", scaleFactor: 8.0, winRange: [2, 5], probability: 1 },
        { criteria: "basegame", scaleFactor: 4.0, winRange: [5, 10], probability: 1 },
        // 10x-500x PASS 4 — FULL RE-TARGETED SMOOTH CURVE (2026-07-26):
        // user's latest run showed 5-10x (1-in-166) and 10-20x (1-in-169)
        // almost IDENTICAL (no real separation), a steep 5.3x jump into
        // 20-50x (1-in-896), a flat step into 50-100x (1-in-1.0K), then
        // 100-200x (1-in-593) STILL dipping below both neighbors despite
        // the previous 4-5x cut — that cut barely moved the achieved value
        // at all (1-in-573 -> 1-in-593, within noise), confirming this
        // fence's cross-bucket interactions are non-linear enough that a
        // "reasonable" cut isn't sufficient here; a much more decisive
        // correction plus finer resolution around the trouble spot is
        // needed. Computed a smooth geometric target curve anchored at the
        // current 5-10x (~1-in-166) and 200-500x (~1-in-1.5K) values, with
        // a consistent ~1.55x rarer-per-step ratio across the 5 steps in
        // between: 166 -> 258 -> 400 -> 622 -> 966 -> 1500. Adjusted each
        // bucket's scaleFactor toward that target (10-20x cut for more
        // separation from 5-10x; 20-50x/50-100x boosted since they were
        // under-represented relative to the smooth target; 100-200x split
        // into 4 finer sub-bins with a MUCH more aggressive cut than last
        // pass, since the moderate cut demonstrably didn't move the needle).
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
        // 500x-1Kx SMOOTHED (2026-07-26): this bucket never got touched in
        // any prior pass (still the original cabin_fever-mirrored 0.003)
        // while everything around it evolved — the achieved gap from
        // 200-500x (1-in-1.0K) up to 500-1Kx (1-in-47.5K) is a brutal 47.5x
        // jump, way more drastic than any other transition in the curve.
        // User wants more wins here specifically, "about 2x" more common.
        // Given how consistently underwhelming/non-linear scaling changes
        // have been on other similarly-thin buckets in this fence (e.g.
        // 100-200x needed a ~10x push just to move at all), boosted well
        // past a literal 2x (0.003->0.02, ~6.7x) to have a real shot at
        // landing at least a 2x improvement in the achieved frequency.
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
        // MAXWIN LOWERED FOR JUICIER BONUSES (2026-07-24): dropped from
        // 1-in-1,000,000 back down to ~1-in-2,000,000 (2x base's new
        // 1-in-3,000,000 baseline, no longer the strict 3x-cost-scaled
        // value) specifically to free up rtp for the FS tiers below.
        // hitRate = avgWin/rtp/cost = 15000/0.0025/3 = 2,000,000.
        // The 0.0025 rtp freed (0.005 -> 0.0025) is handed to
        // freespins/superfreespins/hiddenfreespins below (NOT basegame)
        // so the bonus tiers pay out bigger, "juicier" wins.
        maxwin: new OptimizationConditions({
          rtp: 0.0025,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 5,
        }),
        // BonusHunt costs 3x base for a 5x increased chance at a bonus.
        // Left at 0.0225 (unchanged this pass — the freed maxwin rtp went
        // to the FS tiers instead, see comment above).
        basegame: new OptimizationConditions({
          rtp: 0.0225,
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
        //
        // MAXWIN-FREED RTP BUMP (2026-07-24): the 0.0025 freed by lowering
        // maxwin above was split PROPORTIONALLY across these 3 tiers by
        // their existing share of the FS budget (~35.7%/24.0%/40.3%):
        // freespins +0.0009 (0.3328->0.3337), superfreespins +0.0006
        // (0.2236->0.2242), hiddenfreespins +0.0010 (0.3761->0.3771).
        // SUPER TIER AVG-WIN BOOST (2026-07-27): distribution shape overall
        // confirmed "awesome" by user; only ask this pass is to raise the
        // "super" tier's own avg FS win (was 67.89x mean / 27.60x median).
        // avgWin = rtp * hitRate * cost, and hitRate/cost are structural
        // (tied to scatter odds / mode cost), so the only lever is rtp.
        // Funded a +0.09 rtp bump to superfreespins by cutting freespins
        // and hiddenfreespins by an EQUAL ~12.66% relative share each
        // (0.3337->0.2914, 0.3771->0.3294) rather than an arbitrary flat
        // split, so both donor tiers absorb a proportionally similar hit
        // instead of one tier taking most of the pain. Expected new avg FS
        // wins: freespins ~30.06x->~26.2x (-12.7%), superfreespins
        // ~67.89x->~94.3x (+38.9%), hiddenfreespins ~226.32x->~197.6x
        // (-12.7%). Sum check: 0 + 0.0025(maxwin) + 0.0225(basegame) +
        // 0.2914(freespins) + 0.3142(superfreespins) + 0.3294(hiddenfreespins)
        // NORMAL TIER AVG-WIN RAISE (2026-07-27): the super-tier boost pass
        // (above) pulled freespins' avg FS win down to 26.25x (from its
        // original 30.06x) as an acceptable side-effect at the time, but
        // user now wants normal's own avg FS win raised further, to ~36-40x
        // (targeting the midpoint, 38x). avgWin = rtp*hitRate*cost,
        // hitRate/cost fixed, so raised freespins' rtp by +0.1308
        // (0.2914 -> 0.4222, giving exactly 0.4222*30*3 = 38.0x). Funded by
        // cutting superfreespins and hiddenfreespins PROPORTIONALLY to
        // their current (post-super-boost) rtp shares (0.3142/0.6436=48.8%
        // and 0.3294/0.6436=51.2% of the combined donor pool) rather than
        // an arbitrary split — super absorbs 0.0638 (0.3142->0.2504, avgWin
        // 94.89x->75.12x, still +10.7% above its ORIGINAL pre-boost 67.89x
        // so last turn's explicit "raise super" ask isn't undone, just
        // partially trimmed back), hidden absorbs 0.0670 (0.3294->0.2624,
        // avgWin 197.70x->157.44x, still comfortably the richest tier).
        // Sum check: 0 + 0.0025(maxwin) + 0.0225(basegame) + 0.4222
        // (freespins) + 0.2504(superfreespins) + 0.2624(hiddenfreespins)
        // = 0.96 ✓. 5x increased chance vs base: 150 / 5 = 30.
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
      // BONUSHUNT BASEGAME SHAPE PASS (2026-07-26): user wants this mode's
      // hit-rate curve shaped similarly to base mode's own basegame fence
      // (just tuned this session — see the base-mode entries above), which
      // was empty/unscaled here too, producing the same kind of erratic
      // curve: 1-2x (1-in-513) way rarer than both its 0.01-1x (1-in-8.04)
      // and 2-5x (1-in-163) neighbors, 10-20x/5-10x nearly flat, and
      // 100-200x (1-in-155) dipping below both 50-100x (1-in-399) and
      // 200-500x (1-in-245). bonusHunt's basegame ResultSet uses the SAME
      // "base" reel generator as base mode's own basegame fence, so the
      // raw win-value distribution shape should be very similar — copied
      // base mode's final tuned scaling curve verbatim as a starting point
      // (crush sub-1x, big 1-2x peak, smooth taper through 2x-20x, boosted
      // 20x-100x, heavily cut+finely-split 100x-200x, gradual 200x-1000x
      // taper). rtp/hitRate untouched (0.0225/8) — this only reshapes the
      // curve, not bonusHunt's own avg win, per the user's "avg pay will
      // obviously be a bit higher because of the mode's cost" comment
      // (that's expected/fine, driven by cost=3x, not something to correct
      // here). May need its own follow-up tuning pass once real numbers
      // come back, since bonusHunt's rtp/hitRate differ from base's.
      scaling: new OptimizationScaling([
        { criteria: "basegame", scaleFactor: 0.001, winRange: [0.01, 1], probability: 1 },
        // ROUND 2 (2026-07-26): user's run showed 1-2x (1-in-133) still
        // noticeably rarer than both 0.01-1x (1-in-8.97) and 2-5x (1-in-67)
        // — the base-mode-mirrored 116.0 factor undershot here since
        // bonusHunt's own rtp/hitRate differ. Boosted further (116->350,
        // ~3x, matching the same magnitude jump that fixed this exact
        // problem for base mode).
        { criteria: "basegame", scaleFactor: 350.0, winRange: [1, 2], probability: 1 },
        { criteria: "basegame", scaleFactor: 8.0, winRange: [2, 5], probability: 1 },
        { criteria: "basegame", scaleFactor: 4.0, winRange: [5, 10], probability: 1 },
        // 5-10x/10-20x came back identical (1-in-85 both) — cut 10-20x for
        // real separation. RESULT: overcorrected the OTHER way (10-20x
        // 1-in-79 became MORE common than 5-10x 1-in-101) — cut further so
        // 10-20x properly lands rarer than 5-10x, restoring monotonic order.
        { criteria: "basegame", scaleFactor: 0.2, winRange: [10, 20], probability: 1 },
        // ROUND 3 (2026-07-26): user wants 20-50x and 50-100x each ~2x MORE
        // common (297->~148, 601->~300), and 100-200x pushed the OTHER way
        // — rarer than the new 50-100x level, not more common than it.
        { criteria: "basegame", scaleFactor: 0.275, winRange: [20, 35], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.2, winRange: [35, 50], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.1, winRange: [50, 75], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.075, winRange: [75, 100], probability: 1 },
        // 100-200x cut further (~2.4x) so it lands rarer than 50-100x's new
        // ~300 target instead of still beating it (was 1-in-147).
        { criteria: "basegame", scaleFactor: 0.0000625, winRange: [100, 125], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.0000417, winRange: [125, 150], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.0000333, winRange: [150, 175], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.000025, winRange: [175, 200], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.0018, winRange: [200, 300], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.0013, winRange: [300, 400], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.001, winRange: [400, 500], probability: 1 },
        // 500-1Kx boosted further for the aggregate-tail smoothing pass below.
        { criteria: "basegame", scaleFactor: 2.0, winRange: [500, 1000], probability: 1 },
        { criteria: "basegame", scaleFactor: 1, winRange: [1000, 1000], probability: 1 },
        // FS-TIER TAIL SMOOTHING — ROUND 2, BOOST NOT CRUSH (2026-07-27):
        // the prior pass ("FS-TIER SMOOTHING ADDED") CRUSHED freespins/
        // superfreespins/hiddenfreespins' own 500x-15000x bins (0.05/0.1/
        // 0.4 etc, all well BELOW the implicit 1.0 baseline) on the theory
        // that they were dumping erratic weight into the aggregate table.
        // Actual result: it backfired badly — the 200-500x -> 500-1Kx
        // aggregate cliff got MUCH worse (was 1-in-30.3K, now 1-in-169.8K,
        // a ~690x cliff off 200-500x's 1-in-246), and 5K-10Kx/10K+ came
        // back at 1-in-21.4M / 1-in-2.0M — both absurdly rare AND inverted
        // (10K+ more common than 5K-10Kx). Root cause: crushing those bins
        // REMOVED mass from the exact range that needed MORE, since 500x+
        // wins in this mode come almost entirely from the FS tiers (basegame
        // tops out at 1000x). FIX (reversed strategy): boost all 3 tiers'
        // 500x-15000x bins well ABOVE baseline instead, using a common
        // finer bin structure ([500,1000]/[1000,2000]/[2000,5000]/
        // [5000,10000]/[10000,15000]) shared across tiers so each aggregate
        // bucket can be independently tuned next round. Target a gradual
        // ~3-5x rarity step per bucket instead of a cliff, and specifically
        // push 5K-10Kx from "1-in-millions" down to "1-in-hundreds-of-
        // thousands" per the user's explicit ask. Sub-500x crush zones
        // (own natural-avg-anchored bins) left untouched since those
        // weren't flagged as a problem.
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
        // Brief calls for "Very High" volatility — use engine defaults.
        minMeanToMedian: 4,
        maxMeanToMedian: 8,
      }),
    },
    bonusFeature: {
      conditions: {
        // MAXWIN EXPLICIT OVERRIDE (2026-07-24): user wants this mode's
        // maxwin at ~1-in-50,000 specifically (no longer derived from base's
        // cost-scaling formula, which would give 1-in-30,000 for cost 100x).
        // hitRate = avgWin / rtp / cost = 15000 / 0.003 / 100 = 50,000.
        maxwin: new OptimizationConditions({
          rtp: 0.003,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 5,
        }),
        // rtp bumped 0.9525 -> 0.957 to absorb the 0.0045 freed by maxwin's
        // rtp cut above (0.0075 -> 0.003). Total check: 0.003 + 0.957 = 0.96 ✓
        freespins: new OptimizationConditions({
          rtp: 0.957,
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
        // MAXWIN EXPLICIT OVERRIDE (2026-07-24): user wants this mode's
        // maxwin at ~1-in-5,000 specifically (no longer derived from base's
        // cost-scaling formula, which would give 1-in-6,000 for cost 500x).
        // hitRate = avgWin / rtp / cost = 15000 / 0.006 / 500 = 5,000.
        maxwin: new OptimizationConditions({
          rtp: 0.006,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 5,
        }),
        // rtp bumped 0.9525 -> 0.954 to absorb the 0.0015 freed by maxwin's
        // rtp cut above (0.0075 -> 0.006). Total check: 0.006 + 0.954 = 0.96 ✓
        superfreespins: new OptimizationConditions({
          rtp: 0.954,
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
        // MAXWIN EXPLICIT OVERRIDE (2026-07-24): user wants this mode's
        // maxwin at ~1-in-2,000 specifically (much more likely than the
        // cost-scaling formula would give for 500x cost — this mode is a
        // deliberate exception). hitRate = avgWin / rtp / cost = 15000 / 0.015 / 500 = 2,000.
        // rtp rises 0.0075 -> 0.015 (delta +0.0075), funded by trimming
        // superfreespins/hiddenfreespins PROPORTIONALLY to their existing
        // shares (34.4% / 65.6% of 0.9525) so their relative ratio is unchanged.
        maxwin: new OptimizationConditions({
          rtp: 0.015,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 8,
        }),
        superfreespins: new OptimizationConditions({
          rtp: 0.3254,
          hitRate: 2.5,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 4,
        }),
        // Total check: 0 + 0.015 + 0.3254 + 0.6196 = 0.96 ✓
        hiddenfreespins: new OptimizationConditions({
          rtp: 0.6196,
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
    // is exactly the intent (every spin already guarantees at least 3
    // exploding
    // wilds, so small-but-frequent wins feel earned rather than empty).
    // Sum check: 0 + 0.000075 + 0.9525 + 0.00265 + 0.00178 + 0.002995 =
    // 0.96 ✓ (rtp values unchanged, only basegame's hitRate moved).
    // MAXWIN UPDATE (2026-07-24): maxwin/basegame rtp re-balanced for the
    // new base 1-in-3,000,000 baseline — see the maxwin/basegame fence
    // comments below for the current values and math.
    featureSpin: {
      conditions: {
        "0": new OptimizationConditions({
          rtp: 0,
          avgWin: 0,
          searchConditions: 0,
          priority: 10,
        }),
        // MAXWIN RE-SCALED (2026-07-24): base's maxwin baseline raised to
        // 1-in-3,000,000, so featureSpin (100x cost) now targets 1-in-30,000
        // → derived hitRate = 15000 / 0.005 / 100 = 30,000 (100x more likely
        // than base's 1-in-3,000,000, same cost-scaling convention as before).
        maxwin: new OptimizationConditions({
          rtp: 0.005,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 5,
        }),
        // Bumped 0.947575 -> 0.95002 to absorb the rtp freed by the
        // super/hidden FS-tier corrections below (2026-07-24 FS-tier avg/
        // median alignment pass). Still absorbs almost all of the mode's
        // RTP budget — hitRate 1.2265 (~1-in-1.2265, ~81.5% of spins) is
        // the main lever that pushes the mode's OVERALL hit rate into the
        // 80-85% band.
        // Trimmed 0.95002 -> 0.94762 (2026-07-26) to fund hiddenfreespins'
        // rtp bump below (see that fence's comment) — negligible effect on
        // basegame's own avg win (hitRate unchanged, 1.1653x -> 1.1622x).
        // Trimmed further 0.94762 -> 0.94585 (2026-07-26) to fund the
        // superfreespins rtp bump below (raising its mean/median).
        basegame: new OptimizationConditions({
          rtp: 0.94585,
          hitRate: 1.2265,
          priority: 1,
        }),
        // Same 1-in-150 rate as base; rtp divided by cost (0.265/100) so the
        // real avgWin target stays ~39.75x, matching base instead of ~3975x.
        // Left unchanged this pass — analyze-build already showed this tier
        // converging to base's actual avg exactly (39.75x == 39.75x).
        freespins: new OptimizationConditions({
          rtp: 0.00265,
          hitRate: 150,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 2,
        }),
        // Same 1-in-500 rate as base; rtp divided by cost (0.178/100).
        // FS-TIER AVG/MEDIAN ALIGNMENT (2026-07-24): analyze-build showed
        // this tier's ACTUAL achieved avg win overshooting base's real
        // avg (91.59x vs base's 89.06x) despite an already-matching rtp
        // target. Nudged rtp down proportionally (0.00178 * 89.06/91.59)
        // to pull the achieved avg back toward base's. hitRate unchanged.
        // MEAN/MEDIAN RAISE (2026-07-26): user wants super's own achieved
        // avg (was 132.25x) AND median (was 38.30x) both raised by a good
        // amount. Bumped rtp ~2x (0.00173->0.0035, funded by trimming
        // basegame above) to lift the mean target further — this fence's
        // achieved avg has consistently OVERSHOT its naive rtp*hitRate*cost
        // formula target by roughly ~1.5x in past runs (86.5 naive ->
        // 132.25 achieved), so a naive target of ~175 here should land
        // achieved somewhere around ~250x+. hitRate left unchanged (still
        // 1-in-500, same trigger rate as base/other tiers).
        superfreespins: new OptimizationConditions({
          rtp: 0.0035,
          hitRate: 500,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 3,
        }),
        // FS-TIER AVG/MEDIAN ALIGNMENT (2026-07-24): this tier overshot the
        // hardest — analyze-build showed an ACTUAL achieved avg of 725.75x
        // vs base's real avg of 303.77x (~2.4x over), even though the
        // theoretical rtp*hitRate*cost target already matched base's rtp*
        // hitRate almost exactly. Root cause is optimizer convergence noise
        // on this fence's tiny rtp share at cost=100 — not a formula bug.
        // First correction (0.002995->0.00125, the "formula" target) only
        // pulled achieved avg down to 539.02x (still ~1.8x over base's
        // 303.77x) — the rtp->achieved-avg relationship is non-linear and
        // does NOT track the naive rtp*hitRate*cost formula for this fence.
        // Cut further (empirically, ~2x) to push achieved avg down toward
        // base's target; combined with the scaling shape correction below
        // (which controls median independent of rtp/avg). Freed rtp
        // (0.00065 here) moved into basegame above. hitRate unchanged
        // (still 1-in-1000, same trigger rate as base).
        // RTP BUMP AFTER WILD-FREQUENCY FIX (2026-07-26): after cutting the
        // hiddenfreespin reel's wild weight (reels.ts, 15->10, see repo
        // notes) the achieved avg win CRASHED from 322.61x down to 75.31x —
        // undershooting the 300-400x target hard (previously it consistently
        // OVERSHOT at this same rtp value, so the raw pool's own natural
        // shape must have changed enough that the achieved-vs-configured
        // relationship inverted). Bumped rtp 0.0006 -> 0.003 (5x) to pull
        // the achieved avg back up toward 300-400x; funded by trimming
        // basegame by the same 0.0024 delta (see basegame comment above).
        hiddenfreespins: new OptimizationConditions({
          rtp: 0.003,
          hitRate: 1000,
          searchConditions: {
            criteria: "hiddenfreespins",
          },
          priority: 4,
        }),
      },
      // Sum check: 0 + 0.005 + 0.94762 + 0.00265 + 0.00173 + 0.003 = 0.96 ✓
      // FS-TIER SHAPE CORRECTION (2026-07-24): rtp/hitRate tuning alone only
      // controls each fence's TARGET MEAN — it can't directly control the
      // achieved MEDIAN or tail shape. analyze-build (100k-sim re-optimize)
      // showed superfreespins/hiddenfreespins converging with a much fatter
      // high-value tail than base's equivalent tiers (e.g. hidden mean
      // 539x/median 57x here vs base's 304x/209x — much more skewed).
      // Explicitly downweight each fence's extreme tail and upweight the
      // range around base's actual median so the achieved distribution
      // shape tracks base's more closely (not just the mean).
      scaling: new OptimizationScaling([
        // basegame: WIN-DISTRIBUTION SMOOTHING (2026-07-26) — the published
        // aggregate hit-rate table showed a sudden DIP at 100x-200x (6.6%)
        // sandwiched between much higher neighbors (50-100x: 15.5%, 200-500x:
        // 16.4%). basegame is unscaled everywhere else (was previously an
        // empty array) and carries 81.5% of all spins / ~95% of RTP, so it's
        // the dominant driver of the aggregate table's shape — a targeted
        // boost here smooths that dip into the surrounding curve without
        // touching basegame's rtp/hitRate (which control its own avg win).
        // RESULT (2026-07-26, user-reported): 100-200x rose 6.6% -> 8.7%,
        // still a dip vs neighbors (50-100x 20.3%, 200-500x 14.0%) — the
        // scaleFactor-to-achieved-% relationship isn't linear (2.5x only
        // grew it ~32% relative), so pushed the factor much further (2.5->8)
        // to actually close the gap toward the ~15-17% neighboring range.
        { criteria: "basegame", scaleFactor: 8, winRange: [100, 200], probability: 1 },
        // superfreespins: base's actual tier is mean 89x / median 81x
        // (mild skew). Boost the 20-150x band (surrounds base's median)
        // and heavily cut the 500x+ tail that was pulling mean up while
        // starving the median.
        // MEAN/MEDIAN RAISE PASS (2026-07-26): user wants BOTH the achieved
        // avg (was 132.25x) and median (was 38.30x) raised by a good
        // amount for this mode. rtp bumped separately above (0.00173->
        // 0.0035) to lift the mean; this scaling redesign works alongside
        // it to lift the median too — replaced the old coarse 3-bin curve
        // ([20,150]/[500,2000]/[2000,15000]) with a finer, more decisive
        // shape: crush the sub-20x dust wins (previously unscaled at
        // neutral 1x, likely a chunk of low-value mass anchoring the old
        // median down), build a strong peak in the 50-250x band (aiming
        // the TYPICAL round noticeably higher than before), then taper
        // gradually through the tail instead of jumping straight to a
        // hard cut at 500x.
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
        // hiddenfreespins: base's actual tier is mean 304x / median 209x.
        // First scaling pass (boost 100-400, cut 1000+) moved median from
        // 57.10x -> 131.10x without changing achieved avg at all (still
        // 539.02x) — confirms scaling only reshapes distribution shape,
        // NOT the achieved mean (that's controlled by rtp, tuned above).
        // Second pass (boost 150-300 x6 / 50-150 x2, cut 1000+ harder) was
        // expected to push median further toward 209x, but the ACTUAL
        // re-optimized result (2026-07-24, user-reported) came back median
        // 22.5x / avg 475x — WORSE than the first pass, not better.
        // Third pass (crush [1,50] 0.04x, boost [100,300] 10x, add a new
        // [300,600] neutral + [600,1500] cut band, deepen 1000+ tail cuts)
        // came back EVEN WORSE (2026-07-24, user-reported): median 11.5x,
        // avg 475.83x unchanged to the decimal (confirms scaling never
        // touches the rtp-derived mean).
        // Fourth pass (collapse to 3 WIDE cliff-shaped bands: crush [1,150]
        // 0.015x, boost [150,300] 25x, cut [300,15000] 0.2x) came back
        // WORSE STILL (2026-07-24, user-reported): median dropped to ~7x.
        // Every pass so far used a small number of EXTREME, abruptly-
        // adjacent scale factors (e.g. 0.015 directly next to 25x) — each
        // escalation of that cliff-like shape made the median fall further,
        // the opposite of the intended direction.
        // FIFTH PASS (2026-07-24): per user's direction, mirror cabin_fever's
        // proven approach instead — cabin_fever's freespins/superfreespins
        // scaling (see its index.ts) never uses a cliff; it covers the ENTIRE
        // [0.01,15000] range as ~14 CONTIGUOUS tight bins with a smooth,
        // gradual step between adjacent factors (e.g. superfreespins ramps
        // 0.25 -> 0.4 -> 0.6 -> 0.8 -> 1.0 -> 1.25 -> 1.5 -> 1.55 -> 1.45,
        // never more than a ~60% jump bin-to-bin) — a single gentle peak
        // with gradual taper on both sides, not a crush-then-spike cliff.
        // RESULT (2026-07-25, user-reported): median rose 7x -> 26.5x — a
        // real, correctly-DIRECTED improvement for the first time across 5
        // passes (avg stayed pinned at 475.83x as always). This CONFIRMS
        // gradual/smooth multi-bin ramps behave correctly here, unlike the
        // cliff-shaped 2-3-band attempts (passes 1-4) which all moved
        // median the WRONG way. Still ~7.7x short of the 205x target though.
        // SIXTH PASS (2026-07-25): keep the same smooth-ramp *strategy* (it
        // works) but push it much further — more bins for finer gradual
        // control, a MUCH taller peak (5.0 vs 2.0 before) straddling
        // 150-300x, and a much lower floor at both tails (down to
        // 0.01-0.02 vs 0.04-0.05 before). Every adjacent-bin step stays
        // within a ~2-2.5x ratio (matching the "gradual, no jump greater
        // than ~2x" property that made pass 5 work) — just more steps,
        // covering more distance. [15000,15000] stays neutral (1x), owned
        // by the maxwin fence.
        // RESULT (2026-07-25, user-reported, AFTER the HIDDEN_MULTIPLIER_TABLE
        // mechanic fix in onHandleGameFlow.ts): mean dropped from 475.83x to
        // 322.61x — right in the 300-400x target band, confirming the
        // mechanic fix worked as intended for the MEAN. But median barely
        // moved (27.5x -> 26.10x) despite this pass's much taller peak and
        // lower floor — scaling alone has plateaued again on the NEW
        // (post-fix) raw data, same as it did on the old data. Since scaling
        // structurally cannot move the mean (confirmed every pass), it's
        // safe to keep pushing it further without any risk to the now-
        // correct 300-400x mean target.
        // SEVENTH PASS (2026-07-25): push the exact same strategy further
        // still — crush the whole sub-150x range roughly another ~2-3x
        // harder (down to 0.005 at the very bottom), raise the peak to 7.0
        // at [150,200] (was 5.0), and re-split the tail into more/finer
        // bins (300-400/400-600/600-900/900-1500/...) so the taper down to
        // the 10000-15000 floor stays within the same ~2-2.5x adjacent-step
        // ratio instead of one bigger jump. rtp/hitRate (0.0006/1000)
        // deliberately left untouched — the mean is already on target and
        // only scaling controls the remaining median gap.
        // RESULT (2026-07-26, user-reported): median barely moved (26.10x
        // -> 24.4x, still flat) despite this being the most extreme pass
        // yet — three consecutive passes (5/6/7) on the post-multiplier-
        // table-fix data had now clearly plateaued.
        // EIGHTH PASS — FULL RESET, NOT another escalation (2026-07-26):
        // after also cutting the hiddenfreespin reel's wild FREQUENCY
        // (reels.ts W 15->10, see repo notes) to address the compounding
        // problem at its source, re-inspecting the actual raw simulated
        // data (books_featureSpin.jsonl, read-only) revealed the natural/
        // unweighted distribution is now dramatically healthier: RAW median
        // win is ~246x and RAW mean is ~620x (down from the old ~2213x/
        // ~3645x) — i.e. the raw pool ALREADY sits close to the 200s target
        // on its own now. But the achieved WEIGHTED result came back mean
        // 75.31x / median 25.70x — the mean UNDER-shot hard (rtp wasn't
        // re-tuned for the new healthier data) and the median STAYED STUCK
        // at the same ~25x as every prior pass, which only makes sense if
        // the pass-7 scaling (built to fight a catastrophically skewed OLD
        // raw pool: crush everything under 150x down to 0.005-0.4x) is now
        // OVER-CRUSHING an already-reasonable distribution and artificially
        // dragging the median back down instead of helping. LESSON: once an
        // upstream mechanic fix meaningfully improves a fence's raw data,
        // an aggressive scaling curve tuned for the OLD data can become
        // counterproductive on the NEW data — always re-check the raw
        // distribution after a mechanic change rather than continuing to
        // escalate the same scaling. FIX: replaced the extreme 0.005-7.0
        // crush/spike curve with a much GENTLER shape (0.02-1.5 range) that
        // nudges rather than fights the now-healthy natural shape — mild
        // reduction below 100x, a mild peak at 150-250x (straddling the
        // target and close to the raw natural median), and a moderate
        // (not extreme) taper down through the tail to keep the mean from
        // drifting too high off the raw mean's ~620x pull. Paired with the
        // rtp bump above (0.0006->0.003) to compensate for the mean
        // undershoot.
        { criteria: "hiddenfreespins", scaleFactor: 0.3, winRange: [0.01, 50], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 0.6, winRange: [50, 100], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 1.0, winRange: [100, 150], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 1.5, winRange: [150, 250], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 1.2, winRange: [250, 400], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 0.8, winRange: [400, 700], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 0.4, winRange: [700, 1500], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 0.4, winRange: [1500, 2500], probability: 1 },
        // 5000-10000x FREQUENCY BOOST, ROUND 2 (2026-07-26): round 1 (2.5x)
        // only compressed this band from 1-in-3.5M to 1-in-2.0M — nowhere
        // near "WAY more" as asked. IMPORTANT WIN THIS PASS: hiddenfreespins'
        // own mean/median landed PERFECTLY on target (315.06x / 243.60x, both
        // squarely in the requested 300-400x/200s bands) despite the round-1
        // tail boost + rtp bump — so rtp is left COMPLETELY untouched this
        // round and only the tail scaling is pushed further, to avoid
        // disturbing that now-correct mean/median. Escalated 2500-5000 to
        // 1.2 (was 0.5) and 5000-10000 to 4.0 (was 2.5, now ~1.6x stronger),
        // eased 10000-15000 to 1.5 (was 1.0) so the step back down stays
        // gradual instead of a cliff.
        { criteria: "hiddenfreespins", scaleFactor: 1.2, winRange: [2500, 5000], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 4.0, winRange: [5000, 10000], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 1.5, winRange: [10000, 15000], probability: 1 },
        { criteria: "hiddenfreespins", scaleFactor: 1, winRange: [15000, 15000], probability: 1 },
      ]),
      parameters: new OptimizationParameters({
        minMeanToMedian: 4,
        maxMeanToMedian: 8,
        // Bumped from the default 10000 -> 20000 candidate pigs per fence:
        // this mode's FS tiers carry very small rtp shares (cost=100 means
        // rtp values like 0.00125-0.00265 out of 0.96 total) where the
        // default candidate pool gave coarse resolution and let the
        // hiddenfreespins fence converge ~2.4x away from its target avg
        // win. More candidates per fence should let the optimizer land
        // closer to the intended target for these thin-budget fences.
        numPigsPerFence: 20000,
      }),
    },
  },
})

game.runTasks({
  doSimulation: true,
  doOptimization: true,
  optimizationOpts: {
    //gameModes: ["base", "bonusHunt", "bonusFeature", "superBonusFeature", "mysteryBonusFeature", "featureSpin"],
    gameModes: ["bonusHunt"],
  },
  doAnalysis: false,
  analysisOpts: {
    //gameModes: ["base", "bonusHunt", "bonusFeature", "superBonusFeature", "mysteryBonusFeature", "featureSpin"],
    gameModes: ["bonusHunt"],
  },
})
