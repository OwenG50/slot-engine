import { OptimizationTarget } from "@slot-engine/optimizer"
import {
  BONUS_TARGETS,
  BONUS_BUY_MINIMUMS,
  MAX_WIN_ONE_IN,
  DESIGN,
  MODES,
  NATURAL_BONUS_AVERAGES,
  NATURAL_MAX_WIN_ONE_IN,
} from "./settings"
import { BonusTier, MAX_WIN, ModeName } from "./types"
import { purchasedBonusDistribution, naturalBonusDistribution } from "./bonusDistribution"

export interface MathBucket {
  name: string
  probability: number
  average: number
  range: [number, number]
  tier?: BonusTier
}

export const HIT_TARGETS: Record<ModeName, number> = {
  base: 0.2,
  extraChance: 0.25,
  extraChance2: 0.25,
  featureSpin: MODES.featureSpin.hitRate,
  bonusFeature: 1,
  superBonusFeature: 1,
  hiddenBonusFeature: 1,
}

export function bonusAverage(mode: ModeName, tier: BonusTier) {
  if (mode === "base" || mode === "extraChance" || mode === "extraChance2")
    return NATURAL_BONUS_AVERAGES[mode][tier]
  return BONUS_TARGETS[tier].average
}

export function bonusMinimum(mode: ModeName, tier: BonusTier) {
  return MODES[mode].boughtTier ? BONUS_BUY_MINIMUMS[tier] : BONUS_TARGETS[tier].minimum
}

/** One factor per paid base-game mode scales every natural tier's max slice so
 * the whole-round max-win odds match NATURAL_MAX_WIN_ONE_IN. */
export function naturalMaxWinScale(mode: ModeName) {
  if (!(mode in NATURAL_MAX_WIN_ONE_IN)) return 1
  const natural = mode as keyof typeof NATURAL_MAX_WIN_ONE_IN
  const unscaled = (["normal", "super", "hidden"] as const).reduce(
    (sum, tier) =>
      sum +
      (MODES[mode].bonusFrequencyMultiplier / BONUS_TARGETS[tier].oneIn) *
        naturalBonusDistribution(tier, bonusMinimum(mode, tier), bonusAverage(mode, tier)).at(
          -1,
        )!.probability,
    0,
  )
  return 1 / NATURAL_MAX_WIN_ONE_IN[natural] / unscaled
}

/** Conditional max odds emerge from each floor-adjusted payout curve. */
export function bonusMaxWinProbability(mode: ModeName, tier: BonusTier) {
  if (MODES[mode].boughtTier)
    return purchasedBonusDistribution(
      tier,
      bonusMinimum(mode, tier),
      bonusAverage(mode, tier),
    ).at(-1)!.probability
  return naturalBonusDistribution(
    tier,
    bonusMinimum(mode, tier),
    bonusAverage(mode, tier),
    naturalMaxWinScale(mode),
  ).at(-1)!.probability
}

