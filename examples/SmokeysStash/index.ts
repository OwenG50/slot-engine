import {
  GameMode,
  GameSymbol,
  InferGameType,
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
  // Sticky wild-reel multipliers during free spins, keyed by "reel-row".
  // Plain object (not Map) so engine state cloning/serialization stays safe.
  stickyWildReels: {} as Record<string, number>,
  totalFreeSpinsWin: 0,
  // Locked bonus tier for the active feature: "normal" | "super" | "hidden" | "".
  bonusTier: "",
  // True only for the first free spin of a super/hidden bonus (guaranteed WR).
  isFirstBonusSpin: false,
})

export type UserStateType = typeof userState

export const symbols = defineSymbols({
  S: new GameSymbol({
    id: "S",
    properties: {
      isScatter: true,
    },
  }),
  // Super scatter: 3x SS triggers the super bonus; a mixed 3+2 split of
  // S/SS triggers the hidden bonus (see getBonusTier in onHandleGameFlow.ts).
  SS: new GameSymbol({
    id: "SS",
    properties: {
      isScatter: true,
    },
  }),
  // Wild reel: makes its entire reel wild for win evaluation, carries a
  // rolled multiplier, and is sticky (per position) during free spins.
  WR: new GameSymbol({
    id: "WR",
    properties: {
      isWild: true,
      isWildReel: true,
    },
  }),
  // Tier 1/2/3 wilds: single-cell substitute wilds carrying a rolled
  // multiplier from their tier pool. Never sticky - they last one spin.
  W1: new GameSymbol({
    id: "W1",
    properties: {
      isWild: true,
      wildTier: 1,
    },
  }),
  W2: new GameSymbol({
    id: "W2",
    properties: {
      isWild: true,
      wildTier: 2,
    },
  }),
  W3: new GameSymbol({
    id: "W3",
    properties: {
      isWild: true,
      wildTier: 3,
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
  H5: new GameSymbol({
    id: "H5",
    pays: {
      3: 2,
      4: 3,
      5: 5,
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

// Shared by base and extraChance - identical simulation result sets; the two
// modes only differ in cost and optimizer targets (5x tier hit rates).
// Quotas must sum to exactly 1. The multiplier ranges enforce each bonus
// tier's minimum win at simulation level (sims retry below floor).
function baseStyleResultSets() {
  return [
    new ResultSet({
      criteria: "0",
      quota: 0.15,
      multiplier: 0,
      reelWeights: {
        [SPIN_TYPE.BASE_GAME]: { base: 1 },
        [SPIN_TYPE.FREE_SPINS]: { freespin: 1 },
      },
    }),
    new ResultSet({
      criteria: "basegame",
      quota: 0.38,
      multiplier: [0.1, 25000],
      reelWeights: {
        [SPIN_TYPE.BASE_GAME]: { base: 1 },
        [SPIN_TYPE.FREE_SPINS]: { freespin: 1 },
      },
    }),
    new ResultSet({
      criteria: "freespins",
      quota: 0.22,
      forceFreespins: true,
      multiplier: [15, 25000],
      reelWeights: {
        [SPIN_TYPE.BASE_GAME]: { base: 1 },
        [SPIN_TYPE.FREE_SPINS]: { freespin: 1 },
      },
    }),
    new ResultSet({
      criteria: "superfreespins",
      quota: 0.14,
      forceFreespins: true,
      multiplier: [85, 25000],
      reelWeights: {
        [SPIN_TYPE.BASE_GAME]: { base: 1 },
        [SPIN_TYPE.FREE_SPINS]: { superfreespin: 1 },
      },
    }),
    new ResultSet({
      criteria: "hiddenfreespins",
      quota: 0.09,
      forceFreespins: true,
      multiplier: [1000, 25000],
      reelWeights: {
        [SPIN_TYPE.BASE_GAME]: { base: 1 },
        [SPIN_TYPE.FREE_SPINS]: { hiddenfreespin: 1 },
      },
    }),
    // Max wins are simulated through the super tier (guaranteed WR on the
    // first free spin makes 25000x reachable). See drawBoard's criteria map.
    new ResultSet({
      criteria: "maxwin",
      quota: 0.02,
      forceMaxWin: true,
      forceFreespins: true,
      reelWeights: {
        [SPIN_TYPE.BASE_GAME]: { base: 1 },
        [SPIN_TYPE.FREE_SPINS]: { superfreespin: 1 },
      },
    }),
  ]
}

export const gameModes = defineGameModes({
  base: new GameMode({
    name: "base",
    cost: 1,
    rtp: 0.96,
    reelsAmount: 5,
    symbolsPerReel: [4, 4, 4, 4, 4],
    isBonusBuy: false,
    reelSets: [...Object.values(GENERATORS)],
    resultSets: baseStyleResultSets(),
  }),
  // Same gameplay as base at 3x cost; the 5x tier hit-rate boost lives
  // entirely in this mode's optimization targets.
  extraChance: new GameMode({
    name: "extraChance",
    cost: 3,
    rtp: 0.96,
    reelsAmount: 5,
    symbolsPerReel: [4, 4, 4, 4, 4],
    isBonusBuy: false,
    reelSets: [...Object.values(GENERATORS)],
    resultSets: baseStyleResultSets(),
  }),
  // Direct buy of the normal bonus. Its maxwin books trigger as NORMAL tier
  // (see drawBoard's criteria map) but draw FS boards from the superfreespin
  // reels, whose WR quota makes a forced 25000x reachable in reasonable time.
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
        quota: 0.985,
        forceFreespins: true,
        multiplier: [15, 25000],
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { freespin: 1 },
        },
      }),
      // Guarantees raw candidate books across 2K-20K for the pinned tail
      // targets. Capped at 19999.9 because 20K-24.9K books would fall into
      // the gap between the pinned ladder and the exact-25000 maxwin pin,
      // and bigwin has no criteria target to fall back to.
      new ResultSet({
        criteria: "bigwin",
        quota: 0.01,
        forceFreespins: true,
        multiplier: [2000, 19999.9],
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { superfreespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "maxwin",
        quota: 0.005,
        forceMaxWin: true,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { superfreespin: 1 },
        },
      }),
    ],
  }),
  // Direct buy of the super bonus.
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
        quota: 0.985,
        forceFreespins: true,
        multiplier: [85, 25000],
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { superfreespin: 1 },
        },
      }),
      // "super" in the criteria keeps this a super-tier trigger. Capped at
      // 19999.9 - same unmatched-gap reasoning as bonusFeature's bigwin.
      new ResultSet({
        criteria: "superbigwin",
        quota: 0.01,
        forceFreespins: true,
        multiplier: [2000, 19999.9],
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { superfreespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "maxwin",
        quota: 0.005,
        forceMaxWin: true,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { superfreespin: 1 },
        },
      }),
    ],
  }),
  // Mystery bonus buy: random tier per buy, no dedicated trigger visuals -
  // criteria "0"/superfreespins/hiddenfreespins reuse the exact same tier
  // reel sets and min-win floors as base for a consistent feel.
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
        quota: 0.39,
        forceFreespins: true,
        multiplier: [85, 25000],
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { superfreespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "hiddenfreespins",
        quota: 0.1,
        forceFreespins: true,
        multiplier: [1000, 25000],
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { hiddenfreespin: 1 },
        },
      }),
      new ResultSet({
        criteria: "maxwin",
        quota: 0.01,
        forceMaxWin: true,
        forceFreespins: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base: 1 },
          [SPIN_TYPE.FREE_SPINS]: { superfreespin: 1 },
        },
      }),
    ],
  }),
  // Single-spin buy: guaranteed >=1 WR + >=3 mushrooms (W1/W2/W3) every
  // spin (see drawBoard's featureSpin branch), no scatters/no free spins.
  featureSpin: new GameMode({
    name: "featureSpin",
    cost: 300,
    rtp: 0.96,
    reelsAmount: 5,
    symbolsPerReel: [4, 4, 4, 4, 4],
    isBonusBuy: true,
    reelSets: [...Object.values(GENERATORS)],
    resultSets: [
      new ResultSet({
        criteria: "0",
        quota: 0.15,
        multiplier: 0,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { featureSpin: 1 },
          [SPIN_TYPE.FREE_SPINS]: { featureSpin: 1 },
        },
      }),
      new ResultSet({
        criteria: "win",
        quota: 0.84,
        multiplier: [0.1, 25000],
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { featureSpin: 1 },
          [SPIN_TYPE.FREE_SPINS]: { featureSpin: 1 },
        },
      }),
      new ResultSet({
        criteria: "maxwin",
        quota: 0.01,
        forceMaxWin: true,
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { featureSpinMaxwin: 1 },
          [SPIN_TYPE.FREE_SPINS]: { featureSpinMaxwin: 1 },
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
    // Required by the engine config type; actual trigger/retrigger logic
    // lives in onHandleGameFlow.ts (getBonusTier + per-scatter retriggers).
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

game.configureSimulation({
  simRunsAmount: {
    base: 1000000,
    extraChance: 1000000,
    bonusFeature: 250000,
    superBonusFeature: 250000,
    mysteryBonusFeature: 250000,
    featureSpin: 250000,
  },
  concurrency: 24,
})

// Optimization targets (new @slot-engine/optimizer API):
// - Match-based winRange targets are defined first and claim their books
//   before the criteria targets do (first matching target wins).
// - "maxwin" pins exact-25000x books; big2k5k/big5k10k/big10k20k pin the
//   2K-20K tail buckets to a smooth monotonic decay toward the max win.
//   10K-20K deliberately ends at 19999.9 so non-exact 20K+ books stay
//   near-zero weighted and 20K+ remains the hardest bucket (1 in 10M).
// - "basegame" leaves rtp open, absorbing the remaining RTP budget.
// - "0" has no hitRate, absorbing the remaining probability.
game.configureOptimization({
  base: {
    targets: {
      maxwin: {
        match: { winRange: [25000, 25000] },
        hitRate: 10_000_000,
      },
      big10k20k: {
        match: { winRange: [10000, 19999.9] },
        hitRate: 2_000_000,
        avgWin: 13000,
      },
      big5k10k: {
        match: { winRange: [5000, 9999.9] },
        hitRate: 400_000,
        avgWin: 6500,
      },
      big2k5k: {
        match: { winRange: [2000, 4999.9] },
        hitRate: 90_000,
        avgWin: 3000,
      },
      freespins: {
        hitRate: 300,
        avgWin: 80,
      },
      superfreespins: {
        hitRate: 3000,
        avgWin: 270,
      },
      hiddenfreespins: {
        hitRate: 25000,
        avgWin: 1500,
      },
      basegame: {
        hitRate: 4,
      },
      "0": {},
    },
  },
  // extraChance: identical shape to base, but every FS tier is exactly 5x
  // more likely (hitRate / 5). Same avgWin per tier - RTP per tier rises
  // 5/3x (5x frequency at 3x cost), funded by a smaller basegame share.
  // Tail/maxwin pins scale with cost (base hitRate / 3) so their relative
  // RTP shares stay identical to base.
  extraChance: {
    targets: {
      maxwin: {
        match: { winRange: [25000, 25000] },
        hitRate: 3_333_333,
      },
      big10k20k: {
        match: { winRange: [10000, 19999.9] },
        hitRate: 700_000,
        avgWin: 13000,
      },
      big5k10k: {
        match: { winRange: [5000, 9999.9] },
        hitRate: 135_000,
        avgWin: 6500,
      },
      big2k5k: {
        match: { winRange: [2000, 4999.9] },
        hitRate: 30_000,
        avgWin: 3000,
      },
      freespins: {
        hitRate: 60,
        avgWin: 80,
      },
      superfreespins: {
        hitRate: 600,
        avgWin: 270,
      },
      hiddenfreespins: {
        hitRate: 5000,
        avgWin: 1500,
      },
      basegame: {
        hitRate: 4,
      },
      "0": {},
    },
  },
  // Buy modes: the main bonus target absorbs all remaining probability and
  // RTP after the pinned tail ladder (~0.95 * cost avg win per buy). The
  // scale rules bell-shape the payout distribution around that average - the
  // optimizer still holds the mode RTP and every pin exactly, scaling only
  // reshapes the curve.
  bonusFeature: {
    targets: {
      // Pinned tail ladder (1-in-5K -> 25K -> 100K -> 400K) keeps every
      // bucket past 2K strictly rarer than the one below it, with the exact
      // 25000x maxwin the hardest hit of all.
      maxwin: {
        match: { winRange: [25000, 25000] },
        hitRate: 400_000,
      },
      big10k20k: {
        match: { winRange: [10000, 19999.9] },
        hitRate: 100_000,
        avgWin: 13000,
      },
      big5k10k: {
        match: { winRange: [5000, 9999.9] },
        hitRate: 25_000,
        avgWin: 6500,
      },
      big2k5k: {
        match: { winRange: [2000, 4999.9] },
        hitRate: 5_000,
        avgWin: 3000,
      },
      freespins: {
        // Bell around the ~95x average, with the 100-250x (above-cost) zone
        // boosted for more break-even-or-better buys. [1000,1999.9] is
        // boosted heavily since match targets claim ALL 2000+ books
        // regardless of criteria - nothing can bridge into this bin from
        // above, so it needs a large factor of its own to avoid a valley
        // right before the pinned 2K+ ladder starts.
        scale: [
          { winRange: [15, 29.9], factor: 0.35 },
          { winRange: [30, 49.9], factor: 0.7 },
          { winRange: [50, 99.9], factor: 1.4 },
          { winRange: [100, 149.9], factor: 2.6 },
          { winRange: [150, 249.9], factor: 1.8 },
          { winRange: [250, 499.9], factor: 0.6 },
          { winRange: [500, 999.9], factor: 0.35 },
          { winRange: [1000, 1999.9], factor: 15 },
        ],
      },
    },
  },
  superBonusFeature: {
    targets: {
      // Pinned tail ladder (1-in-1.5K -> 7K -> 25K -> 100K), maxwin hardest.
      maxwin: {
        match: { winRange: [25000, 25000] },
        hitRate: 100_000,
      },
      big10k20k: {
        match: { winRange: [10000, 19999.9] },
        hitRate: 25_000,
        avgWin: 13000,
      },
      big5k10k: {
        match: { winRange: [5000, 9999.9] },
        hitRate: 7_000,
        avgWin: 6500,
      },
      big2k5k: {
        match: { winRange: [2000, 4999.9] },
        hitRate: 1_500,
        avgWin: 3000,
      },
      superfreespins: {
        // Bell around the ~285x average with the 300-800x (above-cost) zone
        // boosted for more break-even-or-better buys. 800-2000 boosted for
        // the same reason as bonusFeature's [1000,1999.9] - the pinned 2K+
        // ladder steals every book past 2000 regardless of criteria, so this
        // range has to carry its own weight rather than blending into it.
        scale: [
          { winRange: [85, 119.9], factor: 0.5 },
          { winRange: [120, 199.9], factor: 0.8 },
          { winRange: [200, 299.9], factor: 1.5 },
          { winRange: [300, 499.9], factor: 2.4 },
          { winRange: [500, 799.9], factor: 1.4 },
          { winRange: [800, 1499.9], factor: 2.0 },
          { winRange: [1500, 1999.9], factor: 3.0 },
        ],
      },
    },
  },
  // Mystery bonus: literal 50/40/10 split via explicit hitRates (no pinned
  // 2K+ tail ladder here - a match-based ladder would siphon probability
  // out of the super/hidden shares and break the literal percentages asked
  // for; the tradeoff is 2K-25K isn't guaranteed monotonic yet, revisit if
  // real data shows a problem there). maxwin's tiny share is carved out of
  // superfreespins (matches the "maxwin runs as super tier" convention).
  // superfreespins fixes avgWin~300; hiddenfreespins leaves avgWin OPEN to
  // absorb whatever RTP remains after super/maxwin - at cost 500x with only
  // a 50% win probability, the math forces hidden's avg win to land far
  // above 1500x (see chat) to still hit 96% RTP. Flagged to user - not a
  // bug, a real conflict between the literal 40/10/50 split, ~1500x-ish
  // hidden avg, and 96% RTP at this cost; needs a decision before tuning.
  mysteryBonusFeature: {
    targets: {
      maxwin: {
        match: { winRange: [25000, 25000] },
        hitRate: 20_000,
      },
      superfreespins: {
        hitRate: 2.5,
        avgWin: 300,
      },
      hiddenfreespins: {
        hitRate: 10,
      },
      "0": {},
    },
  },
  // Single-spin buy: "win" has no hitRate/rtp of its own for the 0/win
  // split - "maxwin" hitRate is set so "win" (absorbing the rest) lands at
  // ~90% non-zero hit rate.
  featureSpin: {
    targets: {
      maxwin: {
        match: { winRange: [25000, 25000] },
        hitRate: 50_000,
      },
      win: {
        hitRate: 1.111,
      },
      "0": {},
    },
  },
})

game.runTasks({
  doSimulation: true,
  doOptimization: true,
  optimizationOpts: {
    gameModes: [
      "base",
      "extraChance",
      "bonusFeature",
      "superBonusFeature",
      "mysteryBonusFeature",
      "featureSpin",
    ],
  },
})
