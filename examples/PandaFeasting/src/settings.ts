import { BonusTier, ModeName, Stage } from "./types"

export const FEATURE_RULES = {
  stageThresholds: {
    normal: { 1: 15, 2: 15, 3: 15, 4: 15 },
    super: { 1: 12, 2: 12, 3: 12, 4: 12 },
    hidden: { 1: 10, 2: 10, 3: 10, 4: 10 },
  } satisfies Record<BonusTier, Record<Exclude<Stage, 5>, number>>,
  stageMultipliers: { 1: 1, 2: 2, 3: 5, 4: 10, 5: 25 } satisfies Record<Stage, number>,
  carryProgress: false,
  baseExplosionProbability: 0.025,
  spawnCountWeights: { 3: 30, 4: 25, 5: 18, 6: 12, 7: 7, 8: 4, 9: 3, 10: 1 },
  // Select a stage independently for each FeatureSpin wild. Values are always
  // resolved through stageMultipliers, never through a separate multiplier pool.
  featureSpinStageWeights: { 1: 50, 2: 30, 3: 12, 4: 6, 5: 2 },
  naturalWildWeight: 0.5,
}
/** Proposal weights for FeatureSpin simulation bands starting at 2,000x.
 * The optimizer assigns these books their final player probability. Keep every
 * legal count and stage supported; no board or payout is fabricated. */
export const FEATURE_SPIN_HIGH_WIN_SAMPLING = {
  spawnCountWeights: { 3: 1, 4: 1, 5: 3, 6: 5, 7: 10, 8: 20, 9: 25, 10: 35 },
  stageWeights: { 1: 1, 2: 2, 3: 5, 4: 12, 5: 80 } satisfies Record<Stage, number>,
}
/** Candidate payout groups inherited from ButchEm; these are NOT bonus stages. */
export const FEATURE_SPIN_COVERAGE_PROBABILITIES = {
  1: 0.7,
  2: 0.15,
  3: 0.1,
  4: 0.05,
} as const
export const NON_TRIGGER_SCATTER_ACCEPTANCE = 0.85
export const SIM_RUNS: Record<ModeName, number> = {
  base: 10_000,
  extraChance: 10_000,
  extraChance2: 10_000,
  featureSpin: 10_000,
  bonusFeature: 10_000,
  superBonusFeature: 10_000,
  hiddenBonusFeature: 10_000,
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
  featureSpin: { cost: 50, hitRate: 0.8, bonusFrequencyMultiplier: 0 },
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