// PandaFeasting's sub-0.25x wins are discrete 0.1x/0.2x payouts. A requested
// 0.2x mean is an endpoint and cannot be solved with finite exponential tilts.
const SMALL_WIN_AVERAGE = 0.15
function tierBuckets(
  mode: ModeName,
  tier: BonusTier,
  probability: number,
  average: number,
): MathBucket[] {
  const local = MODES[mode].boughtTier
    ? purchasedBonusDistribution(tier, bonusMinimum(mode, tier), average)
    : naturalBonusDistribution(
        tier,
        bonusMinimum(mode, tier),
        average,
        naturalMaxWinScale(mode),
      )
  return local.map((b) => ({
    ...b,
    name: tier + "_" + b.name,
    tier,
    probability: b.probability * probability,
  }))
}
export function mathBuckets(mode: ModeName): MathBucket[] {
  const settings = MODES[mode]
  const expected = DESIGN.rtp * settings.cost
  if (settings.boughtTier) return tierBuckets(mode, settings.boughtTier, 1, expected)
  if (mode === "featureSpin") {
    // Panda's single-spin wild feature has no coverage-count families.
    // Disjoint payout bands control its curve; wild counts and multipliers
    // are sampled solely from Panda's feature rules and high-win proposals.
    const maxProbability = 1 / MAX_WIN_ONE_IN.featureSpin
    const fixed: MathBucket[] = [
      {
        name: "feature_loss",
        probability: 1 - HIT_TARGETS[mode],
        average: 0,
        range: [0, 0],
      },
      {
        name: "feature_under_025",
        probability: 0.001,
        average: SMALL_WIN_AVERAGE,
        range: [0.01, 0.24],
      },
      { name: "feature_025_05", probability: 0.002, average: 0.35, range: [0.25, 0.49] },
      { name: "feature_05_1", probability: 0.003, average: 0.7, range: [0.5, 0.99] },
      { name: "feature_1_2", probability: 0.018, average: 1.5, range: [1, 1.99] },
      { name: "feature_2_5", probability: 0.12, average: 3.5, range: [2, 4.99] },
      { name: "feature_5_10", probability: 0.16, average: 7, range: [5, 9.99] },
      { name: "feature_10_25", probability: 0.15, average: 17, range: [10, 24.99] },
      { name: "feature_25_50", probability: 0.095, average: 37, range: [25, 49.99] },
      { name: "feature_50_100", probability: 0.062, average: 70, range: [50, 99.99] },
      { name: "feature_250_500", probability: 0.027, average: 350, range: [250, 499.99] },
      { name: "feature_500_1K", probability: 0.0175, average: 700, range: [500, 999.99] },
      {
        name: "feature_1K_2K",
        probability: 0.0027,
        average: 1400,
        range: [1000, 1999.99],
      },
      {
        name: "feature_2K_3K",
        probability: 0.0003,
        average: 2400,
        range: [2000, 2999.99],
      },
      {
        name: "feature_3K_5K",
        probability: 0.00016,
        average: 3600,
        range: [3000, 4999.99],
      },
      {
        name: "feature_5K_10K",
        probability: 0.0001 - maxProbability,
        average: 6000,
        range: [5000, 9999.99],
      },
      {
        name: "feature_max",
        probability: maxProbability,
        average: MAX_WIN,
        range: [MAX_WIN, MAX_WIN],
      },
    ]
    const result = [
      ...fixed,
      remainingBand("feature_100_250", [100, 249.99], 1, expected, fixed),
    ]
    validateBuckets(mode, result)
    return result
  }
  const tiers = (["normal", "super", "hidden"] as const).flatMap((tier) =>
    tierBuckets(
      mode,
      tier,
      settings.bonusFrequencyMultiplier / BONUS_TARGETS[tier].oneIn,
      bonusAverage(mode, tier),
    ),
  )
  const bonusP = tiers.reduce((sum, b) => sum + b.probability, 0)
  const bonusEV = tiers.reduce((sum, b) => sum + b.probability * b.average, 0)
  const ordinaryP = HIT_TARGETS[mode] - bonusP
  const buckets: MathBucket[] = [
    { name: "loss", probability: 1 - HIT_TARGETS[mode], average: 0, range: [0, 0] },
    {
      name: "baseWin",
      probability: ordinaryP,
      average: (expected - bonusEV) / ordinaryP,
      range: [0.01, 1999.99],
    },
    ...tiers,
  ]
  validateBuckets(mode, buckets)
  return buckets
}
export function validateBuckets(mode: ModeName, buckets = mathBuckets(mode)) {
  const p = buckets.reduce((sum, b) => sum + b.probability, 0)
  const ev = buckets.reduce((sum, b) => sum + b.probability * b.average, 0)
  if (Math.abs(p - 1) > 1e-10 || Math.abs(ev / MODES[mode].cost - DESIGN.rtp) > 1e-9)
    throw new Error(mode + ": inconsistent probability/RTP budget")
  for (const b of buckets) {
    if (!(b.probability > 0) || b.average < b.range[0] || b.average > b.range[1]) {
      throw new Error(mode + "/" + b.name + ": infeasible bucket " + JSON.stringify(b))
    }
  }
}
/** Panel's Payout < Bet Hit Rate: zero pays and partial returns count here.
 * Base keeps its existing distribution. Cost recovery is 1 - this rate. */
