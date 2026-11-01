import {
  BONUS_MAX_EXCESS_SHARE,
  BONUS_REFERENCE_ODDS,
  NATURAL_BONUS_SPREAD,
} from "./settings"
import { BonusTier, MAX_WIN } from "./types"

export interface PayoutBand {
  name: string
  range: [number, number]
  probability: number
  average: number
}

function maxBand(probability: number): PayoutBand {
  return { name: "max", range: [MAX_WIN, MAX_WIN], probability, average: MAX_WIN }
}

/** Fit chart-relative band odds to a route's floor and mean. A positive spread
 * moves mass toward the floor and the high tail, lowering the median. */
function referenceBonusDistribution(
  tier: "normal" | "super",
  floor: number,
  average: number,
  maxScale: number,
  spread: number,
): PayoutBand[] {
  if (!(floor >= 1 && floor < average && average < MAX_WIN))
    throw new Error("Bonus distribution requires 1 <= floor < average < max win")
  if (!(maxScale > 0 && maxScale <= 1))
    throw new Error("Bonus max-win scale must be in (0, 1]")
  const cuts = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, MAX_WIN]
  const bands = cuts.slice(0, -1).flatMap((lower, i) => {
    const upper = cuts[i + 1] - 0.01
    if (upper < floor) return []
    const start = Math.max(lower, floor)
    return [
      {
        name: `${start}_${cuts[i + 1]}`,
        range: [start, upper] as [number, number],
        average: (start + upper) / 2,
        logPrior: -Math.log(BONUS_REFERENCE_ODDS[tier][i]),
      },
    ]
  })
  const maxProbability =
    (maxScale * BONUS_MAX_EXCESS_SHARE * (average - floor)) / (MAX_WIN - floor)
  const target = (average - maxProbability * MAX_WIN) / (1 - maxProbability)
  if (!bands.length || target <= bands[0].average || target >= bands.at(-1)!.average)
    throw new Error("Reference bonus bands cannot fund the requested floor and mean")
  const fit = (tilt: number) => {
    const logs = bands.map((b) => {
      const x = Math.log(b.average / average)
      return b.logPrior + tilt * x + spread * x * x
    })
    const largest = Math.max(...logs)
    const weights = logs.map((value) => Math.exp(value - largest))
    const total = weights.reduce((sum, value) => sum + value, 0)
    return weights.map((value) => value / total)
  }
  let lo = -32
  let hi = 32
  for (let i = 0; i < 100; i++) {
    const tilt = (lo + hi) / 2
    const weights = fit(tilt)
    const mean = bands.reduce((sum, band, j) => sum + weights[j] * band.average, 0)
    if (mean < target) lo = tilt
    else hi = tilt
  }
  const weights = fit((lo + hi) / 2)
  const fitted = bands.map(({ logPrior: _, ...band }, i) => ({
    ...band,
    probability: weights[i] * (1 - maxProbability),
  }))
  const actual =
    fitted.reduce((sum, b) => sum + b.probability * b.average, 0) +
    maxProbability * MAX_WIN
  if (Math.abs(actual - average) > 1e-8)
    throw new Error("Reference bonus probability fit did not converge")
  return [...fitted, maxBand(maxProbability)]
}

/** Bought curves with one peak and declining adjacent band odds. The peak's
 * mean is solved so the curve returns exactly the requested average. */
