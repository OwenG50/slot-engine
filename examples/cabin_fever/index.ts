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
    symbolsPerReel: [5, 5, 5, 5, 5],
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
    symbolsPerReel: [5, 5, 5, 5, 5],
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
})

export type GameModesType = typeof gameModes

export type GameType = InferGameType<GameModesType, SymbolsType, UserStateType>

export const game = createSlotGame<GameType>({
  id: "cabin-fever",
  name: "Cabin Fever",
  maxWinX: 15000,
  gameModes,
  symbols,
  padSymbols: 1,
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
    // base: 100000,
    // bonusHunt: 100000,
    bonusHuntPlus: 100000,
    // bonusFeature: 100000,
    // superBonusFeature: 100000,
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
      conditions: {
        // Dead spins – no win. rtp:0 / avgWin:0 gives them zero LUT weight.
        "0": new OptimizationConditions({
          rtp: 0,
          avgWin: 0,
          searchConditions: 0,
          priority: 10,
        }),
        // Max win – exact 15000x payout.
        // searchConditions: 15000 selects only simulations whose win equals 15000 exactly.
        // hitRate: 15_000_000  →  max win hits once every 15 million spins on average.
        // avgWin: 15000        →  the payout when it does hit.
        // implied rtp = 15000 / 15_000_000 = 0.001
        // Priority higher than basegame so these entries are claimed before the
        // basegame fence (which otherwise takes all unclaimed simulations).
        maxwin: new OptimizationConditions({
          rtp: 0.001,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 5,
        }),
        // Base game wins (non-FS spins that produce a payout).
        // avg win = rtp * hitRate = 0.50 * 4 = 2.0x per winning spin.
        // Total check: 0+0.001+0.50+0.28+0.179 = 0.960 ✓
        basegame: new OptimizationConditions({
          rtp: 0.50,
          hitRate: 4,
          priority: 1,
        }),
        // implied avgWin per trigger = 0.28 * 200 = 56x
        freespins: new OptimizationConditions({
          rtp: 0.28,
          hitRate: 200,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 2,
        }),
        // implied avgWin per trigger = 0.179 * 700 = 125x
        // rtp reduced from 0.279 → 0.179 to offset basegame increase.
        superfreespins: new OptimizationConditions({
          rtp: 0.179,
          hitRate: 700,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 3,
        }),
      },

      // ─── SCALING ───────────────────────────────────────────────────────────
      // Scaling entries bias the optimizer toward (or away from) specific win
      // ranges within a fence, after the base RTP target is already satisfied.
      //
      // criteria    – condition key to apply the rule to (must match a key above)
      // scaleFactor – multiplier on the probability of a win landing in winRange
      //               1.0 = no change (neutral)
      //               > 1  e.g. 1.5 = 50% more likely to land in this range
      //               < 1  e.g. 0.5 = 50% less likely to land in this range
      //               Boosting one range implicitly reduces probability in others;
      //               keep the sum balanced or the optimizer may struggle.
      // winRange    – [min, max] expressed as bet multiples (e.g. [2, 5] = 2x–5x)
      // probability – 0-1 chance the rule is applied at all.
      //               Use 1 to always apply it; 0 to disable without deleting it.
      //
      // All entries below target the "basegame" fence. Adjust scaleFactor values
      // to reshape the base-game payout curve. Start from 1 (neutral) and tune.
      scaling: new OptimizationScaling([
        // ── Base game ──────────────────────────────────────────────────────
        // Target distribution (reference game):
        //   (0.1–1)x   1 in 7.46    — 54% of winning spins  → low scale
        //   (1–2)x     1 in 15.9    — 26% of winning spins  → strong boost
        //   (2–5)x     1 in 31.9    — 13% of winning spins  → strong boost
        //   (5–10)x    1 in 109     — ~3.7%                 → moderate boost
        //   (10–20)x   1 in 307     — ~1.3%                 → cut
        //   (20–50)x   1 in 658     — FS bleed
        //   (50–100)x  1 in 576     — FS bleed (above 20-50)
        //   (100–200)x 1 in 902     — tapering
        //   (200–500)x 1 in 1874    — tapering
        //   (500–1Kx)  1 in 16,207  — rare
        //   (1K–2Kx)   1 in 30,349  — rare
        //   (2K–5Kx)   NEVER        — hard zero
        //   (5K–10Kx)  1 in 312,500 — near-maxwin
        //   (10K+)x    1 in 1.33M   — maxwin only
        // Scale factors: sub-1x crushed to near-zero, 1-2x is the dominant peak,
        // then a strict gradual taper each tier. Above 10x tapers steeply — FS handles big wins.
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
        // ── Free spins ─────────────────────────────────────────────────────
        // Curve: small FS results de-emphasised (a triggered FS that pays
        // pennies feels bad), peak weight on the 20–200x "satisfying" tier,
        // then a steady taper. Big FS wins are kept reachable for the
        // occasional exciting bonus round.
        { criteria: "freespins", scaleFactor: 0.5,  winRange: [0.01,  1],     probability: 1 },
        { criteria: "freespins", scaleFactor: 0.7,  winRange: [1,     2],     probability: 1 },
        { criteria: "freespins", scaleFactor: 0.9,  winRange: [2,     5],     probability: 1 },
        { criteria: "freespins", scaleFactor: 1.1,  winRange: [5,     10],    probability: 1 },
        { criteria: "freespins", scaleFactor: 1.3,  winRange: [10,    20],    probability: 1 },
        { criteria: "freespins", scaleFactor: 1.4,  winRange: [20,    50],    probability: 1 },
        { criteria: "freespins", scaleFactor: 1.3,  winRange: [50,    100],   probability: 1 },
        { criteria: "freespins", scaleFactor: 1.15, winRange: [100,   200],   probability: 1 },
        { criteria: "freespins", scaleFactor: 0.95, winRange: [200,   500],   probability: 1 },
        { criteria: "freespins", scaleFactor: 5.0,  winRange: [500,   1000],  probability: 1 },  // 500-1Kx target 1in16K, current 1in57K
        { criteria: "freespins", scaleFactor: 4.0,  winRange: [1000,  2000],  probability: 1 },  // 1K-2Kx target 1in30K, current 1in56K
        { criteria: "freespins", scaleFactor: 0.35, winRange: [2000,  5000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 0.2,  winRange: [5000,  10000], probability: 1 },
        { criteria: "freespins", scaleFactor: 0.12, winRange: [10000, 15000], probability: 1 },
        { criteria: "freespins", scaleFactor: 1,    winRange: [15000, 15000], probability: 1 },
        // ── Super free spins ───────────────────────────────────────────────
        // Curve: shifted ~one tier higher than regular FS — the super mode
        // should consistently feel "big". Peak weight 50–500x with a long
        // tail into multi-thousand-x territory for the marquee moments.
        { criteria: "superfreespins", scaleFactor: 0.25, winRange: [0.01,  1],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.4,  winRange: [1,     2],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.6,  winRange: [2,     5],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.8,  winRange: [5,     10],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.0,  winRange: [10,    20],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.25, winRange: [20,    50],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.5,  winRange: [50,    100],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.55, winRange: [100,   200],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.45, winRange: [200,   500],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 4.0,  winRange: [500,   1000],  probability: 1 },  // boosted further for 500-1Kx
        { criteria: "superfreespins", scaleFactor: 3.5,  winRange: [1000,  2000],  probability: 1 },  // boosted further for 1K-2Kx
        { criteria: "superfreespins", scaleFactor: 0.6,  winRange: [2000,  5000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.4,  winRange: [5000,  10000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.22, winRange: [10000, 15000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1,    winRange: [15000, 15000], probability: 1 },
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
        // Tightened from the defaults (4 / 8) to push the distribution toward
        // the 2–100x middle tier rather than allowing extreme-skew solutions.
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
        // Max win – exact 15000x payout, hits once every 15 million spins.
        // implied rtp = 15000 / 15_000_000 = 0.001
        maxwin: new OptimizationConditions({
          rtp: 0.001,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 5,
        }),
        // BonusHunt cost is 2x base. Players paying the premium expect FS
        // more often, so the BG slice shrinks and the FS / super-FS slices
        // grow. BG hit rate stays the same so dead-ish base spins still feel
        // alive while you wait for the trigger.
        basegame: new OptimizationConditions({
          rtp: 0.16,
          hitRate: 4,
          priority: 1,
        }),
        // FS triggers exactly 3x more often than base mode (base hitRate 200 ÷ 3 = 67).
        // implied avgWin per trigger = 0.46 * 67 ≈ 30.8x
        freespins: new OptimizationConditions({
          rtp: 0.46,
          hitRate: 67,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 2,
        }),
        // Super-FS triggers exactly 3x more often than base mode (base hitRate 700 ÷ 3 ≈ 233).
        // implied avgWin per trigger = 0.339 * 233 ≈ 79x
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
        // ── Base game ──────────────────────────────────────────────────────
        // BonusHunt BG avg win is only 0.64x (rtp 0.16 * hitRate 4), so the
        // bulk of wins land in the 1–5x range. Mirror base mode: crush sub-1x,
        // 1-2x dominant, strict downward taper from there.
        // 2-5x reduced from 4.5 → 3.5 to ensure it stays harder to hit than 1-2x.
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
        // ── Free spins ─────────────────────────────────────────────────────
        // FS triggers 3x more often than base (1 in 67), avg ~31x per trigger.
        // Peak at 20-50x. 100-200x cut aggressively to fix combined ordering.
        // 500x+ boosted heavily so high-end hits are meaningful.
        { criteria: "freespins", scaleFactor: 0.3,   winRange: [0.01,  1],     probability: 1 },
        { criteria: "freespins", scaleFactor: 0.5,   winRange: [1,     2],     probability: 1 },
        { criteria: "freespins", scaleFactor: 0.75,  winRange: [2,     5],     probability: 1 },
        { criteria: "freespins", scaleFactor: 1.0,   winRange: [5,     10],    probability: 1 },
        { criteria: "freespins", scaleFactor: 1.3,   winRange: [10,    20],    probability: 1 },
        { criteria: "freespins", scaleFactor: 1.5,   winRange: [20,    50],    probability: 1 },
        { criteria: "freespins", scaleFactor: 1.3,   winRange: [50,    100],   probability: 1 },
        { criteria: "freespins", scaleFactor: 0.2,   winRange: [100,   200],   probability: 1 },
        { criteria: "freespins", scaleFactor: 0.5,   winRange: [200,   500],   probability: 1 },
        { criteria: "freespins", scaleFactor: 5.0,   winRange: [500,   1000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 1.5,   winRange: [1000,  2000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 0.4,   winRange: [2000,  5000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 0.15,  winRange: [5000,  10000], probability: 1 },
        { criteria: "freespins", scaleFactor: 0.06,  winRange: [10000, 15000], probability: 1 },
        { criteria: "freespins", scaleFactor: 1,     winRange: [15000, 15000], probability: 1 },
        // ── Super free spins ───────────────────────────────────────────────
        // Super FS triggers 3x more often than base (1 in 233), avg ~79x per trigger.
        // Peak at 50-100x. 100-200x cut to fix combined ordering.
        // 500x+ boosted heavily — super-FS is the primary vehicle for big wins.
        { criteria: "superfreespins", scaleFactor: 0.2,   winRange: [0.01,  1],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.35,  winRange: [1,     2],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.55,  winRange: [2,     5],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.75,  winRange: [5,     10],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.0,   winRange: [10,    20],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.4,   winRange: [20,    50],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.8,   winRange: [50,    100],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.4,   winRange: [100,   200],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.8,   winRange: [200,   500],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 5.0,   winRange: [500,   1000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.5,   winRange: [1000,  2000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.5,   winRange: [2000,  5000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.2,   winRange: [5000,  10000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.08,  winRange: [10000, 15000], probability: 1 },
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
        // Max win – exact 15000x payout, hits once every 15 million spins.
        // implied rtp = 15000 / 15_000_000 = 0.001
        maxwin: new OptimizationConditions({
          rtp: 0.001,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 5,
        }),
        // BonusHuntPlus cost is 10x base — effectively a near-bonus-buy.
        // Almost every spin is part of a FS hunt; BG share is small.
        basegame: new OptimizationConditions({
          rtp: 0.10,
          hitRate: 8,
          priority: 1,
        }),
        // FS triggers exactly 20x more often than base mode (base hitRate 200 ÷ 20 = 10).
        // implied avgWin per trigger = 0.45 * 10 = 4.5x per trigger.
        freespins: new OptimizationConditions({
          rtp: 0.45,
          hitRate: 10,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 2,
        }),
        // Super-FS triggers exactly 20x more often than base mode (base hitRate 700 ÷ 20 = 35).
        // implied avgWin per trigger = 0.409 * 35 ≈ 14.3x
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
        // ── Base game ──────────────────────────────────────────────────────
        // Matches base mode: sub-1x near-zero, peak at 1–5x, steep taper above.
        { criteria: "basegame", scaleFactor: 0.18, winRange: [0.01,  1],     probability: 1 },
        { criteria: "basegame", scaleFactor: 10.0, winRange: [1,     2],     probability: 1 },
        { criteria: "basegame", scaleFactor: 7.0,  winRange: [2,     5],     probability: 1 },
        { criteria: "basegame", scaleFactor: 4.0,  winRange: [5,     10],    probability: 1 },
        { criteria: "basegame", scaleFactor: 1.5,  winRange: [10,    20],    probability: 1 },
        { criteria: "basegame", scaleFactor: 0.06, winRange: [20,    50],    probability: 1 },
        { criteria: "basegame", scaleFactor: 0.02, winRange: [50,    100],   probability: 1 },
        { criteria: "basegame", scaleFactor: 0.01, winRange: [100,   200],   probability: 1 },
        { criteria: "basegame", scaleFactor: 0.005,winRange: [200,   500],   probability: 1 },
        { criteria: "basegame", scaleFactor: 0.003,winRange: [500,   1000],  probability: 1 },
        { criteria: "basegame", scaleFactor: 0.003,winRange: [1000,  2000],  probability: 1 },
        { criteria: "basegame", scaleFactor: 0.0,  winRange: [2000,  5000],  probability: 1 },
        { criteria: "basegame", scaleFactor: 0.003,winRange: [5000,  10000], probability: 1 },
        { criteria: "basegame", scaleFactor: 0.002,winRange: [10000, 15000], probability: 1 },
        { criteria: "basegame", scaleFactor: 1,    winRange: [15000, 15000], probability: 1 },
        // ── Free spins ─────────────────────────────────────────────────────
        { criteria: "freespins", scaleFactor: 0.5,  winRange: [0.01,  1],     probability: 1 },
        { criteria: "freespins", scaleFactor: 0.7,  winRange: [1,     2],     probability: 1 },
        { criteria: "freespins", scaleFactor: 0.9,  winRange: [2,     5],     probability: 1 },
        { criteria: "freespins", scaleFactor: 1.1,  winRange: [5,     10],    probability: 1 },
        { criteria: "freespins", scaleFactor: 1.3,  winRange: [10,    20],    probability: 1 },
        { criteria: "freespins", scaleFactor: 1.4,  winRange: [20,    50],    probability: 1 },
        { criteria: "freespins", scaleFactor: 1.3,  winRange: [50,    100],   probability: 1 },
        { criteria: "freespins", scaleFactor: 1.2,  winRange: [100,   200],   probability: 1 },
        { criteria: "freespins", scaleFactor: 0.65, winRange: [200,   500],   probability: 1 },
        { criteria: "freespins", scaleFactor: 0.55, winRange: [500,   1000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 0.6,  winRange: [1000,  2000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 0.35, winRange: [2000,  5000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 0.15, winRange: [5000,  10000], probability: 1 },
        { criteria: "freespins", scaleFactor: 0.06, winRange: [10000, 15000], probability: 1 },
        { criteria: "freespins", scaleFactor: 1,    winRange: [15000, 15000], probability: 1 },
        // ── Super free spins ───────────────────────────────────────────────
        { criteria: "superfreespins", scaleFactor: 0.25, winRange: [0.01,  1],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.4,  winRange: [1,     2],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.6,  winRange: [2,     5],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.8,  winRange: [5,     10],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.0,  winRange: [10,    20],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.25, winRange: [20,    50],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.5,  winRange: [50,    100],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.4,  winRange: [100,   200],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.0,  winRange: [200,   500],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.7,  winRange: [500,   1000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.6,  winRange: [1000,  2000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.4,  winRange: [2000,  5000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.2,  winRange: [5000,  10000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.08, winRange: [10000, 15000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1,    winRange: [15000, 15000], probability: 1 },
      ]),
      parameters: new OptimizationParameters(),
    },
    bonusFeature: {
      conditions: {
        // Max win – exact 15000x payout, hits once every 15 million spins.
        // implied rtp = 15000 / 15_000_000 = 0.001
        maxwin: new OptimizationConditions({
          rtp: 0.001,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 5,
        }),
        // rtp reduced from 0.96 → 0.959 to keep the total at 0.96
        freespins: new OptimizationConditions({
          rtp: 0.959,
          hitRate: 1,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 1,
        }),
      },
      scaling: new OptimizationScaling([
        // ── Free spins (bonus-buy entry) ────────────────────────────────────────
        // Slightly more aggressive than the natural-FS curve since the player
        // paid 100x to enter — small results feel especially bad here, big
        // results are the whole reason they bought.
        { criteria: "freespins", scaleFactor: 0.35, winRange: [0.01,  1],     probability: 1 },
        { criteria: "freespins", scaleFactor: 0.55, winRange: [1,     2],     probability: 1 },
        { criteria: "freespins", scaleFactor: 0.8,  winRange: [2,     5],     probability: 1 },
        { criteria: "freespins", scaleFactor: 1.0,  winRange: [5,     10],    probability: 1 },
        { criteria: "freespins", scaleFactor: 1.25, winRange: [10,    20],    probability: 1 },
        { criteria: "freespins", scaleFactor: 1.45, winRange: [20,    50],    probability: 1 },
        { criteria: "freespins", scaleFactor: 1.4,  winRange: [50,    100],   probability: 1 },
        { criteria: "freespins", scaleFactor: 1.25, winRange: [100,   200],   probability: 1 },
        { criteria: "freespins", scaleFactor: 1.05, winRange: [200,   500],   probability: 1 },
        { criteria: "freespins", scaleFactor: 0.85, winRange: [500,   1000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 0.6,  winRange: [1000,  2000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 0.4,  winRange: [2000,  5000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 0.25, winRange: [5000,  10000], probability: 1 },
        { criteria: "freespins", scaleFactor: 0.15, winRange: [10000, 15000], probability: 1 },
        { criteria: "freespins", scaleFactor: 1,    winRange: [15000, 15000], probability: 1 },
      ]),
      parameters: new OptimizationParameters(),
    },
    superBonusFeature: {
      conditions: {
        // Max win – exact 15000x payout, hits once every 15 million spins.
        // implied rtp = 15000 / 15_000_000 = 0.001
        maxwin: new OptimizationConditions({
          rtp: 0.001,
          avgWin: 15000,
          searchConditions: 15000,
          priority: 5,
        }),
        // rtp reduced from 0.96 → 0.959 to keep the total at 0.96
        superfreespins: new OptimizationConditions({
          rtp: 0.959,
          hitRate: 1,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 1,
        }),
      },
      scaling: new OptimizationScaling([
        // ── Super free spins (bonus-buy entry) ──────────────────────────────
        // 300x bonus-buy. Curve shifted toward high tiers with boosted 500–2Kx
        // matching the proven base-mode super-FS distribution.
        { criteria: "superfreespins", scaleFactor: 0.15, winRange: [0.01,  1],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.3,  winRange: [1,     2],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.5,  winRange: [2,     5],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.7,  winRange: [5,     10],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.95, winRange: [10,    20],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.2,  winRange: [20,    50],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.5,  winRange: [50,    100],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.6,  winRange: [100,   200],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1.55, winRange: [200,   500],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 4.0,  winRange: [500,   1000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 3.5,  winRange: [1000,  2000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.7,  winRange: [2000,  5000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.45, winRange: [5000,  10000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 0.25, winRange: [10000, 15000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1,    winRange: [15000, 15000], probability: 1 },
      ]),
      parameters: new OptimizationParameters(),
    },
  },
})

game.runTasks({
  doSimulation: true,
  doOptimization: true,
  optimizationOpts: {
    gameModes: ["bonusHuntPlus"],
  },
  doAnalysis: true,
  analysisOpts: {
    gameModes: ["bonusHuntPlus"],
  },
})
