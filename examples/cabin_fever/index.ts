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
    base: 100000,
    bonusHunt: 100000,
    bonusHuntPlus: 100000,
    bonusFeature: 100000,
    superBonusFeature: 100000,
  },
  concurrency: 24,
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
        // hitRate: 5  →  avg 1 in 5 base spins wins (~20% hit rate)
        // rtp reduced from 0.31 → 0.309 to keep the total at 0.96
        // (the 0.001 slice was moved to the maxwin condition above)
        // implied avgWin = 0.309 * 5 = 1.545x per winning spin
        basegame: new OptimizationConditions({
          rtp: 0.309,
          hitRate: 5,
          priority: 1,
        }),
        // Free spin trigger + entire FS play-through result.
        // hitRate: 240  →  FS triggers once every ~240 base spins on average.
        freespins: new OptimizationConditions({
          rtp: 0.35,
          hitRate: 240,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 2,
        }),
        // Super free spin trigger + entire super-FS play-through result.
        // hitRate: 720  →  super-FS triggers ~once every 720 base spins.
        superfreespins: new OptimizationConditions({
          rtp: 0.30,
          hitRate: 720,
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
        // ── Low end ────────────────────────────────────────────────────────
        { criteria: "basegame", scaleFactor: 1,   winRange: [0.01,  1],     probability: 1 }, // micro  < 1x
        { criteria: "basegame", scaleFactor: 1,   winRange: [1,     2],     probability: 1 }, // small    1–2x
        // ── Mid range (primary target zone) ────────────────────────────────
        { criteria: "basegame", scaleFactor: 1,   winRange: [2,     5],     probability: 1 }, // mid-low  2–5x
        { criteria: "basegame", scaleFactor: 1,   winRange: [5,     10],    probability: 1 }, // mid      5–10x
        { criteria: "basegame", scaleFactor: 1,   winRange: [10,    20],    probability: 1 }, // mid-high 10–20x
        { criteria: "basegame", scaleFactor: 1,   winRange: [20,    50],    probability: 1 }, // large    20–50x
        { criteria: "basegame", scaleFactor: 1,   winRange: [50,    100],   probability: 1 }, // large    50–100x
        // ── High end ───────────────────────────────────────────────────────
        { criteria: "basegame", scaleFactor: 1,   winRange: [100,   200],   probability: 1 }, // big      100–200x
        { criteria: "basegame", scaleFactor: 1,   winRange: [200,   500],   probability: 1 }, // big      200–500x
        { criteria: "basegame", scaleFactor: 1,   winRange: [500,   1000],  probability: 1 }, // very big 500–1000x
        { criteria: "basegame", scaleFactor: 1,   winRange: [1000,  2000],  probability: 1 }, // huge     1000–2000x
        { criteria: "basegame", scaleFactor: 1,   winRange: [2000,  5000],  probability: 1 }, // huge     2000–5000x
        // ── Near max win ───────────────────────────────────────────────────
        { criteria: "basegame", scaleFactor: 1,   winRange: [5000,  10000], probability: 1 }, // massive  5000–10000x
        { criteria: "basegame", scaleFactor: 1,   winRange: [10000, 15000], probability: 1 }, // near-max 10000–15000x
        { criteria: "basegame", scaleFactor: 1,   winRange: [15000, 15000], probability: 1 }, // exact max win (15000x)
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
        // rtp reduced from 0.26 → 0.259 to keep the total at 0.96
        // hitRate: 5  →  avg 1 in 5 base spins wins (~20% hit rate)
        basegame: new OptimizationConditions({
          rtp: 0.259,
          hitRate: 5,
          priority: 1,
        }),
        freespins: new OptimizationConditions({
          rtp: 0.30,
          hitRate: 80,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 2,
        }),
        superfreespins: new OptimizationConditions({
          rtp: 0.40,
          hitRate: 240,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 3,
        }),
      },
      scaling: new OptimizationScaling([
        // ── Base game ──────────────────────────────────────────────────────
        { criteria: "basegame", scaleFactor: 1, winRange: [0.01,  1],     probability: 1 },
        { criteria: "basegame", scaleFactor: 1, winRange: [1,     2],     probability: 1 },
        { criteria: "basegame", scaleFactor: 1, winRange: [2,     5],     probability: 1 },
        { criteria: "basegame", scaleFactor: 1, winRange: [5,     10],    probability: 1 },
        { criteria: "basegame", scaleFactor: 1, winRange: [10,    20],    probability: 1 },
        { criteria: "basegame", scaleFactor: 1, winRange: [20,    50],    probability: 1 },
        { criteria: "basegame", scaleFactor: 1, winRange: [50,    100],   probability: 1 },
        { criteria: "basegame", scaleFactor: 1, winRange: [100,   200],   probability: 1 },
        { criteria: "basegame", scaleFactor: 1, winRange: [200,   500],   probability: 1 },
        { criteria: "basegame", scaleFactor: 1, winRange: [500,   1000],  probability: 1 },
        { criteria: "basegame", scaleFactor: 1, winRange: [1000,  2000],  probability: 1 },
        { criteria: "basegame", scaleFactor: 1, winRange: [2000,  5000],  probability: 1 },
        { criteria: "basegame", scaleFactor: 1, winRange: [5000,  10000], probability: 1 },
        { criteria: "basegame", scaleFactor: 1, winRange: [10000, 15000], probability: 1 },
        { criteria: "basegame", scaleFactor: 1, winRange: [15000, 15000], probability: 1 },
        // ── Free spins ─────────────────────────────────────────────────────
        { criteria: "freespins", scaleFactor: 1, winRange: [0.01,  1],     probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [1,     2],     probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [2,     5],     probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [5,     10],    probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [10,    20],    probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [20,    50],    probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [50,    100],   probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [100,   200],   probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [200,   500],   probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [500,   1000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [1000,  2000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [2000,  5000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [5000,  10000], probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [10000, 15000], probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [15000, 15000], probability: 1 },
        // ── Super free spins ───────────────────────────────────────────────
        { criteria: "superfreespins", scaleFactor: 1, winRange: [0.01,  1],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [1,     2],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [2,     5],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [5,     10],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [10,    20],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [20,    50],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [50,    100],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [100,   200],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [200,   500],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [500,   1000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [1000,  2000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [2000,  5000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [5000,  10000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [10000, 15000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [15000, 15000], probability: 1 },
      ]),
      parameters: new OptimizationParameters(),
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
        // rtp reduced from 0.26 → 0.259 to keep the total at 0.96
        basegame: new OptimizationConditions({
          rtp: 0.259,
          hitRate: 10,
          priority: 1,
        }),
        freespins: new OptimizationConditions({
          rtp: 0.30,
          hitRate: 12,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 2,
        }),
        superfreespins: new OptimizationConditions({
          rtp: 0.40,
          hitRate: 36,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 3,
        }),
      },
      scaling: new OptimizationScaling([
        // ── Base game ──────────────────────────────────────────────────────
        { criteria: "basegame", scaleFactor: 1, winRange: [0.01,  1],     probability: 1 },
        { criteria: "basegame", scaleFactor: 1, winRange: [1,     2],     probability: 1 },
        { criteria: "basegame", scaleFactor: 1, winRange: [2,     5],     probability: 1 },
        { criteria: "basegame", scaleFactor: 1, winRange: [5,     10],    probability: 1 },
        { criteria: "basegame", scaleFactor: 1, winRange: [10,    20],    probability: 1 },
        { criteria: "basegame", scaleFactor: 1, winRange: [20,    50],    probability: 1 },
        { criteria: "basegame", scaleFactor: 1, winRange: [50,    100],   probability: 1 },
        { criteria: "basegame", scaleFactor: 1, winRange: [100,   200],   probability: 1 },
        { criteria: "basegame", scaleFactor: 1, winRange: [200,   500],   probability: 1 },
        { criteria: "basegame", scaleFactor: 1, winRange: [500,   1000],  probability: 1 },
        { criteria: "basegame", scaleFactor: 1, winRange: [1000,  2000],  probability: 1 },
        { criteria: "basegame", scaleFactor: 1, winRange: [2000,  5000],  probability: 1 },
        { criteria: "basegame", scaleFactor: 1, winRange: [5000,  10000], probability: 1 },
        { criteria: "basegame", scaleFactor: 1, winRange: [10000, 15000], probability: 1 },
        { criteria: "basegame", scaleFactor: 1, winRange: [15000, 15000], probability: 1 },
        // ── Free spins ─────────────────────────────────────────────────────
        { criteria: "freespins", scaleFactor: 1, winRange: [0.01,  1],     probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [1,     2],     probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [2,     5],     probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [5,     10],    probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [10,    20],    probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [20,    50],    probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [50,    100],   probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [100,   200],   probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [200,   500],   probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [500,   1000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [1000,  2000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [2000,  5000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [5000,  10000], probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [10000, 15000], probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [15000, 15000], probability: 1 },
        // ── Super free spins ───────────────────────────────────────────────
        { criteria: "superfreespins", scaleFactor: 1, winRange: [0.01,  1],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [1,     2],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [2,     5],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [5,     10],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [10,    20],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [20,    50],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [50,    100],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [100,   200],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [200,   500],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [500,   1000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [1000,  2000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [2000,  5000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [5000,  10000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [10000, 15000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [15000, 15000], probability: 1 },
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
        // ── Free spins ─────────────────────────────────────────────────────
        { criteria: "freespins", scaleFactor: 1, winRange: [0.01,  1],     probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [1,     2],     probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [2,     5],     probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [5,     10],    probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [10,    20],    probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [20,    50],    probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [50,    100],   probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [100,   200],   probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [200,   500],   probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [500,   1000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [1000,  2000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [2000,  5000],  probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [5000,  10000], probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [10000, 15000], probability: 1 },
        { criteria: "freespins", scaleFactor: 1, winRange: [15000, 15000], probability: 1 },
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
          hitRate: "x",
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 1,
        }),
      },
      scaling: new OptimizationScaling([
        // ── Super free spins ───────────────────────────────────────────────
        { criteria: "superfreespins", scaleFactor: 1, winRange: [0.01,  1],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [1,     2],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [2,     5],     probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [5,     10],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [10,    20],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [20,    50],    probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [50,    100],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [100,   200],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [200,   500],   probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [500,   1000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [1000,  2000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [2000,  5000],  probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [5000,  10000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [10000, 15000], probability: 1 },
        { criteria: "superfreespins", scaleFactor: 1, winRange: [15000, 15000], probability: 1 },
      ]),
      parameters: new OptimizationParameters(),
    },
  },
})

game.runTasks({
  doSimulation: true,
  doOptimization: true,
  optimizationOpts: {
    gameModes: ["base", "bonusHunt", "bonusHuntPlus", "bonusFeature", "superBonusFeature"],
  },
  doAnalysis: true,
  analysisOpts: {
    gameModes: ["base", "bonusHunt", "bonusHuntPlus", "bonusFeature", "superBonusFeature"],
  },
})
