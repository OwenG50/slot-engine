import { OptimizationTarget } from "@slot-engine/optimizer"
import {
  BONUS_TARGETS,
  DESIGN,
  FEATURE_SPIN_UPGRADE_COUNT_PROBABILITIES,
  MODES,
} from "./settings"
import { BoardProfile } from "./reels"
import { BonusTier, MAX_WIN, ModeName } from "./types"

export interface MathBucket {
  name: string
  probability: number
  average: number
  range: [number, number]
  tier?: BonusTier
  profile?: BoardProfile
  startingUpgradeCount?: number
}

export const HIT_TARGETS: Record<ModeName, number> = {
  base: 0.2,
  extraChance: 0.25,
  extraChance2: 0.25,
  featureSpin: 0.8,
  bonusFeature: 1,
  superBonusFeature: 1,
  hiddenBonusFeature: 1,
}

export function bonusAverage(mode: ModeName, tier: BonusTier) {
  if (mode === "extraChance") return { normal: 92, super: 280, hidden: 940 }[tier]
  if (mode === "extraChance2") return { normal: 90, super: 276, hidden: 930 }[tier]
  return BONUS_TARGETS[tier].average
}

export function bonusMinimum(mode: ModeName, tier: BonusTier) {
  if (mode === "extraChance") return { normal: 12, super: 65, hidden: 800 }[tier]
  if (mode === "extraChance2") return { normal: 12, super: 65, hidden: 800 }[tier]
  return BONUS_TARGETS[tier].minimum
}

// Purchased modes spend the same 0.2% RTP share on the exact 10,000x max win.
// Triggered tiers use the corresponding buy's conditional max probability.
const PURCHASED_MODE_MAX_RTP_SHARE = 0.002
function purchasedModeMaxProbability(mode: ModeName) {
  return (PURCHASED_MODE_MAX_RTP_SHARE * MODES[mode].cost) / MAX_WIN
}