export const BELOW_COST_TARGETS: Partial<Record<ModeName, number>> = {
  extraChance: 0.9,
  extraChance2: 0.9,
}

export interface OptimizationBucket extends MathBucket {
  criteria: string[]
}

type OptimizationBand = Pick<
  OptimizationBucket,
  "name" | "probability" | "average" | "range"
>

/** Allocate the remaining probability and EV to a populated balancing band. */
function remainingBand(
  name: string,
  range: [number, number],
  probability: number,
  expectedPayout: number,
  fixed: OptimizationBand[],
): OptimizationBand {
  const remaining = probability - fixed.reduce((sum, b) => sum + b.probability, 0)
  return {
    name,
    range,
    probability: remaining,
    average:
      (expectedPayout - fixed.reduce((sum, b) => sum + b.probability * b.average, 0)) /
      remaining,
  }
}

/** Transfer ordinary upper-band probability into a small cost-recovering band,
 * preserving nonzero hits, below-cost odds and the available ordinary-win EV. */
function balanceOrdinaryWins(
  baseWin: OptimizationBucket,
  shape: OptimizationBand[],
  recoveryName: string,
): OptimizationBucket[] {
  const recovery = shape.find((b) => b.name === recoveryName)!
  const lower = shape.filter((b) => b.range[1] < recovery.range[0])
  const upper = shape.filter((b) => b.range[0] > recovery.range[1])
  const remainingP =
    baseWin.probability - lower.reduce((sum, b) => sum + b.probability, 0)
  const remainingEV =
    baseWin.probability * baseWin.average -
    lower.reduce((sum, b) => sum + b.probability * b.average, 0)
  const upperP = upper.reduce((sum, b) => sum + b.probability, 0)
  const upperEV = upper.reduce((sum, b) => sum + b.probability * b.average, 0)
  const scale =
    (remainingEV - remainingP * recovery.average) / (upperEV - upperP * recovery.average)
  if (!(scale > 0 && scale < 1)) throw new Error("Infeasible ordinary-win transfer")
  return [
    ...lower,
    { ...recovery, probability: remainingP - scale * upperP },
    ...upper.map((b) => ({ ...b, probability: b.probability * scale })),
  ].map((b) => ({ ...baseWin, ...b, criteria: baseWin.criteria }))
}

/** Split existing candidate criteria at the paid cost. Preserve their combined
 * probability and expected payout; the upper group balances the payout budget. */
function splitAtCost(
  bucket: OptimizationBucket,
  cost: number,
  belowProbability: number,
  belowAverage: number,
): OptimizationBucket[] {
  const recoveryProbability = bucket.probability - belowProbability
  return [
    {
      ...bucket,
      name: bucket.name + "_below_cost",
      probability: belowProbability,
      average: belowAverage,
      range: [bucket.range[0], cost - 0.01],
    },
    {
      ...bucket,
      name: bucket.name + "_cost_recovery",
      probability: recoveryProbability,
      average:
        (bucket.probability * bucket.average - belowProbability * belowAverage) /
        recoveryProbability,
      range: [cost, bucket.range[1]],
    },
  ]
}

/** Simulation buckets provide coverage; these groups set final player odds.
 * Range matchers let existing books and future simulations use the same targets. */
