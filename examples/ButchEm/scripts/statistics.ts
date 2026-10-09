import { MODES } from "../src/settings"
import { ModeName } from "../src/types"

export interface Weighted {
  bucket: string
  payout: number
  bonusPayout: number
  initialUpgrades: number[]
  weight: number
}
export function analyze(mode: ModeName, candidates: Weighted[]) {
  const cost = MODES[mode].cost
  const total = candidates.reduce((s, c) => s + c.weight, 0)
  const probability = (predicate: (c: Weighted) => boolean) =>
    candidates.filter(predicate).reduce((s, c) => s + c.weight, 0) / total
  const ev = candidates.reduce((s, c) => s + c.weight * c.payout, 0) / total
  const variance =
    candidates.reduce((s, c) => s + c.weight * (c.payout - ev) ** 2, 0) / total
  const quantiles = (values: Weighted[], bonus = false) => {
    const payout = (c: Weighted) => (bonus ? c.bonusPayout : c.payout)
    const sorted = values
      .filter((c) => c.weight > 0)
      .sort((a, b) => payout(a) - payout(b))
    const sum = sorted.reduce((s, c) => s + c.weight, 0)
    const result: Record<string, number> = {}
    for (const q of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99, 1]) {
      let cursor = 0
      for (const c of sorted) {
        cursor += c.weight
        if (cursor >= sum * q) {
          result[String(q)] = payout(c)
          break
        }
      }
    }
    return result
  }
  const tiers = Object.fromEntries(
    (["normal", "super", "hidden"] as const).flatMap((tier) => {
      const subset = candidates.filter((c) => c.bucket.startsWith(tier + "_"))
      if (!subset.length) return []
      const mass = subset.reduce((s, c) => s + c.weight, 0)
      return [
        [
          tier,
          {
            probability: mass / total,
            oneIn: total / mass,
            average: subset.reduce((s, c) => s + c.weight * c.bonusPayout, 0) / mass,
            minimum: Math.min(
              ...subset.filter((c) => c.weight > 0).map((c) => c.bonusPayout),
            ),
            quantiles: quantiles(subset, true),
          },
        ],
      ]
    }),
  )
  const payoutBands = [
    [0, 0],
    [0.01, 0.99],
    [1, 4.99],
    [5, 19.99],
    [20, 99.99],
    [100, 499.99],
    [500, 1999.99],
    [2000, 2999.99],
    [3000, 4999.99],
    [5000, 9999.99],
    [10000, 10000],
  ].map(([min, max]) => {
    const inBand = candidates.filter((c) => c.payout >= min && c.payout <= max)
    return {
      min,
      max,
      probability: inBand.reduce((s, c) => s + c.weight, 0) / total,
      rtp: inBand.reduce((s, c) => s + c.weight * c.payout, 0) / total / cost,
    }
  })
  const startingUpgrades: Record<string, number> = {}
  for (const c of candidates) {
    if (!c.initialUpgrades.length) continue
    const key = [...c.initialUpgrades].sort().join("+")
    startingUpgrades[key] = (startingUpgrades[key] ?? 0) + c.weight / total
  }
  return {
    books: candidates.length,
    rtp: ev / cost,
    average: ev,
    hitRate: probability((c) => c.payout > 0),
    breakEvenRate: probability((c) => c.payout >= cost),
    standardDeviationInModeCosts: Math.sqrt(variance) / cost,
    quantiles: quantiles(candidates),
    tiers,
    payoutBands,
    startingUpgrades,
  }
}
