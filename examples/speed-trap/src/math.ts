import { payoutBands, PayoutBand } from "./payoutShape"
import {
  BONUS_BUY_MINIMUMS,
  BONUS_MAX_EXCESS_SHARE,
  BONUS_TARGETS,
  DESIGN,
  FEATURE_SPIN_MAX_WIN_ONE_IN,
  FEATURE_TO_BONUS_TRIGGER_SCALE,
  FEATURE_TRIGGER_BONUS_MINIMUMS,
  MODES,
  NATURAL_MAX_WIN_ONE_IN,
} from "./settings"
import { BonusTier, MAX_WIN, ModeName, cents } from "./types"

export interface OptimizationBucket {
  name: string
  probability: number
  average: number
  range: [number, number]
  criteria: string[]
  tier?: BonusTier
  minimum?: number
  minNewCars?: number
}

export function bonusMinimum(mode: ModeName, tier: BonusTier) {
  if (mode === "featureSpin") return FEATURE_TRIGGER_BONUS_MINIMUMS[tier]
  return MODES[mode].boughtTier ? BONUS_BUY_MINIMUMS[tier] : BONUS_TARGETS[tier].minimum
}

export function maxWinProbability(mode: ModeName): number {
  if (mode === "base" || mode === "extraChance" || mode === "extraChance2")
    return 1 / NATURAL_MAX_WIN_ONE_IN[mode]
  if (mode === "featureSpin") return 1 / FEATURE_SPIN_MAX_WIN_ONE_IN
  const settings = MODES[mode]
  if (!settings.boughtTier)
    throw new Error(`Speed Trap bonus-buy mode ${mode} needs a bought tier`)
  const floor = BONUS_BUY_MINIMUMS[settings.boughtTier]
  return (
    (BONUS_MAX_EXCESS_SHARE * (DESIGN.rtp * settings.cost - floor)) / (MAX_WIN - floor)
  )
}

const baseBuckets: OptimizationBucket[] = [
  {
    name: "loss",
    probability: 0.8,
    average: 0,
    range: [0, 0],
    criteria: ["loss"],
  },
  {
    name: "base_001_2",
    probability: 0.13,
    average: 0.9,
    range: [0.01, 1.99],
    criteria: ["baseWin"],
  },
  {
    name: "base_2_10",
    probability: 0.045,
    average: 4.2,
    range: [2, 9.99],
    criteria: ["baseWin"],
  },
  {
    name: "base_10_100",
    probability: 0.019,
    average: 26,
    range: [10, 99.99],
    criteria: ["baseWin"],
  },
  {
    name: "base_100_2000",
    probability: 0.005,
    average: 220,
    range: [100, 1999.99],
    criteria: ["baseWin", "tail"],
  },
  {
    name: "normal_bonus",
    probability: 0.0009,
    average: 96,
    range: [16, 999.99],
    criteria: ["bonus", "normal"],
    tier: "normal",
  },
  {
    name: "super_bonus",
    probability: 0.0001,
    average: 288,
    range: [87, 2499.99],
    criteria: ["bonus", "super"],
    tier: "super",
  },
  {
    name: "hidden_bonus",
    probability: 0.00001,
    average: 1800,
    range: [1011, MAX_WIN - 0.01],
    criteria: ["bonus", "hidden"],
    tier: "hidden",
  },
  {
    name: "max_tail",
    probability: 0.000081,
    average: 7500,
    range: [5000, MAX_WIN - 0.01],
    criteria: ["max_tail"],
  },
  {
    name: "max",
    probability: 0.000009,
    average: MAX_WIN,
    range: [MAX_WIN, MAX_WIN],
    criteria: ["max"],
  },
]

function withScale(buckets: OptimizationBucket[], factor: number): OptimizationBucket[] {
  const scaled = buckets.map((bucket) =>
    bucket.tier ? { ...bucket, probability: bucket.probability * factor } : { ...bucket },
  )
  const total = scaled.reduce((sum, bucket) => sum + bucket.probability, 0)
  if (total >= 1) return scaled
  const loss = scaled.find((bucket) => bucket.name === "loss")
  if (loss) loss.probability += 1 - total
  return scaled
}