function tierBuckets(
  mode: ModeName,
  tier: BonusTier,
  probability: number,
  average: number,
): MathBucket[] {
  const minimum = bonusMinimum(mode, tier)
  // Candidate coverage around the bonus mean; optimizationBuckets sets final
  // below-cost probabilities for buys without changing these simulation quotas.
  // Every hidden needs a wider central band: its 800x floor sits close to
  // its 930-960x mean, so it needs more coverage of the lower payouts.
  const hidden = tier === "hidden"
  const lowP = hidden ? 0.3 : 0.2
  const centerP = hidden ? 0.5 : 0.65
  const split = hidden ? minimum + 80 : average * 0.6
  const upperCenter = hidden ? average + 140 : average * 1.4
  const lowMean = hidden ? minimum + 35 : Math.max(minimum + 1, average * 0.4)
  const centerMean = hidden ? average - 15 : average * 0.95
  const maxProbability = purchasedModeMaxProbability(
    { normal: "bonusFeature", super: "superBonusFeature", hidden: "hiddenBonusFeature" }[
      tier
    ] as ModeName,
  )
  const tails =
    tier === "normal"
      ? [
          {
            name: "tail",
            probability: 0.00035,
            average: 2500,
            range: [2000, 4999.99],
          },
          {
            name: "large",
            probability: 0.00017,
            average: 6000,
            range: [5000, 9999.99],
          },
          {
            name: "max",
            probability: maxProbability,
            average: MAX_WIN,
            range: [MAX_WIN, MAX_WIN],
          },
        ]
      : tier === "super"
        ? [
            {
              name: "tail",
              probability: 0.001,
              average: 2500,
              range: [2000, 4999.99],
            },
            {
              name: "large",
              probability: 0.00018,
              average: 6000,
              range: [5000, 9999.99],
            },
            {
              name: "max",
              probability: maxProbability,
              average: MAX_WIN,
              range: [MAX_WIN, MAX_WIN],
            },
          ]
        : [
            { name: "large", probability: 0.0009, average: 6000, range: [5000, 9999.99] },
            {
              name: "max",
              probability: maxProbability,
              average: MAX_WIN,
              range: [MAX_WIN, MAX_WIN],
            },
          ]
  const tailP = tails.reduce((sum, b) => sum + b.probability, 0)
  const tailEV = tails.reduce((sum, b) => sum + b.probability * b.average, 0)
  const highP = 1 - lowP - centerP - tailP
  const highMean = (average - lowP * lowMean - centerP * centerMean - tailEV) / highP
  const local: MathBucket[] = [
    {
      name: "low",
      probability: lowP,
      average: lowMean,
      range: [minimum, Math.round(split * 100 - 1) / 100],
    },
    ...(centerP
      ? [
          {
            name: "center",
            probability: centerP,
            average: centerMean,
            range: [split, Math.round(upperCenter * 100 - 1) / 100] as [number, number],
          },
        ]
      : []),
    {
      name: "high",
      probability: highP,
      average: highMean,
      range: [upperCenter, tier === "hidden" ? 4999.99 : 1999.99],
    },
    ...tails.map((b) => ({
      ...b,
      range: b.range as [number, number],
      profile: "tail" as const,
    })),
  ]
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
    const maxProbability = purchasedModeMaxProbability(mode)
    const fourUpgradeProbability = FEATURE_SPIN_UPGRADE_COUNT_PROBABILITIES[4]
    const regularFourProbability = fourUpgradeProbability - maxProbability
    const regularFourAverage =
      (fourUpgradeProbability * 240 - maxProbability * MAX_WIN) / regularFourProbability
    return [
      {
        name: "feature_1_loss",
        probability: 1 - HIT_TARGETS[mode],
        average: 0,
        range: [0, 0],
        startingUpgradeCount: 1,
      },
      {
        name: "feature_1_win",
        probability:
          FEATURE_SPIN_UPGRADE_COUNT_PROBABILITIES[1] - (1 - HIT_TARGETS[mode]),
        average: 30,
        range: [0.01, 199.99],
        startingUpgradeCount: 1,
      },
      {
        name: "feature_2_win",
        probability: FEATURE_SPIN_UPGRADE_COUNT_PROBABILITIES[2],
        average: 60,
        range: [0.01, 499.99],
        startingUpgradeCount: 2,
      },
      {
        name: "feature_3_win",
        probability: FEATURE_SPIN_UPGRADE_COUNT_PROBABILITIES[3],
        average: 120,
        range: [0.01, 1999.99],
        startingUpgradeCount: 3,
      },
      {
        name: "feature_4_win",
        probability: regularFourProbability,
        average: regularFourAverage,
        // Keep four-upgrade candidates within the populated recovery bands.
        range: [50, 9999.99],
        startingUpgradeCount: 4,
      },
      {
        name: "feature_4_max",
        probability: maxProbability,
        average: MAX_WIN,
        range: [MAX_WIN, MAX_WIN],
        startingUpgradeCount: 4,
      },
    ]
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
  featureSpin: 0.8,
  bonusFeature: 0.75,
  superBonusFeature: 0.8,
  hiddenBonusFeature: 0.8,
}

export interface OptimizationBucket extends MathBucket {
  criteria: string[]
}

type OptimizationBand = Pick<
  OptimizationBucket,
  "name" | "probability" | "average" | "range"
>

// Half the conditional probability lies at or below these round-payout cuts.
// Base and buys share median cuts; Extra Chance cuts remain slightly lower.
export const BONUS_MEDIAN_TARGETS = { normal: 74.8, super: 256.5, hidden: 900 } as const
export const EXTRA_CHANCE_MEDIAN_TARGETS = {
  extraChance: { normal: 72.5, super: 254, hidden: 885 },
  extraChance2: { normal: 70, super: 252, hidden: 875 },
} as const

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

/** A shared conditional distribution for each tier, regardless of entry route.
 * Explicit reporting-band splits prevent candidate pools from drifting apart.
 * Extra Chance funds slightly lower means inside those same probability bands. */
