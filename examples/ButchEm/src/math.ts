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
  if (mode === "extraChance") return { normal: 60, super: 220, hidden: 1100 }[tier]
  if (mode === "extraChance2") return { normal: 45, super: 170, hidden: 1100 }[tier]
  return BONUS_TARGETS[tier].average
}

export function bonusMinimum(mode: ModeName, tier: BonusTier) {
  if (mode === "extraChance") return { normal: 12, super: 65, hidden: 800 }[tier]
  if (mode === "extraChance2") return { normal: 12, super: 65, hidden: 800 }[tier]
  return BONUS_TARGETS[tier].minimum
}

// Purchased modes spend the same 0.2% RTP share on the exact 10,000x max win.
// This makes its hit rate proportional to mode cost while triggered bonuses keep
// their established per-trigger tail shapes.
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
  // The hidden buy needs a wider central band: its 800x floor sits close to
  // the 960x mean, so the generic tier shape would bunch most results near 910x.
  const hiddenBuy = MODES[mode].boughtTier === "hidden"
  const lowP = hiddenBuy ? 0.3 : 0.2
  const centerP = hiddenBuy ? 0.5 : 0.65
  const split = hiddenBuy
    ? minimum + 80
    : tier === "hidden"
      ? Math.max(minimum + 100, average * 0.7)
      : average * 0.6
  const upperCenter = hiddenBuy
    ? average + 140
    : tier === "hidden"
      ? average * 1.2
      : average * 1.4
  const lowMean = hiddenBuy
    ? minimum + 35
    : tier === "hidden"
      ? (minimum + split) / 2
      : Math.max(minimum + 1, average * 0.4)
  const centerMean = hiddenBuy
    ? average - 15
    : tier === "hidden"
      ? average < 1500
        ? average * 0.95
        : (split + upperCenter) / 2
      : average * 0.95
  const maxProbability = MODES[mode].boughtTier
    ? purchasedModeMaxProbability(mode)
    : tier === "hidden"
      ? 0.0002
      : 0.00005
  const tails =
    tier === "normal"
      ? [
          { name: "tail", probability: 0.0003, average: 2500, range: [2000, 4999.99] },
          { name: "large", probability: 0.00015, average: 6000, range: [5000, 9999.99] },
          {
            name: "max",
            probability: maxProbability,
            average: MAX_WIN,
            range: [MAX_WIN, MAX_WIN],
          },
        ]
      : tier === "super"
        ? [
            { name: "tail", probability: 0.0008, average: 2500, range: [2000, 4999.99] },
            {
              name: "large",
              probability: 0.00015,
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
            { name: "large", probability: 0.0008, average: 6000, range: [5000, 9999.99] },
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
  hiddenBonusFeature: 0.835,
}

export interface OptimizationBucket extends MathBucket {
  criteria: string[]
}

type OptimizationBand = Pick<
  OptimizationBucket,
  "name" | "probability" | "average" | "range"
>

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
  const buckets = mathBuckets(mode).map((bucket) => ({
    ...bucket,
    criteria: [bucket.name],
  }))
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
    const fixedEV = fixedBands.reduce(
      (sum, bucket) => sum + bucket.probability * bucket.average,
      0,
    )
    const oneToTwoProbability = baseWin.probability - fixedProbability
    const oneToTwoAverage =
      (baseWin.probability * baseWin.average - fixedEV) / oneToTwoProbability
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
    const result = [...buckets.filter((bucket) => bucket !== baseWin), ...shapedBaseWins]
    validateBuckets(mode, result)
    return result
  }
  const belowTarget = BELOW_COST_TARGETS[mode]
  if (belowTarget === undefined) return buckets
  const { cost, boughtTier } = MODES[mode]
  let result: OptimizationBucket[]
  if (mode === "extraChance" || mode === "extraChance2") {
    const baseWin = buckets.find((bucket) => bucket.name === "baseWin")!
    const bands: OptimizationBand[] =
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
              average: 195.3125,
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
              average: 185.12820512820514,
              range: [100, 1999.99],
            },
          ]
    result = [
      ...buckets.filter((bucket) => bucket !== baseWin),
      ...bands.map((bucket) => ({ ...baseWin, ...bucket, criteria: baseWin.criteria })),
    ]
  } else if (boughtTier) {
    // Keep the rare tail/large/max budgets. Reshape the ordinary bonus awards
    // across their old low/center/high criteria, which straddle the buy cost.
    const regular = buckets.filter((bucket) => /_(low|center|high)$/.test(bucket.name))
    const tails = buckets.filter((bucket) => !regular.includes(bucket))
    const probability = regular.reduce((sum, bucket) => sum + bucket.probability, 0)
    const average =
      regular.reduce((sum, bucket) => sum + bucket.probability * bucket.average, 0) /
      probability
    const belowAverage = cost * { normal: 0.7, super: 0.8, hidden: 0.9 }[boughtTier]
    result = [
      ...splitAtCost(
        {
          name: boughtTier + "_regular",
          tier: boughtTier,
          criteria: regular.flatMap((bucket) => bucket.criteria),
          probability,
          average,
          range: [
            Math.min(...regular.map((bucket) => bucket.range[0])),
            Math.max(...regular.map((bucket) => bucket.range[1])),
          ],
        },
        cost,
        belowTarget,
        belowAverage,
      ),
      ...tails,
    ]
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
