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
  // Sticky wild-reel multipliers, keyed by "reel-row" position.
  persistentWildReels: new Map<string, number>(),
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
  // Super scatter: triggers the super bonus on its own (3x), or combines
  // with S for the hidden bonus (2 of one + 3 of the other, see getBonusTier).
  SS: new GameSymbol({
    id: "SS",
    properties: {
      isScatter: true,
    },
  }),
  // Expanding wild reel: fills the entire reel with wilds and carries a
  // rolled-in multiplier (see resolveWildReelMultipliers in onHandleGameFlow.ts).
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
      3: 10,
      4: 20,
      5: 25,
    },
  }),
  H2: new GameSymbol({
    id: "H2",
    pays: {
      3: 7.5,
      4: 15,
      5: 20,
    },
  }),
  H3: new GameSymbol({
    id: "H3",
    pays: {
      3: 5,
      4: 10,
      5: 15,
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
      3: 0.2,
      4: 0.5,
      5: 2,
    },
  }),
  L2: new GameSymbol({
    id: "L2",
    pays: {
      3: 0.2,
      4: 0.5,
      5: 2,
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
      3: 0.2,
      4: 0.5,
      5: 2,
    },
  }),
  L5: new GameSymbol({
    id: "L5",
    pays: {
      3: 0.2,
      4: 0.5,
      5: 2,
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
    symbolsPerReel: [4, 4, 4, 4, 4],
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
    reelsAmount: 5,
    symbolsPerReel: [4, 4, 4, 4, 4],
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
      new ResultSet({
        criteria: "maxwin",
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
  bonusHuntPlus: new GameMode({
    name: "bonusHuntPlus",
    cost: 10,
    rtp: 0.96,
    reelsAmount: 5,
    symbolsPerReel: [4, 4, 4, 4, 4],
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
      new ResultSet({
        criteria: "maxwin",
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
  bonusFeature: new GameMode({
    name: "bonusFeature",
    cost: 100,
    rtp: 0.96,
    reelsAmount: 5,
    symbolsPerReel: [4, 4, 4, 4, 4],
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
    symbolsPerReel: [4, 4, 4, 4, 4],
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
      new ResultSet({
        criteria: "maxwin",
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
  mysteryBonusFeature: new GameMode({
    name: "mysteryBonusFeature",
    cost: 500,
    rtp: 0.96,
    reelsAmount: 5,
    symbolsPerReel: [4, 4, 4, 4, 4],
    isBonusBuy: true,
    reelSets: [...Object.values(GENERATORS)],
    resultSets: [
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
      new ResultSet({
        criteria: "maxwin",
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
})

export type GameModesType = typeof gameModes

export type GameType = InferGameType<GameModesType, SymbolsType, UserStateType>

export const game = createSlotGame<GameType>({
  id: "smokeys-stash",
  name: "Smokeys Stash",
  maxWinX: 25000,
  gameModes,
  symbols,
  padSymbols: 1,
  scatterToFreespins: {
    // Required by the engine config type; the actual trigger/retrigger logic
    // now lives entirely in onHandleGameFlow.ts (getBonusTier + per-scatter
    // retriggers), these values are not read anywhere.
    [SPIN_TYPE.BASE_GAME]: {
      3: 10,
      4: 10,
      5: 10,
    },
    [SPIN_TYPE.FREE_SPINS]: {
      3: 10,
      4: 10,
    },
  },
  userState,
  hooks: {
    onHandleGameFlow,
  },
})

// ─── NEUTRAL OPTIMIZATION SCALING ──────────────────────────────────────────
// Basic structure only: every win-range bin is left at scaleFactor 1 and
// probability 1 so distributions are unshaped and ready to be reconfigured.
const NEUTRAL_BINS: Array<[number, number]> = [
  [0.01, 1],
  [1, 2],
  [2, 5],
  [5, 10],
  [10, 20],
  [20, 50],
  [50, 100],
  [100, 200],
  [200, 500],
  [500, 1000],
  [1000, 2000],
  [2000, 5000],
  [5000, 10000],
  [10000, 25000],
  [25000, 25000],
]

function neutralScaling(...criterias: string[]) {
  return criterias.flatMap((criteria) =>
    NEUTRAL_BINS.map(([lo, hi]) => ({
      criteria,
      scaleFactor: 1,
      winRange: [lo, hi] as [number, number],
      probability: 1,
    })),
  )
}

// Shape a single criteria into a chosen curve. `factors` maps 1:1 onto
// `bins` (defaults to NEUTRAL_BINS).
function customScaling(
  criteria: string,
  factors: number[],
  bins: Array<[number, number]> = NEUTRAL_BINS,
) {
  return bins.map(([lo, hi], i) => ({
    criteria,
    scaleFactor: factors[i],
    winRange: [lo, hi] as [number, number],
    probability: 1,
  }))
}

// Basegame shaping bins: splits the dust bin into 0.01-0.5x/0.5-1x so each
// can be scaled independently.
const BASEGAME_BINS: Array<[number, number]> = [
  [0.01, 0.5],
  [0.5, 1],
  [1, 2],
  [2, 5],
  [5, 10],
  [10, 20],
  [20, 50],
  [50, 100],
  [100, 200],
  [200, 500],
  [500, 1000],
  [1000, 2000],
  [2000, 5000],
  [5000, 10000],
  [10000, 25000],
  [25000, 25000],
]

// Free-spin shaping bins aligned to the analyzer's win-range buckets so the
// bell curves can be tuned bucket-by-bucket with precise control.
const FS_BINS: Array<[number, number]> = [
  [0.01, 1],
  [1, 2],
  [2, 5],
  [5, 10],
  [10, 20],
  [20, 50],
  [50, 100],
  [100, 200],
  [200, 500],
  [500, 1000],
  [1000, 2000],
  [2000, 5000],
  [5000, 10000],
  [10000, 25000],
  [25000, 25000],
]

// Add or remove from this to choose what gets simulated or not.
game.configureSimulation({
  simRunsAmount: {
    base: 10000,
    bonusHunt: 10000,
    bonusHuntPlus: 10000,
    bonusFeature: 10000,
    mysteryBonusFeature: 10000,
    superBonusFeature: 10000,
  },
  concurrency: 24,
})

game.configureOptimization({
  gameModes: {
    base: {
      conditions: {
        "0": new OptimizationConditions({
          rtp: 0,
          avgWin: 0,
          searchConditions: 0,
          priority: 10,
        }),
        maxwin: new OptimizationConditions({
          rtp: 0.005,
          avgWin: 25000,
          searchConditions: 25000,
          priority: 5,
        }),
        basegame: new OptimizationConditions({
          rtp: 0.12,
          hitRate: 6,
          priority: 1,
        }),
        freespins: new OptimizationConditions({
          rtp: 0.345,
          hitRate: 150,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 2,
        }),
        superfreespins: new OptimizationConditions({
          rtp: 0.2,
          hitRate: 500,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 3,
        }),
        hiddenfreespins: new OptimizationConditions({
          rtp: 0.29,
          hitRate: 1000,
          searchConditions: {
            criteria: "hiddenfreespins",
          },
          priority: 4,
        }),
      },
      scaling: new OptimizationScaling([
        // Basegame: crush 0.01-0.5x further, lift 0.5x-20x harder (skewed
        // toward the cheaper 1-2x/2-5x end since basegame's fixed 0.68x mean
        // caps how much probability the pricier 10-20x end can absorb).
        // 1-2x pushed further, 2-5x eased back, per explicit request.
        ...customScaling(
          "basegame",
          [
            0.05, 10, 100, 15, 10, 6, 0.05, 0.05, 0.05, 0.05, 1, 1, 1, 1, 1, 1,
          ],
          BASEGAME_BINS,
        ),
        // Normal FS: single-peaked bell centred on ~50-100x. Bins aligned to
        // the analyzer buckets; the dominant natural 10-25x spike is crushed.
        // Reshaped bell: crush the 100-200x secondary hump, ease the 20-50x
        // spike, and build up 5-10x/10-20x so weight skews to the low end.
        ...customScaling(
          "freespins",
          [
            0.7, 1.1, 1.1, 1.2, 0.8, 1.5, 3.2, 1.2, 6.0, 9.0, 0.1, 0.1,
            0.04, 0.02, 1,
          ],
          FS_BINS,
        ),
        // Super FS: single-peaked bell weighted toward the high end. The
        // natural 5-50x hump is crushed broadly and 50-200x boosted so the
        // rise into the 200-500x peak is smooth and not bimodal; 200x+ is
        // boosted further so it spreads a bit more into the upper ranges.
        ...customScaling(
          "superfreespins",
          [
            0.2, 0.35, 0.5, 0.3, 0.2, 0.05, 15, 8, 40, 35, 12, 6,
            0.08, 0.03, 1,
          ],
          FS_BINS,
        ),
        // Hidden FS: bell weighted toward the high end. Sub-100x is nearly
        // moot since endFreeSpins now tops up any round under 100x to the
        // guaranteed floor; 100-200x (which absorbed the floor top-ups plus
        // the freed 200-500x weight) is crushed hard so the set spreads
        // out across 200x-25000x instead of bunching at one bucket.
        ...customScaling(
          "hiddenfreespins",
          [
            0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.15, 3, 50, 20, 10,
            5, 2.5, 1,
          ],
          FS_BINS,
        ),
      ]),
      parameters: new OptimizationParameters({
        minMeanToMedian: 0.5,
        maxMeanToMedian: 20,
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
        maxwin: new OptimizationConditions({
          rtp: 0.0025,
          avgWin: 25000,
          searchConditions: 25000,
          priority: 5,
        }),
        basegame: new OptimizationConditions({
          rtp: 0.0225,
          hitRate: 8,
          priority: 1,
        }),
        freespins: new OptimizationConditions({
          rtp: 0.4222,
          hitRate: 30,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 2,
        }),
        superfreespins: new OptimizationConditions({
          rtp: 0.2504,
          hitRate: 100,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 3,
        }),
        hiddenfreespins: new OptimizationConditions({
          rtp: 0.2624,
          hitRate: 200,
          searchConditions: {
            criteria: "hiddenfreespins",
          },
          priority: 4,
        }),
      },
      scaling: new OptimizationScaling(
        neutralScaling("basegame", "freespins", "superfreespins", "hiddenfreespins"),
      ),
      parameters: new OptimizationParameters({
        minMeanToMedian: 2,
        maxMeanToMedian: 20,
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
        maxwin: new OptimizationConditions({
          rtp: 0.0025,
          avgWin: 25000,
          searchConditions: 25000,
          priority: 5,
        }),
        // Literal 20x hit-rate boost eats almost all spin-outcome probability
        // (freespins 66.7% + super 20% + hidden 10% = 96.7%), so basegame's
        // own hit frequency had to shrink drastically (8 -> 40) to leave the
        // "0" (no-win) fence a valid positive share — otherwise the combined
        // probability exceeds 100% and the Rust optimizer panics with
        // "Invalid weights". avg win kept near the achievable ~1x floor.
        basegame: new OptimizationConditions({
          rtp: 0.0025,
          hitRate: 40,
          priority: 1,
        }),
        // Exactly 20x more likely to trigger than bonusHunt (hitRate / 20).
        // rtp raised from bonusHunt's own values (funded by basegame's much
        // smaller share above) to keep some avg win per trigger, but it's
        // still well below bonusHunt's own — an accepted, explicit tradeoff
        // for hitting the literal 20x frequency target within a 0.96 rtp cap.
        freespins: new OptimizationConditions({
          rtp: 0.4312,
          hitRate: 1.5,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 2,
        }),
        superfreespins: new OptimizationConditions({
          rtp: 0.2558,
          hitRate: 5,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 3,
        }),
        hiddenfreespins: new OptimizationConditions({
          rtp: 0.268,
          hitRate: 10,
          searchConditions: {
            criteria: "hiddenfreespins",
          },
          priority: 4,
        }),
      },
      scaling: new OptimizationScaling(
        neutralScaling("basegame", "freespins", "superfreespins", "hiddenfreespins"),
      ),
      // Widened from the default 2/20 — the literal-20x hit-rate reshaping
      // above produces mean/median ratios the old window couldn't satisfy,
      // which caused an unbounded "Mean to Median X min max" stuck loop
      // (this bound check has no retry cap in the Rust optimizer).
      parameters: new OptimizationParameters({
        minMeanToMedian: 0.1,
        maxMeanToMedian: 50,
      }),
    },
    bonusFeature: {
      conditions: {
        maxwin: new OptimizationConditions({
          rtp: 0.003,
          avgWin: 25000,
          searchConditions: 25000,
          priority: 5,
        }),
        freespins: new OptimizationConditions({
          rtp: 0.957,
          hitRate: 1,
          searchConditions: {
            criteria: "freespins",
          },
          priority: 1,
        }),
      },
      scaling: new OptimizationScaling(neutralScaling("freespins")),
      parameters: new OptimizationParameters({
        minMeanToMedian: 2,
        maxMeanToMedian: 20,
      }),
    },
    superBonusFeature: {
      conditions: {
        maxwin: new OptimizationConditions({
          rtp: 0.006,
          avgWin: 25000,
          searchConditions: 25000,
          priority: 5,
        }),
        superfreespins: new OptimizationConditions({
          rtp: 0.954,
          hitRate: 1,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 1,
        }),
      },
      scaling: new OptimizationScaling(neutralScaling("superfreespins")),
      parameters: new OptimizationParameters({
        minMeanToMedian: 2,
        maxMeanToMedian: 20,
      }),
    },
    mysteryBonusFeature: {
      conditions: {
        "0": new OptimizationConditions({
          rtp: 0,
          avgWin: 0,
          searchConditions: 0,
          priority: 10,
        }),
        maxwin: new OptimizationConditions({
          rtp: 0.0125,
          avgWin: 25000,
          searchConditions: 25000,
          priority: 8,
        }),
        superfreespins: new OptimizationConditions({
          rtp: 0.38325,
          hitRate: 2.5,
          searchConditions: {
            criteria: "superfreespins",
          },
          priority: 4,
        }),
        hiddenfreespins: new OptimizationConditions({
          rtp: 0.56425,
          hitRate: 10,
          searchConditions: {
            criteria: "hiddenfreespins",
          },
          priority: 5,
        }),
      },
      scaling: new OptimizationScaling(
        neutralScaling("superfreespins", "hiddenfreespins"),
      ),
      parameters: new OptimizationParameters({
        minMeanToMedian: 2,
        maxMeanToMedian: 20,
      }),
    },
  },
})

game.runTasks({
  doSimulation: true,
  doOptimization: true,
  optimizationOpts: {
    gameModes: ["base", "bonusHunt", "bonusHuntPlus", "bonusFeature", "superBonusFeature", "mysteryBonusFeature"],
  },
  doAnalysis: false,
  analysisOpts: {
    gameModes: ["base"],
  },
})