export function purchasedBonusDistribution(
  tier: BonusTier,
  floor: number,
  average: number,
): PayoutBand[] {
  if (!(floor > 0 && floor < average && average < MAX_WIN))
    throw new Error("Purchased bonus requires 0 < floor < average < max win")
  const shape = {
    normal: {
      // Most buys land at 20-50x; the cost-recovering 100x+ side carries the EV.
      cuts: [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, MAX_WIN],
      probabilities: [
        0.001, 0.08, 0.12, 0.17, 0, 0.17, 0.135, 0.08, 0.017, 0.003, 0.0009, 0.0003,
      ],
      peak: 4,
    },
    super: {
      // Most-likely 100-200x results fund a heavier 1,000x+ tail.
      cuts: [10, 20, 50, 100, 200, 300, 500, 1000, 2000, 5000, MAX_WIN],
      probabilities: [0.065, 0.11, 0.18, 0, 0.14, 0.1, 0.065, 0.028, 0.012, 0.003],
      peak: 3,
    },
    hidden: {
      // A 200-500x peak keeps the median well below cost, funding a heavy
      // 2,000x+ tail while about a quarter of buys still recover the cost.
      cuts: [50, 100, 200, 500, 1000, 2000, 5000, MAX_WIN],
      probabilities: [0.13, 0.22, 0, 0.17, 0.13, 0.09, 0.026],
      peak: 2,
    },
  }[tier]
  if (floor !== shape.cuts[0])
    throw new Error("Purchased bonus shape requires its configured tier floor")
  const maxProbability = (BONUS_MAX_EXCESS_SHARE * (average - floor)) / (MAX_WIN - floor)
  const probabilities = [...shape.probabilities]
  probabilities[shape.peak] =
    1 - maxProbability - probabilities.reduce((sum, value) => sum + value, 0)
  const bands: PayoutBand[] = shape.cuts.slice(0, -1).map((lower, i) => ({
    name: `${lower}_${shape.cuts[i + 1]}`,
    range: [lower, shape.cuts[i + 1] - 0.01],
    probability: probabilities[i],
    average: (lower + shape.cuts[i + 1] - 0.01) / 2,
  }))
  const fixedEv = bands.reduce(
    (sum, band, i) => sum + (i === shape.peak ? 0 : band.probability * band.average),
    maxProbability * MAX_WIN,
  )
  const peak = bands[shape.peak]
  peak.average = (average - fixedEv) / peak.probability
  const all = [...bands, maxBand(maxProbability)]
  if (
    all.some(
      (band, i) =>
        !(band.probability > 0) ||
        !Number.isFinite(band.average) ||
        band.average < band.range[0] ||
        band.average > band.range[1] ||
        (i > 0 &&
          (i <= shape.peak
            ? band.probability <= all[i - 1].probability
            : band.probability >= all[i - 1].probability)),
    )
  )
    throw new Error("Purchased bonus budget cannot fund its single-peaked shape")
  return all
}

/** Natural Normal/Super use the spread reference fit. Natural Hidden keeps a
 * raised floor with a premium tail; its 1500-2000x middle balances the mean. */
export function naturalBonusDistribution(
  tier: BonusTier,
  floor: number,
  average: number,
  maxScale = 1,
): PayoutBand[] {
  if (tier !== "hidden")
    return referenceBonusDistribution(
      tier,
      floor,
      average,
      maxScale,
      NATURAL_BONUS_SPREAD[tier],
    )
  if (!(maxScale > 0 && maxScale <= 1))
    throw new Error("Bonus max-win scale must be in (0, 1]")
  if (!(floor > 0 && floor <= 1250 && floor < average && average < MAX_WIN))
    throw new Error(
      "Natural Hidden distribution requires a floor at most 1250x and below its mean",
    )
  const fixed: PayoutBand[] = [
    { name: `${floor}_1500`, range: [floor, 1499.99], probability: 0.3, average: 1250 },
    { name: "2000_5000", range: [2000, 4999.99], probability: 0.05, average: 2800 },
    { name: "5000_10000", range: [5000, 9999.99], probability: 0.03, average: 6500 },
    maxBand(0.0009 * maxScale),
  ]
  const probability = 1 - fixed.reduce((sum, band) => sum + band.probability, 0)
  const middleMean =
    (average - fixed.reduce((sum, band) => sum + band.probability * band.average, 0)) /
    probability
  if (!Number.isFinite(middleMean) || middleMean < 1500 || middleMean > 1999.99)
    throw new Error("Natural Hidden payout budget cannot fund its floor and premium tail")
  return [
    fixed[0],
    { name: "1500_2000", range: [1500, 1999.99], probability, average: middleMean },
    ...fixed.slice(1),
  ]
}
