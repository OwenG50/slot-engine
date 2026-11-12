import { BonusTier, CarSymbol, ModeName } from "./types"

export interface ModeSettings {
  cost: number
  hitRate: number
  bonusFrequencyMultiplier: number
  boughtTier?: BonusTier
}

export const MODES: Record<ModeName, ModeSettings> = {
  base: { cost: 1, hitRate: 0.2, bonusFrequencyMultiplier: 1 },
  extraChance: { cost: 1.5, hitRate: 0.24, bonusFrequencyMultiplier: 2 },
  extraChance2: { cost: 3, hitRate: 0.25, bonusFrequencyMultiplier: 5 },
  featureSpin: { cost: 50, hitRate: 0.78, bonusFrequencyMultiplier: 0 },
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

export const DESIGN = { rtp: 0.96, wildCombination: "add" } as const

export const BONUS_TARGETS = {
  normal: { oneIn: 300, average: 96, minimum: 16 },
  super: { oneIn: 3000, average: 288, minimum: 87 },
  hidden: { oneIn: 62_500, average: 960, minimum: 1011 },
} satisfies Record<BonusTier, { oneIn: number; average: number; minimum: number }>

export const BONUS_BUY_MINIMUMS = { normal: 1, super: 10, hidden: 50 } as const

export const NATURAL_MAX_WIN_ONE_IN = {
  base: 4_000_000,
  extraChance: 3_200_000,
  extraChance2: 2_800_000,
} satisfies Record<"base" | "extraChance" | "extraChance2", number>

export const FEATURE_SPIN_MAX_WIN_ONE_IN = 60_000

/** Matches ButchEm and PandaFeasting's purchased max-win payout budget. */
export const BONUS_MAX_EXCESS_SHARE = 0.01

/** Bonus entries spun from FeatureSpin are intentionally extreme. */
export const FEATURE_TRIGGER_BONUS_MINIMUMS: Record<BonusTier, number> = {
  normal: 120,
  super: 450,
  hidden: 1600,
}

/** In FeatureSpin, hitting a bonus is 5x less likely than base-game trigger odds. */
export const FEATURE_TO_BONUS_TRIGGER_SCALE = 0.2

export const SIM_RUNS: Record<ModeName, number> = {
  base: 10_000,
  extraChance: 10_000,
  extraChance2: 10_000,
  featureSpin: 10_000,
  bonusFeature: 10_000,
  superBonusFeature: 10_000,
  hiddenBonusFeature: 10_000,
}

export const CAR_MULTIPLIER_WEIGHTS: Record<CarSymbol, Array<{ value: number; weight: number }>> = {
  W3: [
    { value: 2, weight: 6 },
    { value: 3, weight: 5 },
    { value: 4, weight: 4 },
    { value: 5, weight: 3 },
  ],
  W2: [
    { value: 6, weight: 11 },
    { value: 7, weight: 10 },
    { value: 8, weight: 9 },
    { value: 9, weight: 8 },
    { value: 10, weight: 7 },
    { value: 12, weight: 6 },
    { value: 14, weight: 5 },
    { value: 15, weight: 4 },
  ],
  W1: [
    { value: 20, weight: 10 },
    { value: 25, weight: 9 },
    { value: 30, weight: 8 },
    { value: 35, weight: 7 },
    { value: 40, weight: 6 },
    { value: 50, weight: 5 },
  ],
}

/** Only paid FeatureSpin guarantees two new cars and an active camera. */
export const FEATURE_SPIN_MIN_NEW_CARS = 2

/** Candidate counts; legal-board and payout filtering determine published frequencies. */
export const FEATURE_SPIN_CAR_COUNT_WEIGHTS = [
  { value: 2, weight: 70 },
  { value: 3, weight: 12 },
  { value: 4, weight: 8 },
  { value: 5, weight: 4 },
  { value: 6, weight: 3 },
  { value: 7, weight: 2 },
  { value: 8, weight: 1 },
]

export const FEATURE_SPIN_CAMERA_COUNT_WEIGHTS = [
  { value: 1, weight: 70 },
  { value: 2, weight: 18 },
  { value: 3, weight: 8 },
  { value: 4, weight: 3 },
  { value: 5, weight: 1 },
]

export const CAR_COLLISION_BIAS = {
  newPair: 0.5,
  towardSticky: 0.65,
} as const

/** Chance that a lone new car gets an opposing partner on its row. */
export const HEAD_ON_PARTNER_CHANCE = { paid: 0.27, free: 0.73 } as const

/** Per-tier free-spin chance to add a pair when no compatible opposing pair landed. */
export const HEAD_ON_FREE_PAIR_CHANCE: Record<BonusTier, number> = {
  normal: 0.2,
  super: 0.09,
  hidden: 0,
}

export const HEAD_ON_PARTNER_SYMBOLS: Array<{ value: CarSymbol; weight: number }> = [
  { value: "W3", weight: 40 },
  { value: "W2", weight: 30 },
  { value: "W1", weight: 30 },
]

export const BONUS_ENTRY_RULES = {
  normal: { initialActiveCameras: 0, firstSpinMinNewCars: 0 },
  super: { initialActiveCameras: 1, firstSpinMinNewCars: 1 },
  hidden: { initialActiveCameras: 2, firstSpinMinNewCars: 2 },
} as const