function shapeTierBuckets(
  mode: ModeName,
  buckets: OptimizationBucket[],
  tier: BonusTier,
): OptimizationBucket[] {
  const candidates = buckets.filter((b) => b.tier === tier)
  if (!candidates.length) return buckets
  const tierProbability = candidates.reduce((sum, b) => sum + b.probability, 0)
  const expectedPayout =
    candidates.reduce((sum, b) => sum + b.probability * b.average, 0) / tierProbability
  const extra = mode === "extraChance" || mode === "extraChance2"
  const extraIndex = mode === "extraChance" ? 1 : mode === "extraChance2" ? 2 : 0
  const median = extra
    ? EXTRA_CHANCE_MEDIAN_TARGETS[mode][tier]
    : BONUS_MEDIAN_TARGETS[tier]
  const fixed: OptimizationBand[] =
    tier === "normal"
      ? [
          {
            name: "under_25",
            probability: 0.0065,
            average: 21,
            range: [bonusMinimum(mode, tier), 24.99],
          },
          {
            name: "25_50",
            probability: 0.0585,
            average: (0.065 * 32 - 0.0065 * 21) / 0.0585,
            range: [25, 49.99],
          },
          {
            name: "50_median",
            probability: 0.435,
            average: 65 - 2 * extraIndex,
            range: [50, median],
          },
          {
            name: "median_100",
            probability: 0.25,
            average: 84 - extraIndex,
            range: [median + 0.01, 99.99],
          },
          { name: "200_250", probability: 0.008, average: 225, range: [200, 249.99] },
          { name: "250_500", probability: 0.02, average: 302, range: [250, 499.99] },
          { name: "500_1K", probability: 0.0023, average: 650, range: [500, 999.99] },
          { name: "1K_2K", probability: 0.0002, average: 1200, range: [1000, 1999.99] },
          { name: "2K_3K", probability: 0.000328, average: 2425, range: [2000, 2999.99] },
          { name: "3K_5K", probability: 0.000022, average: 3600, range: [3000, 4999.99] },
          { name: "large", probability: 0.00017, average: 6000, range: [5000, 9999.99] },
          {
            name: "max",
            probability: 0.00002,
            average: MAX_WIN,
            range: [MAX_WIN, MAX_WIN],
          },
        ]
      : tier === "super"
        ? [
            {
              name: "under_100",
              probability: 0.0013,
              average: 93,
              range: [bonusMinimum(mode, tier), 99.99],
            },
            {
              name: "100_200",
              probability: 0.0987,
              average: (16 - 0.0013 * 93) / 0.0987,
              range: [100, 199.99],
            },
            {
              name: "200_250",
              probability: 0.315,
              average: 230 - 2 * extraIndex,
              range: [200, 249.99],
            },
            {
              name: "250_median",
              probability: 0.085,
              average: 253 - extraIndex,
              range: [250, median],
            },
            {
              name: "median_300",
              probability: 0.3,
              average: 270 - 2 * extraIndex,
              range: [median + 0.01, 299.99],
            },
            { name: "500_1K", probability: 0.043, average: 600, range: [500, 999.99] },
            { name: "1K_2K", probability: 0.0065, average: 1250, range: [1000, 1999.99] },
            {
              name: "2K_3K",
              probability: 0.000938,
              average: 2425,
              range: [2000, 2999.99],
            },
            {
              name: "3K_5K",
              probability: 0.000062,
              average: 3600,
              range: [3000, 4999.99],
            },
            {
              name: "large",
              probability: 0.00018,
              average: 6000,
              range: [5000, 9999.99],
            },
            {
              name: "max",
              probability: 0.00006,
              average: MAX_WIN,
              range: [MAX_WIN, MAX_WIN],
            },
          ]
        : [
            {
              name: "below_median",
              probability: 0.5,
              average: extra ? (mode === "extraChance" ? 840 : 830) : 855,
              range: [bonusMinimum(mode, tier), median],
            },
            {
              name: "median_1K",
              probability: 0.3,
              average: extra ? (mode === "extraChance" ? 930 : 920) : 945,
              range: [median + 0.01, 999.99],
            },
            { name: "1500_2K", probability: 0.01, average: 1700, range: [1500, 1999.99] },
            { name: "2K_3K", probability: 0.006, average: 2300, range: [2000, 2999.99] },
            { name: "3K_5K", probability: 0.0052, average: 3400, range: [3000, 4999.99] },
            { name: "large", probability: 0.0009, average: 6000, range: [5000, 9999.99] },
            {
              name: "max",
              probability: 0.0002,
              average: MAX_WIN,
              range: [MAX_WIN, MAX_WIN],
            },
          ]
  const [name, range] =
    tier === "normal"
      ? ["100_200", [100, 199.99] as [number, number]]
      : tier === "super"
        ? ["300_500", [300, 499.99] as [number, number]]
        : ["1K_1500", [1000, 1499.99] as [number, number]]
  const bands = [...fixed, remainingBand(name, range, 1, expectedPayout, fixed)]
  const criteria = candidates.flatMap((b) => b.criteria)
  return [
    ...buckets.filter((b) => !candidates.includes(b)),
    ...bands.map((b) => ({
      ...b,
      name: tier + "_" + b.name,
      tier,
      criteria,
      probability: b.probability * tierProbability,
    })),
  ]
}

