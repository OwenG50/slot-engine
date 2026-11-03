import { OptimizationTarget } from "@slot-engine/optimizer"
import {
  BONUS_BUY_MINIMUMS,
  BONUS_TARGETS,
  DESIGN,
  FEATURE_SPIN_COUNT_LIMITS,
  FEATURE_SPIN_COUNT_TILT,
  FEATURE_SPIN_MAX_WIN_ONE_IN,
  FEATURE_SPIN_UPGRADE_COUNT_PROBABILITIES,
  MODES,
  NATURAL_BONUS_AVERAGES,
  NATURAL_MAX_WIN_ONE_IN,
} from "./settings"
import { naturalBonusDistribution, purchasedBonusDistribution } from "./bonusDistribution"
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
  extraChance: MODES.extraChance.hitRate,
  extraChance2: MODES.extraChance2.hitRate,
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
        naturalBonusDistribution(
          tier,
          bonusMinimum(mode, tier),
          bonusAverage(mode, tier),
        ).at(-1)!.probability,
    0,
  )
  return 1 / NATURAL_MAX_WIN_ONE_IN[natural] / unscaled
}

/** Conditional round-payout curve for one tier. Buys use single-peaked charts
 * with low floors; natural entries use the spread reference fit. */
export function bonusDistribution(
  mode: ModeName,
  tier: BonusTier,
  average = bonusAverage(mode, tier),
) {
  return MODES[mode].boughtTier
    ? purchasedBonusDistribution(tier, bonusMinimum(mode, tier), average)
    : naturalBonusDistribution(
        tier,
        bonusMinimum(mode, tier),
        average,
        naturalMaxWinScale(mode),
      )
}

/** Bonus bands whose top is at most this share of their tier's average payout
 * simulate free spins on the lighter "free_light" strip. */
export const LIGHT_BAND_SHARE = 0.5

function tierBuckets(
  mode: ModeName,
  tier: BonusTier,
  probability: number,
  average: number,
): MathBucket[] {
  return bonusDistribution(mode, tier, average).map((b) => ({
    ...b,
    name: tier + "_" + b.name,
    tier,
    // Reel focus helps the simulator reach rare 2,000x+ round totals; lighter
    // free-spin strips make low bands (top at most half the tier average) cheap
    // to reach instead of rejecting hundreds of richer bonuses per book.
    profile:
      b.range[0] >= 2000 && b.range[0] < MAX_WIN
        ? ("tail" as const)
        : b.range[1] <= average * LIGHT_BAND_SHARE
          ? ("light" as const)
          : undefined,
    probability: b.probability * probability,
  }))
}

// ButchEm's only sub-0.25x pay is exactly 0.2x, so that band's mean is 0.2x.
const SMALL_WIN_AVERAGE = 0.2

/** The single-spin feature curve: one disjoint payout chart for the whole mode.
 * The 100-250x band balances the payout budget. */
