import { describe, expect, it } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { optimize } from "@slot-engine/optimizer"
import {
  BONUS_BUY_MINIMUMS,
  BONUS_TARGETS,
  DESIGN,
  FEATURE_SPIN_MAX_WIN_ONE_IN,
  FEATURE_SPIN_UPGRADE_COUNT_PROBABILITIES,
  MODES,
  NATURAL_BONUS_AVERAGES,
  NATURAL_MAX_WIN_ONE_IN,
} from "../src/settings"
import {
  BELOW_COST_TARGETS,
  HIT_TARGETS,
  mathBuckets,
  optimizationBuckets,
  optimizationTargets,
  validateBuckets,
} from "../src/math"
import { MAX_WIN, ModeName } from "../src/types"

const sum = <T>(values: T[], f: (value: T) => number) =>
  values.reduce((total, value) => total + f(value), 0)
const mass = (buckets: { probability: number }[]) => sum(buckets, (b) => b.probability)
const ev = (buckets: { probability: number; average: number }[]) =>
  sum(buckets, (b) => b.probability * b.average)

describe("ButchEm math budgets", () => {
  for (const name of Object.keys(MODES) as ModeName[]) {
    it(name + " has a feasible 96% RTP budget and the mode hit rate", () => {
      const buckets = mathBuckets(name)
      expect(() => validateBuckets(name, buckets)).not.toThrow()
      expect(mass(buckets)).toBeCloseTo(1, 12)
      expect(ev(buckets) / MODES[name].cost).toBeCloseTo(0.96, 12)
      const hit = mass(buckets.filter((b) => b.range[0] > 0))
      expect(hit).toBeCloseTo(HIT_TARGETS[name], 12)
      expect(hit).toBeCloseTo(MODES[name].hitRate, 12)
      expect(() => validateBuckets(name, optimizationBuckets(name))).not.toThrow()
    })
  }
  it("provides an exact max-win bucket in every game mode", () => {
    for (const mode of Object.keys(MODES) as ModeName[]) {
      expect(
        mathBuckets(mode).some(
          (bucket) => bucket.range[0] === MAX_WIN && bucket.range[1] === MAX_WIN,
        ),
      ).toBe(true)
    }
  })
  it("pins natural triggers at 1/300, 1/3000 and 1/62500, including their tails", () => {
    for (const [tier, oneIn] of [
      ["normal", 300],
      ["super", 3000],
      ["hidden", 62500],
    ] as const) {
      expect(BONUS_TARGETS[tier].oneIn).toBe(oneIn)
      const probability = (mode: ModeName) =>
        mass(mathBuckets(mode).filter((b) => b.tier === tier))
      expect(probability("base")).toBeCloseTo(1 / oneIn, 12)
      expect(probability("extraChance")).toBeCloseTo(2 / oneIn, 12)
      expect(probability("extraChance2")).toBeCloseTo(5 / oneIn, 12)
    }
  })
  it("keeps natural means, floors and whole-round max-win odds per entry route", () => {
    for (const mode of ["base", "extraChance", "extraChance2"] as const) {
      const buckets = optimizationBuckets(mode)
      for (const tier of ["normal", "super", "hidden"] as const) {
        const bonus = buckets.filter((b) => b.tier === tier)
        expect(ev(bonus) / mass(bonus)).toBeCloseTo(NATURAL_BONUS_AVERAGES[mode][tier], 9)
        expect(Math.min(...bonus.map((b) => b.range[0]))).toBe(
          BONUS_TARGETS[tier].minimum,
        )
      }
      expect(mass(buckets.filter((b) => b.tier && b.range[0] === MAX_WIN))).toBeCloseTo(
        1 / NATURAL_MAX_WIN_ONE_IN[mode],
        15,
      )
    }
  })
  it("spreads natural Normal and Super rounds well away from their means", () => {
    for (const mode of ["base", "extraChance", "extraChance2"] as const) {
      for (const tier of ["normal", "super"] as const) {
        const bonus = optimizationBuckets(mode).filter((b) => b.tier === tier)
        const total = mass(bonus)
        const mean = ev(bonus) / total
        // Most rounds pay below the mean, and no reporting band dominates.
        expect(mass(bonus.filter((b) => b.range[1] < mean)) / total).toBeGreaterThan(0.55)
        expect(Math.max(...bonus.map((b) => b.probability)) / total).toBeLessThan(0.4)
      }
    }
  })
  it("gives bought bonuses single-peaked curves with low floors and medians below cost", () => {
    for (const [mode, tier] of [
      ["bonusFeature", "normal"],
      ["superBonusFeature", "super"],
      ["hiddenBonusFeature", "hidden"],
    ] as const) {
      const buckets = optimizationBuckets(mode)
      const cost = MODES[mode].cost
      expect(Math.min(...buckets.map((b) => b.range[0]))).toBe(BONUS_BUY_MINIMUMS[tier])
      expect(ev(buckets)).toBeCloseTo(DESIGN.rtp * cost, 9)
      expect(buckets.every((b) => b.range[1] < cost || b.range[0] >= cost)).toBe(true)
      const below = mass(buckets.filter((b) => b.range[1] < cost))
      expect(below).toBeGreaterThan(0.7)
      expect(below).toBeLessThan(0.82)
      const regular = buckets.filter((b) => b.range[0] < MAX_WIN)
      const peak = regular.reduce(
        (best, b, i) => (b.probability > regular[best].probability ? i : best),
        0,
      )
      regular.forEach((b, i) => {
        if (i > 0 && i <= peak)
          expect(b.probability).toBeGreaterThan(regular[i - 1].probability)
        if (i > peak) expect(b.probability).toBeLessThan(regular[i - 1].probability)
      })
    }
  })
  it("keeps additive wilds and broad simulation coverage", () => {
    expect(DESIGN.wildCombination).toBe("add")
    expect(HIT_TARGETS).toMatchObject({
      base: 0.2,
      extraChance: 0.22,
      extraChance2: 0.235,
      featureSpin: 0.77,
    })
    for (const mode of [
      "base",
      "extraChance",
      "extraChance2",
      "featureSpin",
    ] as ModeName[]) {
      const ordinary = mathBuckets(mode).filter((b) => !b.tier && b.range[0] > 0)
      expect(ordinary.length).toBeGreaterThanOrEqual(1)
      expect(Math.min(...ordinary.map((bucket) => bucket.range[0]))).toBeLessThan(
        MODES[mode].cost,
      )
      expect(Math.max(...ordinary.map((bucket) => bucket.range[1]))).toBeGreaterThan(
        MODES[mode].cost,
      )
    }
  })
  it("pins Extra Chance below-cost probabilities while preserving RTP and hit rates", () => {
    for (const [mode, target] of Object.entries(BELOW_COST_TARGETS) as [
      ModeName,
      number,
    ][]) {
      const buckets = optimizationBuckets(mode)
      const cost = MODES[mode].cost
      expect(buckets.every((b) => b.range[1] < cost || b.range[0] >= cost)).toBe(true)
      expect(mass(buckets.filter((b) => b.range[1] < cost))).toBeCloseTo(target, 12)
      expect(mass(buckets.filter((b) => b.range[0] > 0))).toBeCloseTo(
        HIT_TARGETS[mode],
        12,
      )
      for (const bucket of buckets)
        expect(optimizationTargets(mode)[bucket.name].match).toEqual({
          criteria: bucket.criteria,
          winRange: bucket.range,
        })
      const original = mathBuckets(mode)
      for (const tier of ["normal", "super", "hidden"] as const)
        expect(mass(buckets.filter((b) => b.tier === tier))).toBeCloseTo(
          mass(original.filter((b) => b.tier === tier)),
          12,
        )
      const ordinary = buckets.filter((b) => !b.tier)
      expect(ev(ordinary)).toBeCloseTo(
        DESIGN.rtp * cost - ev(original.filter((b) => b.tier)),
        10,
      )
    }
  })
  it("reduces Extra Chance small hits and increases the mean ordinary winning payout", () => {
    for (const [mode, smallHitProbability] of [
      ["extraChance", 0.12],
      ["extraChance2", 0.135],
    ] as const) {
      const buckets = optimizationBuckets(mode)
      const ordinary = buckets.filter((b) => !b.tier && b.range[0] > 0)
      const bonusProbability = mass(buckets.filter((b) => b.tier))
      expect(mass(ordinary.filter((b) => b.range[1] < MODES[mode].cost))).toBeCloseTo(
        smallHitProbability,
        12,
      )
      const previousMean = ev(ordinary) / (0.25 - bonusProbability)
      expect(ev(ordinary) / mass(ordinary)).toBeGreaterThan(previousMean)
    }
  })
  it("pins ExtraChance2 ordinary 5-10x wins at 2.2% of plays", () => {
    const band = optimizationBuckets("extraChance2").find(
      (b) => b.name === "baseWin_5_10",
    )!
    expect(band.probability).toBeCloseTo(0.022, 12)
    expect(band.average).toBe(7)
    expect(band.range).toEqual([5, 9.99])
  })
  for (const mode of ["extraChance", "extraChance2"] as const) {
    it(mode + " optimizes the new hit rate and ordinary payout targets", async () => {
      const root = mkdtempSync(path.join(tmpdir(), "butch-extra-chance-"))
      const lookupTable = path.join(root, "lookup.csv")
      const lookupTableSegmented = path.join(root, "segmented.csv")
      const buckets = optimizationBuckets(mode)
      const lookup: string[] = []
      const segmented: string[] = []
      for (const bucket of buckets) {
        for (const payout of new Set(bucket.range)) {
          const id = lookup.length + 1
          lookup.push(`${id},1,${Math.round(payout * 100)}`)
          segmented.push(`${id},${bucket.criteria[0]},${payout},0`)
        }
      }
      try {
        writeFileSync(lookupTable, lookup.join("\n"))
        writeFileSync(lookupTableSegmented, segmented.join("\n"))
        const result = await optimize({
          input: { lookupTable, lookupTableSegmented },
          output: { lookupTable: path.join(root, "optimized.csv") },
          targets: optimizationTargets(mode),
          cost: MODES[mode].cost,
          rtp: DESIGN.rtp,
          verbose: false,
        })
        expect(result.rtp).toBeCloseTo(DESIGN.rtp, 8)
        expect(
          sum(
            Object.values(result.criteria).filter((g) => g.minWin > 0),
            (g) => g.probability,
          ),
        ).toBeCloseTo(MODES[mode].hitRate, 8)
        for (const bucket of buckets) {
          expect(result.criteria[bucket.name].probability).toBeCloseTo(
            bucket.probability,
            8,
          )
        }
        if (mode === "extraChance2")
          expect(result.criteria.baseWin_5_10.probability).toBeCloseTo(0.022, 8)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })
  }
  it("reshapes base wins without changing their probability or payout budget", () => {
    const before = mathBuckets("base").find((bucket) => bucket.name === "baseWin")!
    const after = optimizationBuckets("base").filter((bucket) =>
      bucket.name.startsWith("baseWin_"),
    )
    expect(mass(after)).toBeCloseTo(before.probability, 12)
    expect(ev(after)).toBeCloseTo(before.probability * before.average, 12)
    for (const [name, probability] of [
      ["baseWin_under_025", 0.04],
      ["baseWin_025_05", 0.03],
      ["baseWin_05_1", 0.02],
    ] as const)
      expect(after.find((bucket) => bucket.name === name)?.probability).toBeCloseTo(
        probability,
        12,
      )
  })
})

describe("ButchEm featureSpin curve", () => {
  const buckets = mathBuckets("featureSpin")
  const counts = [1, 2, 3, 4] as const
  const byCount = (count: number) =>
    buckets.filter((b) => b.startingUpgradeCount === count)

  it("preserves the 70/15/10/5 upgrade-count mix", () => {
    for (const count of counts)
      expect(mass(byCount(count))).toBeCloseTo(
        FEATURE_SPIN_UPGRADE_COUNT_PROBABILITIES[count],
        12,
      )
    expect(buckets.every((b) => counts.includes(b.startingUpgradeCount as 1))).toBe(true)
  })
  it("matches the shared payout chart and max-win odds", () => {
    const band = (min: number, max: number) =>
      mass(buckets.filter((b) => b.range[0] === min && b.range[1] === max))
    expect(band(0, 0)).toBeCloseTo(0.23, 12)
    expect(band(2, 4.99)).toBeCloseTo(0.18, 12)
    expect(band(5, 9.99)).toBeCloseTo(0.21, 12)
    expect(band(10, 19.99)).toBeCloseTo(0.14, 12)
    // 20-50x stays thin; that budget sits in the 250x+ tail.
    expect(band(20, 24.99) + band(25, 49.99)).toBeCloseTo(0.075, 12)
    expect(band(250, 499.99)).toBeCloseTo(0.026, 12)
    expect(band(500, 999.99)).toBeCloseTo(0.0155, 12)
    expect(band(1000, 1999.99)).toBeCloseTo(0.0045, 12)
    expect(ev(buckets.filter((b) => b.range[0] >= 250)) / ev(buckets)).toBeGreaterThan(
      0.6,
    )
    const max = buckets.filter((b) => b.range[0] === MAX_WIN)
    expect(max).toHaveLength(1)
    expect(max[0].startingUpgradeCount).toBe(4)
    expect(max[0].probability).toBeCloseTo(1 / FEATURE_SPIN_MAX_WIN_ONE_IN, 15)
    expect(
      buckets.filter((b) => b.range[1] === 0).every((b) => b.startingUpgradeCount === 1),
    ).toBe(true)
  })
  it("usually, but not always, pays more with more upgrades", () => {
    const means = counts.map((count) => ev(byCount(count)) / mass(byCount(count)))
    for (let i = 1; i < means.length; i++) expect(means[i]).toBeGreaterThan(means[i - 1])
    // Every count shares the 100-250x band, so extra upgrades are not a guarantee.
    for (const count of counts)
      expect(
        byCount(count).some((b) => b.range[0] === 100 && b.range[1] === 249.99),
      ).toBe(true)
    expect(mass(byCount(2).filter((b) => b.range[1] < 50)) / 0.15).toBeGreaterThan(0.5)
  })
  it("optimizes a minimal book set to the configured featureSpin targets", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "butch-feature-targets-"))
    const lookupTable = path.join(root, "lookup.csv")
    const lookupTableSegmented = path.join(root, "segmented.csv")
    const targets = optimizationBuckets("featureSpin")
    const lookup: string[] = []
    const segmented: string[] = []
    for (const bucket of targets) {
      for (const payout of new Set(bucket.range)) {
        const id = lookup.length + 1
        lookup.push(`${id},1,${Math.round(payout * 100)}`)
        segmented.push(`${id},${bucket.criteria[0]},${payout},0`)
      }
    }
    try {
      writeFileSync(lookupTable, lookup.join("\n"))
      writeFileSync(lookupTableSegmented, segmented.join("\n"))
      const result = await optimize({
        input: { lookupTable, lookupTableSegmented },
        output: { lookupTable: path.join(root, "optimized.csv") },
        targets: optimizationTargets("featureSpin"),
        cost: MODES.featureSpin.cost,
        rtp: DESIGN.rtp,
        verbose: false,
      })
      const criteria = Object.entries(result.criteria)
      expect(result.rtp).toBeCloseTo(DESIGN.rtp, 8)
      expect(
        criteria
          .filter(([, group]) => group.minWin > 0)
          .reduce((total, [, group]) => total + group.probability, 0),
      ).toBeCloseTo(HIT_TARGETS.featureSpin, 8)
      for (const count of counts) {
        const groups = criteria.filter(([name]) => name.startsWith(`feature_${count}_`))
        expect(groups.reduce((total, [, g]) => total + g.probability, 0)).toBeCloseTo(
          FEATURE_SPIN_UPGRADE_COUNT_PROBABILITIES[count],
          8,
        )
      }
      expect(result.criteria.feature_4_max.probability).toBeCloseTo(
        1 / FEATURE_SPIN_MAX_WIN_ONE_IN,
        8,
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
