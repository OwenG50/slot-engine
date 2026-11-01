import { BonusTier, ModeName, Stage } from "./types"

export const FEATURE_RULES = {
  stageThresholds: {
    normal: { 1: 10, 2: 12, 3: 15, 4: 18, 5: 21, 6: 24 },
    super: { 1: 9, 2: 11, 3: 13, 4: 16, 5: 19, 6: 22 },
    hidden: { 1: 8, 2: 10, 3: 12, 4: 14, 5: 17, 6: 20 },
  } satisfies Record<BonusTier, Record<Stage, number>>,
  stageMultipliers: { 1: 1, 2: 2, 3: 5, 4: 10, 5: 25, 6: 50 } satisfies Record<
    Stage,
    number
  >,
  carryProgress: false,
  baseExplosionProbability: 0.02,
  spawnCountWeights: {
    3: 30,
    4: 25,
    5: 18,
    6: 12,
    7: 7,
    8: 4,
    9: 3,
    10: 1,
    11: 0.5,
    12: 0.25,
    13: 0.1,
    14: 0.05,
    15: 1,
  },
  // Select one stage per FeatureSpin; every wild shares its stage multiplier.
  featureSpinStageWeights: { 1: 50, 2: 30, 3: 6, 4: 6, 5: 6, 6: 2 },
  naturalWildWeight: 0.5,
}
export const HIDDEN_BUY_PAYOUT_SPREAD = 1.75
/** Published stage shares and median anchors in base-bet x, fitted inside payout bands. */
export const FEATURE_SPIN_STAGE_TARGETS = [
  { multiplier: 1, probability: 0.33, median: 5 },
  { multiplier: 2, probability: 0.27, median: 10 },
  { multiplier: 5, probability: 0.13, median: 15 },
  { multiplier: 10, probability: 0.11, median: 20 },
  { multiplier: 25, probability: 0.09, median: 30 },
  { multiplier: 50, probability: 0.07, median: 50 },
] as const
/** Reference chart's effective 1-in-X odds for 1-2, 2-5, ..., 5000-10000x.
 * Player probabilities are refitted to each route's floor and existing mean. */
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
export const NATURAL_BONUS_AVERAGES = {
  base: { normal: 92, super: 276, hidden: 1750 },
  extraChance: { normal: 88, super: 268, hidden: 1725 },
  extraChance2: { normal: 86, super: 264, hidden: 1712.5 },
} satisfies Record<"base" | "extraChance" | "extraChance2", Record<BonusTier, number>>
/** Exact max wins receive 1% of the payout budget above the guaranteed floor.
 * The remaining tail is distributed below the cap rather than piled onto it. */
export const BONUS_MAX_EXCESS_SHARE = 0.01
/** Stage proposals for FeatureSpin bands starting at 2,000x. All count draws,
 * including these candidates, use FEATURE_RULES.spawnCountWeights. */
export const FEATURE_SPIN_HIGH_WIN_SAMPLING = {
  stageWeights: { 1: 1, 2: 2, 3: 2, 4: 3, 5: 12, 6: 80 } satisfies Record<Stage, number>,
}
export const SIM_RUNS: Record<ModeName, number> = {
  base: 700_000,
  extraChance: 700_000,
  extraChance2: 700_000,
  featureSpin: 100_000,
  bonusFeature: 100_000,
  superBonusFeature: 100_000,
  hiddenBonusFeature: 100_000,
}
export interface ModeSettings {
  cost: number
  hitRate: number
  bonusFrequencyMultiplier: number
  boughtTier?: BonusTier
}
export const MODES: Record<ModeName, ModeSettings> = {
  base: { cost: 1, hitRate: 0.2, bonusFrequencyMultiplier: 1 },
  extraChance: { cost: 1.5, hitRate: 0.25, bonusFrequencyMultiplier: 2 },
  extraChance2: { cost: 3, hitRate: 0.25, bonusFrequencyMultiplier: 5 },
  featureSpin: { cost: 50, hitRate: 0.72, bonusFrequencyMultiplier: 0 },
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
/** FeatureSpin max-win odds are set directly; bonus max odds emerge from their curves. */
export const MAX_WIN_ONE_IN = {
  featureSpin: 60_000,
}
/** Whole-round max-win odds for paid base-game modes. Each mode scales its natural
 * bonus max-win slices by one factor; that budget returns to the bonus curves. */
export const NATURAL_MAX_WIN_ONE_IN = {
  base: 4_000_000,
  extraChance: 3_200_000,
  extraChance2: 2_800_000,
} satisfies Record<"base" | "extraChance" | "extraChance2", number>
/** Paid-round odds of a base-game (non-bonus) panda explosion. Book weighting
 * inside each exact payout band keeps explosions rare in every paid spin mode. */
export const BASE_GAME_EXPLOSION_ONE_IN = {
  base: 80,
  extraChance: 80,
  extraChance2: 80,
} satisfies Record<"base" | "extraChance" | "extraChance2", number>
/** Published full-screen targets, applied by book weighting within exact payout bands.
 * Stage 4-6 (10x/25x/50x) full screens always pay the cap, so together they take
 * `maxWinShare` of each mode's unchanged max-win probability, split evenly; other
 * max-win routes keep the rest. Each stage 1-3 multiplier targets `lowStageRatio`
 * times one high stage's probability. */
export const FULL_SCREEN_TARGETS = {
  maxWinShare: 0.6,
  lowStageRatio: 4,
  highStageMultipliers: [10, 25, 50],
} as const
