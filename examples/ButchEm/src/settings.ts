import { BonusTier, ModeName, UpgradeId } from "./types"

export interface UpgradeRule {
  /** Real H symbols crossed during movement across this feature, regardless of wins. */
  requiredSymbols: number
  multiplier?: number
  size?: "2"
  additionalWilds?: number
}

export interface FeatureRules {
  upgrades: Record<UpgradeId, UpgradeRule>
  startingUpgradeCount: Record<BonusTier, number>
  maxMovesPerSpin: number
  naturalWildWeight: number
  maxRoamingWilds: number
  /** Chance per truck per collection move to pick only among routes that cross
   * an H symbol whose upgrade is still locked; otherwise any route is equally likely. */
  collectionSeekChance: number
}

export const MAX_ROAMING_MOVES = 8

export const FEATURE_RULES: FeatureRules = {
  upgrades: {
    1: { requiredSymbols: 5, size: "2" },
    2: { requiredSymbols: 5, additionalWilds: 1 },
    3: { requiredSymbols: 5, multiplier: 20 },
    4: { requiredSymbols: 5, multiplier: 5 },
  },
  startingUpgradeCount: { normal: 0, super: 1, hidden: 2 },
  maxMovesPerSpin: MAX_ROAMING_MOVES,
  naturalWildWeight: 0,
  maxRoamingWilds: 2,
  collectionSeekChance: 0.25,
}

/** H1-H4 weight multiplier on the free-spin reel strips of triggered bonuses
 * ("free_*" reel sets). Base-game and featureSpin strips are unchanged. Core
 * reuses existing reel CSVs, so delete __build__/reels_*-free_*.csv after
 * changing this value. */
export const FREE_SPIN_H_WEIGHT_MULTIPLIER = 1.35

/** Final optimized probabilities for the number of upgrades in featureSpin. */
export const FEATURE_SPIN_UPGRADE_COUNT_PROBABILITIES = {
  1: 0.7,
  2: 0.15,
  3: 0.1,
  4: 0.05,
} as const

/** Keep 85% of otherwise-valid non-triggering base boards containing S.
 * Zero-scatter boards, forced triggers, and free spins bypass this filter. */
export const NON_TRIGGER_SCATTER_ACCEPTANCE = 0.85

/** Accepted simulation books to generate for each mode. */
export const SIM_RUNS = {
  base: 10_000,
  extraChance: 10_000,
  extraChance2: 10_000,
  featureSpin: 10_000,
  bonusFeature: 10_000,
  superBonusFeature: 10_000,
  hiddenBonusFeature: 10_000,
} satisfies Record<ModeName, number>

export interface ModeSettings {
  cost: number
  hitRate: number
  bonusFrequencyMultiplier: number
  boughtTier?: BonusTier
}
export const MODES: Record<ModeName, ModeSettings> = {
  base: {
    cost: 1,
    hitRate: 0.2,
    bonusFrequencyMultiplier: 1,
  },
  extraChance: {
    cost: 1.5,
    hitRate: 0.22,
    bonusFrequencyMultiplier: 2,
  },
  extraChance2: {
    cost: 3,
    hitRate: 0.235,
    bonusFrequencyMultiplier: 5,
  },
  featureSpin: {
    cost: 50,
    hitRate: 0.77,
    bonusFrequencyMultiplier: 0,
  },
  bonusFeature: {
    cost: 100,
    hitRate: 1,
    bonusFrequencyMultiplier: 0,
    boughtTier: "normal",
  },
  superBonusFeature: {
    cost: 300,
    hitRate: 1,
    bonusFrequencyMultiplier: 0,
    boughtTier: "super",
  },
  hiddenBonusFeature: {
    cost: 1000,
    hitRate: 1,
    bonusFrequencyMultiplier: 0,
    boughtTier: "hidden",
  },
}
export const BONUS_TARGETS = {
  normal: { oneIn: 300, average: 96, minimum: 16 },
  super: { oneIn: 3000, average: 288, minimum: 87 },
  hidden: { oneIn: 62_500, average: 960, minimum: 1011 },
} satisfies Record<BonusTier, { oneIn: number; average: number; minimum: number }>

export const DESIGN = { rtp: 0.96, wildCombination: "add" } as const

/** Purchased round floors in base-bet x; natural entries keep BONUS_TARGETS.minimum. */
export const BONUS_BUY_MINIMUMS = { normal: 1, super: 10, hidden: 50 } as const

/** Natural (spun-into) round means. Purchased tiers return DESIGN.rtp * cost. */
export const NATURAL_BONUS_AVERAGES = {
  base: { normal: 92, super: 276, hidden: 1750 },
  extraChance: { normal: 88, super: 268, hidden: 1725 },
  extraChance2: { normal: 86, super: 264, hidden: 1712.5 },
} satisfies Record<"base" | "extraChance" | "extraChance2", Record<BonusTier, number>>

/** Reference chart's effective 1-in-X odds for 1-2, 2-5, ..., 5000-10000x.
 * Natural probabilities are refitted to each route's floor and mean. */
export const BONUS_REFERENCE_ODDS = {
  normal: [
    4409560.74, 7.32, 6.88, 9.94, 6.21, 5.29, 7, 9.61, 56.66, 538.13, 2093.3, 30366.11,
  ],
  super: [
    27650071.87, 11.21, 11.96, 12.17, 11.03, 15.96, 9.7, 3.7, 8.2, 19.22, 29.03, 132.53,
  ],
} as const

/** Quadratic log-payout weight added to natural Normal/Super fits. Positive values
 * move mass toward the floor and the high tail at the same mean, lowering medians. */
export const NATURAL_BONUS_SPREAD = { normal: 0.15, super: 0.2 } as const

/** Exact max wins receive this share of the payout budget above the round floor. */
export const BONUS_MAX_EXCESS_SHARE = 0.01

/** Whole-round max-win odds for paid base-game modes. Each mode scales its natural
 * bonus max-win slices by one factor; that budget returns to the bonus curves. */
export const NATURAL_MAX_WIN_ONE_IN = {
  base: 4_000_000,
  extraChance: 3_200_000,
  extraChance2: 2_800_000,
} satisfies Record<"base" | "extraChance" | "extraChance2", number>

/** FeatureSpin max-win odds; only four-upgrade spins can reach the cap. */
export const FEATURE_SPIN_MAX_WIN_ONE_IN = 60_000

/** Highest payout each featureSpin upgrade count may be steered toward, and the
 * lowest for four upgrades. More upgrades usually, but not always, pay more:
 * the payout tilt below decides how strongly counts separate inside shared bands. */
export const FEATURE_SPIN_COUNT_LIMITS = {
  1: { min: 0, max: 499.99 },
  2: { min: 0.01, max: 1999.99 },
  3: { min: 0.01, max: 4999.99 },
  4: { min: 50, max: 10_000 },
} as const
export const FEATURE_SPIN_COUNT_TILT = 0.55