function boughtBuckets(mode: ModeName, tier: BonusTier): OptimizationBucket[] {
  const minimum = bonusMinimum(mode, tier)
  const maxProbability = maxWinProbability(mode)
  const criteria = ["bonus", tier] as string[]
  const buckets: OptimizationBucket[] = []

  let carriedProbability = 0
  const pushIfValid = (
    name: string,
    probability: number,
    average: number,
    min: number,
    max: number,
    extraCriteria: string[] = [],
  ) => {
    if (min > max) {
      carriedProbability += probability
      return
    }
    const adjustedAverage =
      average < min || average > max ? cents((min + max) / 2) : average
    buckets.push({
      name,
      probability: probability + carriedProbability,
      average: adjustedAverage,
      range: [min, max],
      criteria: [...criteria, ...extraCriteria],
      tier,
      minimum,
    })
    carriedProbability = 0
  }

  pushIfValid(`${tier}_buy_under_10`, 0.22, 5, minimum, 9.99)
  pushIfValid(`${tier}_buy_10_100`, 0.46, 38, Math.max(minimum, 10), 99.99)
  // The 1000x hidden buy needs more tail mass to fund its 960x average.
  const tailProbability = tier === "hidden" ? 0.1 : 0.059
  pushIfValid(
    `${tier}_buy_100_1000`,
    0.319 - tailProbability,
    260,
    Math.max(minimum, 100),
    999.99,
  )
  // Split the tail so high-tail sampling cannot leave 1000-2000x without low-end books.
  pushIfValid(
    `${tier}_buy_1000_2000`,
    tailProbability / 2,
    1400,
    Math.max(minimum, 1000),
    1999.99,
    ["tail"],
  )
  pushIfValid(
    `${tier}_buy_tail`,
    tailProbability / 2,
    3400,
    Math.max(minimum, 2000),
    MAX_WIN - 0.01,
    ["tail"],
  )

  buckets.push(
    {
      name: `${tier}_buy_max_tail`,
      probability: 0.001 - maxProbability + carriedProbability,
      average: 6500,
      range: [Math.max(minimum, 4000), MAX_WIN - 0.01],
      criteria: [...criteria, "max_tail"],
      tier,
      minimum,
    },
    {
      name: `${tier}_buy_max`,
      probability: maxProbability,
      average: MAX_WIN,
      range: [MAX_WIN, MAX_WIN],
      criteria: [...criteria, "max"],
      tier,
      minimum,
    },
  )

  return buckets
}

export function simulationBuckets(mode: ModeName): OptimizationBucket[] {
  const boughtTier = MODES[mode].boughtTier
  if (boughtTier) return boughtBuckets(mode, boughtTier)
  if (mode === "featureSpin") {
    const buckets = withScale(baseBuckets, FEATURE_TO_BONUS_TRIGGER_SCALE).map(
      (bucket) => ({ ...bucket }),
    )
    const baseWin = buckets.find((bucket) => bucket.name === "base_10_100")
    if (baseWin) {
      baseWin.probability += 0.02
      baseWin.average = 40
    }
    const medium = buckets.find((bucket) => bucket.name === "base_100_2000")
    if (medium) {
      medium.probability += 0.01
      medium.average = 300
    }
    const tiered = buckets.map((bucket) => {
      if (!bucket.tier) return bucket
      return {
        ...bucket,
        minimum: FEATURE_TRIGGER_BONUS_MINIMUMS[bucket.tier],
        range: [FEATURE_TRIGGER_BONUS_MINIMUMS[bucket.tier], MAX_WIN - 0.01] as [
          number,
          number,
        ],
      }
    })
    tiered.push({
      name: "feature_eight_cars",
      probability: 0,
      average: 1000,
      range: [0, MAX_WIN],
      criteria: ["baseWin"],
      minNewCars: 8,
    })
    const total = tiered.reduce((sum, bucket) => sum + bucket.probability, 0)
    const loss = tiered.find((bucket) => bucket.name === "loss")
    if (loss && total !== 1) loss.probability += 1 - total
    return tiered
  }

  const scaled =
    mode === "extraChance"
      ? withScale(baseBuckets, 2)
      : mode === "extraChance2"
        ? withScale(baseBuckets, 5)
        : baseBuckets
  const result = scaled.map((bucket) =>
    bucket.tier ? { ...bucket, minimum: bonusMinimum(mode, bucket.tier) } : { ...bucket },
  )
  const total = result.reduce((sum, bucket) => sum + bucket.probability, 0)
  const loss = result.find((bucket) => bucket.name === "loss")
  if (loss && total !== 1) loss.probability += 1 - total
  return result
}