function buildOptimizationBuckets(mode: ModeName): OptimizationBucket[] {
  const buckets = mathBuckets(mode).map((bucket) => ({
    ...bucket,
    criteria: [bucket.name],
  }))
  if (mode === "base") {
    const baseWin = buckets.find((bucket) => bucket.name === "baseWin")!
    const fixedBands = [
      {
        name: "baseWin_under_025",
        probability: 0.04,
        average: SMALL_WIN_AVERAGE,
        range: [0.01, 0.24],
      },
      { name: "baseWin_025_05", probability: 0.03, average: 0.35, range: [0.25, 0.49] },
      { name: "baseWin_05_1", probability: 0.02, average: 0.7, range: [0.5, 0.99] },
      { name: "baseWin_2_5", probability: 0.024, average: 2.8, range: [2, 4.99] },
      { name: "baseWin_5_10", probability: 0.0115, average: 6, range: [5, 9.99] },
      { name: "baseWin_10_20", probability: 0.0045, average: 12, range: [10, 19.99] },
      { name: "baseWin_20_50", probability: 0.0027, average: 26, range: [20, 49.99] },
      { name: "baseWin_50_100", probability: 0.0008, average: 65, range: [50, 99.99] },
      {
        name: "baseWin_100_200",
        probability: 0.0007,
        average: 108,
        range: [100, 199.99],
      },
      {
        name: "baseWin_200_plus",
        probability: 0.0005,
        average: 250,
        range: [200, 1999.99],
      },
    ] satisfies Omit<OptimizationBucket, "criteria">[]
    const fixedProbability = fixedBands.reduce(
      (sum, bucket) => sum + bucket.probability,
      0,
    )
    const oneToTwoProbability = baseWin.probability - fixedProbability
    const oneToTwoAverage = 1.35
    const shapedBaseWins: OptimizationBucket[] = [
      ...fixedBands.slice(0, 3).map((bucket) => ({
        ...bucket,
        criteria: baseWin.criteria,
      })),
      {
        name: "baseWin_1_2",
        probability: oneToTwoProbability,
        average: oneToTwoAverage,
        range: [1, 1.99],
        criteria: baseWin.criteria,
      },
      ...fixedBands.slice(3).map((bucket) => ({ ...bucket, criteria: baseWin.criteria })),
    ]
    const result = [
      ...buckets.filter((bucket) => bucket !== baseWin),
      ...balanceOrdinaryWins(baseWin, shapedBaseWins, "baseWin_2_5"),
    ]
    validateBuckets(mode, result)
    return result
  }
  const belowTarget = BELOW_COST_TARGETS[mode]
  if (belowTarget === undefined) return buckets
  const { cost, boughtTier } = MODES[mode]
  let result: OptimizationBucket[]
  if (mode === "extraChance" || mode === "extraChance2") {
    const baseWin = buckets.find((bucket) => bucket.name === "baseWin")!
    const shape: OptimizationBand[] =
      mode === "extraChance"
        ? [
            {
              name: "baseWin_under_025",
              probability: 0.025,
              average: SMALL_WIN_AVERAGE,
              range: [0.01, 0.24],
            },
            {
              name: "baseWin_025_05",
              probability: 0.03,
              average: 0.35,
              range: [0.25, 0.49],
            },
            { name: "baseWin_05_1", probability: 0.04, average: 0.6, range: [0.5, 0.99] },
            { name: "baseWin_1_15", probability: 0.055, average: 1.2, range: [1, 1.49] },
            {
              name: "baseWin_15_2",
              probability: 0.025,
              average: 1.65,
              range: [1.5, 1.99],
            },
            { name: "baseWin_2_5", probability: 0.035, average: 3.5, range: [2, 4.99] },
            { name: "baseWin_5_10", probability: 0.03, average: 7.5, range: [5, 9.99] },
            {
              name: "baseWin_10_25",
              probability: 0.0115,
              average: 18,
              range: [10, 24.99],
            },
            {
              name: "baseWin_25_50",
              probability: 0.0028,
              average: 35,
              range: [25, 49.99],
            },
            {
              name: "baseWin_50_100",
              probability: 0.0008,
              average: 70,
              range: [50, 99.99],
            },
            {
              name: "baseWin_100_plus",
              probability: 0.00064,
              average: 175,
              range: [100, 1999.99],
            },
          ]
        : [
            {
              name: "baseWin_under_025",
              probability: 0.015,
              average: SMALL_WIN_AVERAGE,
              range: [0.01, 0.24],
            },
            {
              name: "baseWin_025_05",
              probability: 0.02,
              average: 0.35,
              range: [0.25, 0.49],
            },
            {
              name: "baseWin_05_1",
              probability: 0.025,
              average: 0.7,
              range: [0.5, 0.99],
            },
            { name: "baseWin_1_2", probability: 0.052, average: 1.5, range: [1, 1.99] },
            { name: "baseWin_2_3", probability: 0.038, average: 2.4, range: [2, 2.99] },
            { name: "baseWin_3_5", probability: 0.025, average: 3.6, range: [3, 4.99] },
            { name: "baseWin_5_10", probability: 0.06, average: 7, range: [5, 9.99] },
            {
              name: "baseWin_10_25",
              probability: 0.028,
              average: 18,
              range: [10, 24.99],
            },
            {
              name: "baseWin_25_50",
              probability: 0.006,
              average: 35,
              range: [25, 49.99],
            },
            {
              name: "baseWin_50_100",
              probability: 0.0022,
              average: 70,
              range: [50, 99.99],
            },
            {
              name: "baseWin_100_plus",
              probability: 0.0013,
              average: 175,
              range: [100, 1999.99],
            },
          ]
    // Fund stronger bonuses by moving some 5x+ ordinary wins into the 2-5x /
    // 3-5x recovery band. Below-cost odds and the overall hit rate stay fixed.
    const balanced = balanceOrdinaryWins(
      baseWin,
      shape,
      mode === "extraChance" ? "baseWin_2_5" : "baseWin_3_5",
    )
    result = [
      ...buckets.filter((bucket) => bucket !== baseWin),
      ...balanced.map((bucket) => ({
        ...baseWin,
        ...bucket,
        criteria: baseWin.criteria,
      })),
    ]
  } else if (boughtTier) {
    result = buckets
  } else if (mode === "featureSpin") {
    result = buckets
  } else {
    // All triggered bonuses recover the extra-chance cost. Zero-pay frequency
    // stays fixed, so only the ordinary wins need splitting.
    result = buckets.flatMap((bucket) =>
      bucket.name === "baseWin"
        ? splitAtCost(bucket, cost, belowTarget - (1 - HIT_TARGETS[mode]), cost * 0.6)
        : [bucket],
    )
  }
  validateBuckets(mode, result)
  const actualBelow = result
    .filter((bucket) => bucket.range[1] < cost)
    .reduce((sum, bucket) => sum + bucket.probability, 0)
  if (
    result.some((bucket) => bucket.range[0] < cost && bucket.range[1] >= cost) ||
    Math.abs(actualBelow - belowTarget) > 1e-10
  )
    throw new Error(mode + ": inconsistent below-cost probability budget")
  return result
}

/** Accept both historical coarse simulation criteria and the explicit payout
 * band criteria used by new simulations. Ranges still partition every book. */
export function optimizationBuckets(mode: ModeName): OptimizationBucket[] {
  return buildOptimizationBuckets(mode).map((bucket) => ({
    ...bucket,
    criteria: [...new Set([...bucket.criteria, bucket.name])],
  }))
}

export function optimizationTargets(mode: ModeName): Record<string, OptimizationTarget> {
  const buckets = optimizationBuckets(mode)
  validateBuckets(mode, buckets)
  return Object.fromEntries(
    buckets.map((b) => [
      b.name,
      {
        match: { criteria: b.criteria, winRange: b.range },
        hitRate: 1 / b.probability,
        avgWin: b.average,
      },
    ]),
  )
}