function shapeBonusBuckets(mode: ModeName, buckets: OptimizationBucket[]) {
  return (["normal", "super", "hidden"] as const).reduce(
    (result, tier) => shapeTierBuckets(mode, result, tier),
    buckets,
  )
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
export function optimizationBuckets(mode: ModeName): OptimizationBucket[] {
  const buckets = shapeBonusBuckets(
    mode,
    mathBuckets(mode).map((bucket) => ({
      ...bucket,
      criteria: [bucket.name],
    })),
  )
  if (mode === "base") {
    const baseWin = buckets.find((bucket) => bucket.name === "baseWin")!
    const fixedBands = [
      { name: "baseWin_under_025", probability: 0.04, average: 0.2, range: [0.01, 0.24] },
      { name: "baseWin_025_05", probability: 0.03, average: 0.35, range: [0.25, 0.49] },
      { name: "baseWin_05_1", probability: 0.02, average: 0.7, range: [0.5, 0.99] },
      { name: "baseWin_2_5", probability: 0.024, average: 2.8, range: [2, 4.99] },
      { name: "baseWin_5_10", probability: 0.006, average: 6, range: [5, 9.99] },
      { name: "baseWin_10_20", probability: 0.004, average: 12, range: [10, 19.99] },
      { name: "baseWin_20_50", probability: 0.003, average: 26, range: [20, 49.99] },
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
        average: 200,
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
              average: 0.2,
              range: [0.01, 0.24],
            },
            {
              name: "baseWin_025_05",
              probability: 0.03,
              average: 0.35,
              range: [0.25, 0.49],
            },
            { name: "baseWin_05_1", probability: 0.04, average: 0.7, range: [0.5, 0.99] },
            { name: "baseWin_1_15", probability: 0.055, average: 1.2, range: [1, 1.49] },
            {
              name: "baseWin_15_2",
              probability: 0.025,
              average: 1.8,
              range: [1.5, 1.99],
            },
            { name: "baseWin_2_5", probability: 0.035, average: 3.5, range: [2, 4.99] },
            { name: "baseWin_5_10", probability: 0.02, average: 7.5, range: [5, 9.99] },
            {
              name: "baseWin_10_25",
              probability: 0.008,
              average: 18,
              range: [10, 24.99],
            },
            {
              name: "baseWin_25_50",
              probability: 0.0032,
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
              average: 0.2,
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
            { name: "baseWin_1_2", probability: 0.045, average: 1.5, range: [1, 1.99] },
            { name: "baseWin_2_3", probability: 0.045, average: 2.4, range: [2, 2.99] },
            { name: "baseWin_3_5", probability: 0.025, average: 4, range: [3, 4.99] },
            { name: "baseWin_5_10", probability: 0.025, average: 7, range: [5, 9.99] },
            {
              name: "baseWin_10_25",
              probability: 0.018,
              average: 18,
              range: [10, 24.99],
            },
            {
              name: "baseWin_25_50",
              probability: 0.008,
              average: 35,
              range: [25, 49.99],
            },
            {
              name: "baseWin_50_100",
              probability: 0.003,
              average: 70,
              range: [50, 99.99],
            },
            {
              name: "baseWin_100_plus",
              probability: 0.0026,
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
    // Preserve the 70/15/10/5 upgrade mix and each count's exact payout
    // budget, while making the combined raw-payout curve rise toward its
    // 10x-50x center and then fall smoothly through a populated upper tail.
    const featureBands: Record<number, OptimizationBand[]> = {
      1: [
        {
          name: "feature_1_under_025",
          probability: 0.005,
          average: 0.2,
          range: [0.01, 0.24],
        },
        {
          name: "feature_1_025_05",
          probability: 0.01,
          average: 0.35,
          range: [0.25, 0.49],
        },
        { name: "feature_1_05_1", probability: 0.015, average: 0.7, range: [0.5, 0.99] },
        { name: "feature_1_1_2", probability: 0.025, average: 1.5, range: [1, 1.99] },
        { name: "feature_1_2_5", probability: 0.05, average: 3.5, range: [2, 4.99] },
        { name: "feature_1_5_10", probability: 0.08, average: 7, range: [5, 9.99] },
        { name: "feature_1_10_25", probability: 0.15, average: 20, range: [10, 24.99] },
        { name: "feature_1_25_50", probability: 0.085, average: 40, range: [25, 49.99] },
        { name: "feature_1_50_100", probability: 0.06, average: 80, range: [50, 99.99] },
        {
          name: "feature_1_100_plus",
          probability: 0.02,
          average: 150.625,
          range: [100, 199.99],
        },
      ],
      2: [
        { name: "feature_2_2_5", probability: 0.005, average: 3.5, range: [0.01, 4.99] },
        { name: "feature_2_5_10", probability: 0.015, average: 7, range: [5, 9.99] },
        { name: "feature_2_10_25", probability: 0.035, average: 17, range: [10, 24.99] },
        { name: "feature_2_25_50", probability: 0.05, average: 35, range: [25, 49.99] },
        { name: "feature_2_50_100", probability: 0.025, average: 70, range: [50, 99.99] },
        {
          name: "feature_2_100_250",
          probability: 0.0195,
          average: 236.28205128205127,
          range: [100, 249.99],
        },
        {
          name: "feature_2_250_500",
          probability: 0.0005,
          average: 350,
          range: [250, 499.99],
        },
      ],
      3: [
        { name: "feature_3_5_10", probability: 0.005, average: 7, range: [0.01, 9.99] },
        { name: "feature_3_10_25", probability: 0.02, average: 17, range: [10, 24.99] },
        {
          name: "feature_3_25_50",
          // Absorb the former four-upgrade below-cost mass while preserving
          // the overall below-cost rate and this count's probability budget.
          probability: 0.05,
          average: 35,
          range: [25, 49.99],
        },
        {
          name: "feature_3_50_100",
          probability: 0.00795,
          average: (0.04995 * 35 + 0.008 * 70 - 0.05 * 35) / 0.00795,
          range: [50, 99.99],
        },
        {
          name: "feature_3_100_250",
          probability: 0.007,
          average: 160,
          range: [100, 249.99],
        },
        {
          name: "feature_3_250_500",
          probability: 0.004,
          average: 350,
          range: [250, 499.99],
        },
        {
          name: "feature_3_500_1K",
          probability: 0.003,
          average: 700,
          range: [500, 999.99],
        },
        {
          name: "feature_3_1K_plus",
          probability: 0.00305,
          average: 1539.918032786885,
          range: [1000, 1999.99],
        },
      ],
      4: [
        {
          // Retain the former 25-50 allocation, but use an interior mean:
          // actual 50-100 books can start at 57.5x rather than exactly 50x.
          name: "feature_4_50_100",
          probability: 0.00505,
          average: 75,
          range: [50, 99.99],
        },
        {
          name: "feature_4_100_250",
          probability: 0.025,
          // These two bands retain their combined 3.167x payout contribution.
          average: (3.167 - 0.00505 * 75) / 0.025,
          range: [100, 249.99],
        },
        {
          name: "feature_4_250_500",
          probability: 0.015,
          average: 270,
          range: [250, 499.99],
        },
        {
          name: "feature_4_500_1K",
          probability: 0.0035,
          average: 520,
          range: [500, 999.99],
        },
        {
          name: "feature_4_1K_3K",
          probability: 0.001,
          average: 1100,
          range: [1000, 2999.99],
        },
        {
          name: "feature_4_3K_5K",
          probability: 0.00025,
          average: 3100,
          range: [3000, 4999.99],
        },
        {
          name: "feature_4_5K_10K",
          probability: 0.00019,
          average: 5200,
          range: [5000, 9999.99],
        },
      ],
    }
    result = buckets.flatMap((bucket) => {
      if (!bucket.name.endsWith("_win")) return [bucket]
      return featureBands[bucket.startingUpgradeCount!].map((band) => ({
        ...bucket,
        ...band,
        criteria: bucket.criteria,
      }))
    })
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
        scale:
          b.average > 0 && b.range[0] !== b.range[1]
            ? [
                {
                  winRange: [
                    Math.max(b.range[0], b.average * 0.8),
                    Math.min(b.range[1], b.average * 1.2),
                  ] as [number, number],
                  factor: 8,
                },
              ]
            : undefined,
      },
    ]),
  )
}