export function bonusProbability(mode: ModeName, tier: BonusTier) {
  const factor = mode === "featureSpin"
    ? FEATURE_TO_BONUS_TRIGGER_SCALE
    : MODES[mode].bonusFrequencyMultiplier
  return factor / BONUS_TARGETS[tier].oneIn
}

export function optimizationBuckets(mode: ModeName): Array<PayoutBand & {
  criteria: string[]
  tier?: BonusTier
}> {
  const bands = payoutBands(mode, maxWinProbability(mode))
  const boughtTier = MODES[mode].boughtTier
  if (boughtTier)
    return bands.map((band) => ({
      ...band,
      criteria: [band.name, ...simulationBuckets(mode).map((bucket) => bucket.name)],
      tier: boughtTier,
    }))

  const maxTier: BonusTier = mode === "featureSpin" ? "normal" : "hidden"
  const ordinary = bands.filter((band) => band.name !== "max")
    .map((band) => ({ ...band, criteria: [band.name] }))
  const max = bands.find((band) => band.name === "max")!
  const result: Array<PayoutBand & { criteria: string[]; tier?: BonusTier }> = [
    { ...max, criteria: ["max"], tier: maxTier },
  ]
  // Partition each reference band by entry tier, preserving its total mass and mean.
  for (const tier of ["hidden", "super", "normal"] as const) {
    const required = bonusProbability(mode, tier) -
      (tier === maxTier ? max.probability : 0)
    const minimum = bonusMinimum(mode, tier)
    const eligible = ordinary.filter((band) => band.average > minimum)
      .sort((a, b) => b.range[0] - a.range[0])
    const available = eligible.reduce((sum, band) => sum + band.probability, 0)
    if (required <= 0 || required >= available)
      throw new Error(`${mode}: insufficient reference payout mass for ${tier} entry odds`)
    let remaining = required
    for (const band of eligible) {
      const probability = mode === "featureSpin"
        ? required * band.probability / available
        : Math.min(remaining, band.probability)
      if (probability <= 0) continue
      const name = `${tier}_${band.name}`
      result.push({
        ...band, name, probability, criteria: [name], tier,
        range: [Math.max(minimum, band.range[0]), band.range[1]],
      })
      band.probability -= probability
      remaining -= probability
    }
  }
  return [...ordinary, ...result].filter((band) => band.probability > 0).map((band) => ({
    ...band,
    criteria: [...new Set([
      ...band.criteria,
      ...simulationBuckets(mode).filter((bucket) => {
        const tier = bucket.tier ??
          (bucket.name === "max" ? maxTier : bucket.name === "max_tail" ? "hidden" : undefined)
        return tier === ("tier" in band ? band.tier : undefined)
      }).map((bucket) => bucket.name),
    ])],
  }))
}

export function optimizationTargets(mode: ModeName) {
  return Object.fromEntries(optimizationBuckets(mode).map((band) => [
    band.name,
    {
      match: { criteria: band.criteria, winRange: band.range },
      hitRate: 1 / band.probability,
      avgWin: band.average,
    },
  ]))
}

export const HIT_TARGETS: Record<ModeName, number> = {
  base: MODES.base.hitRate,
  extraChance: MODES.extraChance.hitRate,
  extraChance2: MODES.extraChance2.hitRate,
  featureSpin: MODES.featureSpin.hitRate,
  bonusFeature: 1,
  superBonusFeature: 1,
  hiddenBonusFeature: 1,
}

export function expectedModeAverage(mode: ModeName) {
  return DESIGN.rtp * MODES[mode].cost
}
