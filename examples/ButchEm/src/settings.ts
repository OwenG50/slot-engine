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
}

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
  base: 600_000,
  extraChance: 600_000,
  extraChance2: 600_000,
  featureSpin: 150_000,
  bonusFeature: 150_000,
  superBonusFeature: 150_000,
  hiddenBonusFeature: 150_000,
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
    hitRate: 0.25,
    bonusFrequencyMultiplier: 2,
  },
  extraChance2: {
    cost: 3,
    hitRate: 0.25,
    bonusFrequencyMultiplier: 5,
  },
  featureSpin: {
    cost: 50,
    hitRate: 0.8,
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
  hidden: { oneIn: 50_000, average: 960, minimum: 800 },
} satisfies Record<BonusTier, { oneIn: number; average: number; minimum: number }>

export const DESIGN = { rtp: 0.96, wildCombination: "add" } as const