function featureSpinCurve(): MathBucket[] {
  const expected = DESIGN.rtp * MODES.featureSpin.cost
  const maxProbability = 1 / FEATURE_SPIN_MAX_WIN_ONE_IN
  const fixed: MathBucket[] = [
    { name: "loss", probability: 1 - HIT_TARGETS.featureSpin, average: 0, range: [0, 0] },
    {
      name: "under_025",
      probability: 0.001,
      average: SMALL_WIN_AVERAGE,
      range: [0.01, 0.24],
    },
    { name: "025_05", probability: 0.002, average: 0.35, range: [0.25, 0.49] },
    { name: "05_1", probability: 0.003, average: 0.7, range: [0.5, 0.99] },
    { name: "1_2", probability: 0.018, average: 1.5, range: [1, 1.99] },
    { name: "2_5", probability: 0.18, average: 3.5, range: [2, 4.99] },
    { name: "5_10", probability: 0.21, average: 7, range: [5, 9.99] },
    { name: "10_20", probability: 0.14, average: 13.5, range: [10, 19.99] },
    // 20-50x is kept thin so the budget moves into the 250x+ tail.
    { name: "20_25", probability: 0.02, average: 22, range: [20, 24.99] },
    { name: "25_50", probability: 0.055, average: 35, range: [25, 49.99] },
    { name: "50_100", probability: 0.05, average: 70, range: [50, 99.99] },
    { name: "250_500", probability: 0.026, average: 350, range: [250, 499.99] },
    { name: "500_1K", probability: 0.0155, average: 700, range: [500, 999.99] },
    { name: "1K_2K", probability: 0.0045, average: 1400, range: [1000, 1999.99] },
    { name: "2K_3K", probability: 0.0009, average: 2400, range: [2000, 2999.99] },
    { name: "3K_5K", probability: 0.0004, average: 3600, range: [3000, 4999.99] },
    {
      name: "5K_10K",
      probability: 0.00018 - maxProbability,
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
  const balancing = remainingBand("100_250", [100, 249.99], 1, expected, fixed)
  const index = fixed.findIndex((b) => b.range[0] >= 250)
  return [...fixed.slice(0, index), balancing, ...fixed.slice(index)]
}

/** Split each feature-curve band across starting-upgrade counts. Iterative
 * proportional fitting keeps both the 70/15/10/5 count mix and every band's
 * probability exact; the payout tilt makes extra upgrades usually pay more,
 * while every count still shares the bands it can reach. */
export function featureSpinCells() {
  const curve = featureSpinCurve()
  const counts = [1, 2, 3, 4] as const
  const allowed = (count: (typeof counts)[number], band: MathBucket) => {
    if (band.range[1] === 0) return count === 1
    if (band.range[0] === MAX_WIN) return count === 4
    const limit = FEATURE_SPIN_COUNT_LIMITS[count]
    return band.range[0] >= limit.min && band.range[1] <= limit.max
  }
  const kernel = counts.map((count) =>
    curve.map((band) =>
      allowed(count, band)
        ? Math.exp(
            FEATURE_SPIN_COUNT_TILT * (count - 1) * Math.log(Math.max(band.average, 1)),
          )
        : 0,
    ),
  )
  const rows = counts.map(() => 1)
  const columns = curve.map(() => 1)
  const cell = (i: number, j: number) => rows[i] * kernel[i][j] * columns[j]
  for (let iteration = 0; iteration < 5000; iteration++) {
    counts.forEach((count, i) => {
      const sum = curve.reduce((s, _, j) => s + kernel[i][j] * columns[j], 0)
      rows[i] = FEATURE_SPIN_UPGRADE_COUNT_PROBABILITIES[count] / sum
    })
    curve.forEach((band, j) => {
      const sum = counts.reduce((s, _, i) => s + rows[i] * kernel[i][j], 0)
      columns[j] = band.probability / sum
    })
  }
  const cells = counts.flatMap((count, i) =>
    curve.flatMap((band, j) =>
      kernel[i][j] > 0
        ? [
            {
              ...band,
              name: `feature_${count}_${band.name}`,
              probability: cell(i, j),
              startingUpgradeCount: count,
              profile:
                band.range[0] >= 2000 && band.range[0] < MAX_WIN
                  ? ("tail" as const)
                  : undefined,
            },
          ]
        : [],
    ),
  )
  for (const count of counts) {
    const total = cells
      .filter((c) => c.startingUpgradeCount === count)
      .reduce((s, c) => s + c.probability, 0)
    if (Math.abs(total - FEATURE_SPIN_UPGRADE_COUNT_PROBABILITIES[count]) > 1e-12)
      throw new Error("FeatureSpin upgrade-count split did not converge")
  }
  return cells
}

export function mathBuckets(mode: ModeName): MathBucket[] {
  const settings = MODES[mode]
  const expected = DESIGN.rtp * settings.cost
  if (settings.boughtTier) return tierBuckets(mode, settings.boughtTier, 1, expected)
  if (mode === "featureSpin") {
    const buckets = featureSpinCells()
    validateBuckets(mode, buckets)
    return buckets
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
 * Buys and featureSpin take theirs from the payout curves. */
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
): MathBucket {
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
 * preserving nonzero hits, below-cost odds and the available ordinary-win EV.
 * Pinned bands retain their probability and mean instead of sharing the transfer. */
function balanceOrdinaryWins(
  baseWin: OptimizationBucket,
  shape: OptimizationBand[],
  recoveryName: string,
  pinnedNames: string[] = [],
): OptimizationBucket[] {
  const recovery = shape.find((b) => b.name === recoveryName)!
  const lower = shape.filter(
    (b) => b.range[1] < recovery.range[0] || pinnedNames.includes(b.name),
  )
  const upper = shape.filter(
    (b) => b.range[0] > recovery.range[1] && !pinnedNames.includes(b.name),
  )
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

/** Extra simulation-only coverage for rare 20x+ ordinary wins. Its books join
 * the ordinary-win targets; it carries no probability of its own. */
export const BIG_ORDINARY_WIN_COVERAGE: MathBucket = {
  name: "baseWin_big",
  probability: 0,
  average: 0,
  range: [20, 1999.99],
  profile: "tail",
}

/** Simulation buckets provide coverage; these groups set final player odds.
 * Range matchers let existing books and future simulations use the same targets. */
export function optimizationBuckets(mode: ModeName): OptimizationBucket[] {
  const buckets: OptimizationBucket[] = mathBuckets(mode).map((bucket) => ({
    ...bucket,
    criteria:
      bucket.name === "baseWin"
        ? [bucket.name, BIG_ORDINARY_WIN_COVERAGE.name]
        : [bucket.name],
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
        // Ordinary base wins cap near the 200x full H1 board. Large runs also
        // produce a few 200.2-200.4x books, which a mean of exactly 200x would
        // need to exclude, so the optimizer rejects it as infeasible.
        average: 200.01,
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
  if (belowTarget === undefined) {
    validateBuckets(mode, buckets)
    return buckets
  }
  const { cost } = MODES[mode]
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
            { name: "baseWin_1_15", probability: 0.025, average: 1.2, range: [1, 1.49] },
            {
              name: "baseWin_15_2",
              probability: 0.025,
              // 1.5x is by far the most common pay here; keep the mean interior.
              average: 1.65,
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
              probability: 0.0135,
              average: 0.2,
              range: [0.01, 0.24],
            },
            {
              name: "baseWin_025_05",
              probability: 0.018,
              average: 0.35,
              range: [0.25, 0.49],
            },
            {
              name: "baseWin_05_1",
              probability: 0.0225,
              average: 0.7,
              range: [0.5, 0.99],
            },
            { name: "baseWin_1_2", probability: 0.0405, average: 1.5, range: [1, 1.99] },
            { name: "baseWin_2_3", probability: 0.0405, average: 2.4, range: [2, 2.99] },
            { name: "baseWin_3_5", probability: 0.025, average: 4, range: [3, 4.99] },
            { name: "baseWin_5_10", probability: 0.022, average: 7, range: [5, 9.99] },
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
    // Balance the ordinary payout budget while keeping ExtraChance2's 5-10x
    // probability fixed at 2.2% of plays.
    const balanced = balanceOrdinaryWins(
      baseWin,
      shape,
      mode === "extraChance" ? "baseWin_2_5" : "baseWin_3_5",
      mode === "extraChance2" ? ["baseWin_5_10"] : [],
    )
    result = [
      ...buckets.filter((bucket) => bucket !== baseWin),
      ...balanced.map((bucket) => ({
        ...baseWin,
        ...bucket,
        criteria: baseWin.criteria,
      })),
    ]
  } else {
    throw new Error(mode + ": no below-cost shaping defined")
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
