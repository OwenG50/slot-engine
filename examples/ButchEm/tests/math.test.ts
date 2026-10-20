import { describe, expect, it } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { optimize } from "@slot-engine/optimizer"
import {
  BONUS_TARGETS,
  DESIGN,
  FEATURE_SPIN_UPGRADE_COUNT_PROBABILITIES,
  MODES,
} from "../src/settings"
import {
  BELOW_COST_TARGETS,
  BONUS_MEDIAN_TARGETS,
  EXTRA_CHANCE_MEDIAN_TARGETS,
  HIT_TARGETS,
  mathBuckets,
  optimizationBuckets,
  optimizationTargets,
  validateBuckets,
} from "../src/math"
import { MAX_WIN, ModeName } from "../src/types"

describe("ButchEm math budgets", () => {
  for (const name of Object.keys(MODES) as ModeName[]) {
    it(name + " has a feasible 96% RTP budget and the original mode hit rate", () => {
      const buckets = mathBuckets(name)
      expect(() => validateBuckets(name, buckets)).not.toThrow()
      expect(buckets.reduce((s, b) => s + b.probability, 0)).toBeCloseTo(1, 12)
      expect(
        buckets.reduce((s, b) => s + b.probability * b.average, 0) / MODES[name].cost,
      ).toBeCloseTo(0.96, 12)
      const hit = buckets
        .filter((b) => b.range[0] > 0)
        .reduce((s, b) => s + b.probability, 0)
      expect(hit).toBeCloseTo(HIT_TARGETS[name], 12)
      expect(hit).toBeCloseTo(MODES[name].hitRate, 12)
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
  it("scales purchased-mode max-win probability with cost", () => {
    for (const mode of [
      "featureSpin",
      "bonusFeature",
      "superBonusFeature",
      "hiddenBonusFeature",
    ] as const) {
      const max = mathBuckets(mode).find(
        (bucket) => bucket.range[0] === MAX_WIN && bucket.range[1] === MAX_WIN,
      )!
      expect(max.probability).toBeCloseTo((0.002 * MODES[mode].cost) / MAX_WIN, 12)
      expect((max.probability * MAX_WIN) / MODES[mode].cost).toBeCloseTo(0.002, 12)
    }
  })
  it("pins base triggers at 1/300, 1/3000 and 1/50000, including their tails", () => {
    for (const [tier, oneIn] of [
      ["normal", 300],
      ["super", 3000],
      ["hidden", 50000],
    ] as const) {
      expect(BONUS_TARGETS[tier].oneIn).toBe(oneIn)
      const probability = (mode: ModeName) =>
        mathBuckets(mode)
          .filter((b) => b.tier === tier)
          .reduce((s, b) => s + b.probability, 0)
      expect(probability("base")).toBeCloseTo(1 / oneIn, 12)
      expect(probability("extraChance")).toBeCloseTo(2 / oneIn, 12)
      expect(probability("extraChance2")).toBeCloseTo(5 / oneIn, 12)
    }
  })
  it("keeps additive wilds and broad simulation coverage", () => {
    expect(DESIGN.wildCombination).toBe("add")
    expect(HIT_TARGETS).toMatchObject({
      base: 0.2,
      extraChance: 0.25,
      extraChance2: 0.25,
      featureSpin: 0.8,
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
  it("pins below-cost probabilities while preserving RTP and nonzero hit rates", () => {
    for (const [mode, target] of Object.entries(BELOW_COST_TARGETS) as [
      ModeName,
      number,
    ][]) {
      const buckets = optimizationBuckets(mode)
      expect(() => validateBuckets(mode, buckets)).not.toThrow()
      const cost = MODES[mode].cost
      expect(buckets.every((b) => b.range[1] < cost || b.range[0] >= cost)).toBe(true)
      expect(
        buckets
          .filter((b) => b.range[1] < cost)
          .reduce((sum, b) => sum + b.probability, 0),
      ).toBeCloseTo(target, 12)
      expect(
        buckets.filter((b) => b.range[0] > 0).reduce((sum, b) => sum + b.probability, 0),
      ).toBeCloseTo(HIT_TARGETS[mode], 12)
      for (const bucket of buckets)
        expect(optimizationTargets(mode)[bucket.name].match).toEqual({
          criteria: bucket.criteria,
          winRange: bucket.range,
        })
      const original = mathBuckets(mode)
      for (const tail of original.filter((b) => /_(tail|large|max)$/.test(b.name)))
        expect(
          buckets
            .filter(
              (b) =>
                b.tier === tail.tier &&
                b.range[0] >= tail.range[0] &&
                b.range[1] <= tail.range[1],
            )
            .reduce((sum, b) => sum + b.probability, 0),
        ).toBeCloseTo(tail.probability, 12)
      for (const tier of ["normal", "super", "hidden"] as const) {
        const mass = (values: typeof original) =>
          values.filter((b) => b.tier === tier).reduce((sum, b) => sum + b.probability, 0)
        expect(mass(buckets)).toBeCloseTo(mass(original), 12)
      }
    }
  })
  it("reshapes base wins without changing their probability or payout budget", () => {
    const before = mathBuckets("base").find((bucket) => bucket.name === "baseWin")!
    const after = optimizationBuckets("base").filter((bucket) =>
      bucket.name.startsWith("baseWin_"),
    )
    expect(after.reduce((sum, bucket) => sum + bucket.probability, 0)).toBeCloseTo(
      before.probability,
      12,
    )
    expect(
      after.reduce((sum, bucket) => sum + bucket.probability * bucket.average, 0),
    ).toBeCloseTo(before.probability * before.average, 12)
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
  it("keeps hidden floors and similar mean/median targets across entry modes", () => {
    for (const [mode, mean, median] of [
      ["base", 960, 900],
      ["extraChance", 940, 885],
      ["extraChance2", 930, 875],
      ["hiddenBonusFeature", 960, 900],
    ] as const) {
      const hidden = optimizationBuckets(mode).filter((b) => b.tier === "hidden")
      const mass = hidden.reduce((sum, b) => sum + b.probability, 0)
      expect(
        hidden.reduce((sum, b) => sum + b.probability * b.average, 0) / mass,
      ).toBeCloseTo(mean, 9)
      expect(Math.min(...hidden.map((b) => b.range[0]))).toBe(800)
      expect(
        hidden
          .filter((b) => b.range[1] <= median)
          .reduce((sum, b) => sum + b.probability, 0) / mass,
      ).toBeCloseTo(0.5, 12)
      expect(
        hidden
          .filter((b) => b.range[0] >= 1000)
          .reduce((sum, b) => sum + b.probability, 0) / mass,
      ).toBeCloseTo(0.2, 12)
    }
  })
  it("funds similar Extra Chance bonuses from ordinary wins at the same hit and recovery rates", () => {
    for (const [mode, normal, superMean, ordinaryEV] of [
      ["extraChance", 92, 280, 0.6024],
      ["extraChance2", 90, 276, 0.827],
    ] as const) {
      const buckets = optimizationBuckets(mode)
      for (const [tier, mean] of [
        ["normal", normal],
        ["super", superMean],
      ] as const) {
        const bonus = buckets.filter((b) => b.tier === tier)
        const mass = bonus.reduce((sum, b) => sum + b.probability, 0)
        expect(
          bonus.reduce((sum, b) => sum + b.probability * b.average, 0) / mass,
        ).toBeCloseTo(mean, 10)
        // Regrouping must cover payouts from previous simulation partitions too.
        expect(bonus.every((b) => b.criteria.length === 6)).toBe(true)
        expect(
          bonus
            .filter((b) => b.range[1] <= EXTRA_CHANCE_MEDIAN_TARGETS[mode][tier])
            .reduce((sum, b) => sum + b.probability, 0) / mass,
        ).toBeCloseTo(0.5, 12)
      }
      const ordinary = buckets.filter((b) => !b.tier && b.range[0] > 0)
      expect(ordinary.reduce((sum, b) => sum + b.probability * b.average, 0)).toBeCloseTo(
        ordinaryEV,
        10,
      )
      const recovery = ordinary.find((b) => b.range[1] === 4.99)!
      expect(recovery.probability).toBeGreaterThan(mode === "extraChance" ? 0.035 : 0.025)
      expect(
        buckets
          .filter((b) => b.range[0] >= MODES[mode].cost)
          .reduce((sum, b) => sum + b.probability, 0),
      ).toBeCloseTo(0.1, 12)
      expect(
        buckets.filter((b) => b.range[0] > 0).reduce((sum, b) => sum + b.probability, 0),
      ).toBeCloseTo(0.25, 12)
    }
  })
  it("pins the buy's populated upper bands and median cuts", () => {
    const normal = optimizationBuckets("bonusFeature")
    const superBonus = optimizationBuckets("superBonusFeature")
    const probability = (buckets: typeof normal, min: number, max = Infinity) =>
      buckets
        .filter((b) => b.range[0] >= min && b.range[1] < max)
        .reduce((sum, b) => sum + b.probability, 0)
    expect(probability(normal, 200, 500)).toBeCloseTo(0.028, 12)
    expect(probability(normal, 250, 500)).toBeCloseTo(0.02, 12)
    expect(probability(normal, 500, 1000)).toBeCloseTo(0.0023, 12)
    expect(probability(superBonus, 1000)).toBeCloseTo(0.00774, 12)
    for (const [buckets, tier] of [
      [normal, "normal"],
      [superBonus, "super"],
    ] as const)
      expect(
        buckets
          .filter((b) => b.range[1] <= BONUS_MEDIAN_TARGETS[tier])
          .reduce((sum, b) => sum + b.probability, 0),
      ).toBeCloseTo(0.5, 12)
  })
  it("aligns all conditional reporting-band probabilities with the corresponding buy", () => {
    const edges = [0, 25, 50, 100, 200, 250, 500, 1000, 2000, 3000, 5000, 10000, 10000.01]
    for (const [tier, buy] of [
      ["normal", "bonusFeature"],
      ["super", "superBonusFeature"],
      ["hidden", "hiddenBonusFeature"],
    ] as const) {
      const reference = optimizationBuckets(buy)
      for (const mode of ["base", "extraChance", "extraChance2"] as const) {
        const bonus = optimizationBuckets(mode).filter((b) => b.tier === tier)
        const mass = bonus.reduce((sum, b) => sum + b.probability, 0)
        for (let i = 0; i < edges.length - 1; i++) {
          const min = edges[i],
            max = edges[i + 1]
          const probability = (values: typeof bonus) =>
            values
              .filter((b) => b.range[0] >= min && b.range[1] < max)
              .reduce((sum, b) => sum + b.probability, 0)
          expect(probability(bonus) / mass).toBeCloseTo(probability(reference), 12)
          expect(bonus.some((b) => b.range[0] < max && b.range[1] >= max)).toBe(false)
        }
        if (mode === "base") {
          expect(
            bonus.reduce((sum, b) => sum + b.probability * b.average, 0) / mass,
          ).toBeCloseTo(DESIGN.rtp * MODES[buy].cost, 10)
        }
      }
    }
  })
  it("preserves feature-spin upgrade-count payout budgets", () => {
    for (const count of [1, 2, 3, 4] as const) {
      const before = mathBuckets("featureSpin").filter(
        (b) => b.startingUpgradeCount === count,
      )
      const after = optimizationBuckets("featureSpin").filter(
        (b) => b.startingUpgradeCount === count,
      )
      expect(after.reduce((sum, b) => sum + b.probability, 0)).toBeCloseTo(
        FEATURE_SPIN_UPGRADE_COUNT_PROBABILITIES[count],
        12,
      )
      expect(after.reduce((sum, b) => sum + b.probability * b.average, 0)).toBeCloseTo(
        before.reduce((sum, b) => sum + b.probability * b.average, 0),
        12,
      )
    }
  })
  it.each([50, 57.5])("optimizes books with a %sx four-upgrade floor while preserving all feature-spin budgets", async (fourUpgradeFloor) => {
    const root = mkdtempSync(path.join(tmpdir(), "butch-feature-targets-"))
    const lookupTable = path.join(root, "lookup.csv")
    const lookupTableSegmented = path.join(root, "segmented.csv")
    const buckets = optimizationBuckets("featureSpin")
    const lookup: string[] = []
    const segmented: string[] = []
    // Cover both the absent 25-50 band and the reported 57.5-97.5 support:
    // a target must be feasible for actual books, not just its declared range.
    for (const bucket of buckets) {
      const support = bucket.name === "feature_4_50_100"
        ? [fourUpgradeFloor, 97.5]
        : bucket.name === "feature_4_100_250"
          ? [100, 247.5]
          : bucket.range
      for (const payout of new Set(support)) {
        if (bucket.startingUpgradeCount === 4 && payout < 50) continue
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
          .reduce((sum, [, group]) => sum + group.probability, 0),
      ).toBeCloseTo(HIT_TARGETS.featureSpin, 8)
      expect(
        criteria
          .filter(([, group]) => group.maxWin < MODES.featureSpin.cost)
          .reduce((sum, [, group]) => sum + group.probability, 0),
      ).toBeCloseTo(BELOW_COST_TARGETS.featureSpin!, 8)
      for (const count of [1, 2, 3, 4] as const) {
        const groups = criteria.filter(([name]) => name.startsWith(`feature_${count}_`))
        expect(groups.reduce((sum, [, group]) => sum + group.probability, 0)).toBeCloseTo(
          FEATURE_SPIN_UPGRADE_COUNT_PROBABILITIES[count],
          8,
        )
        const expectedPayout = mathBuckets("featureSpin")
          .filter((bucket) => bucket.startingUpgradeCount === count)
          .reduce((sum, bucket) => sum + bucket.probability * bucket.average, 0)
        expect(
          groups.reduce((sum, [, group]) => sum + group.probability * group.avgWin, 0),
        ).toBeCloseTo(expectedPayout, 8)
      }
      expect(result.criteria.feature_4_max.probability).toBeCloseTo(0.00001, 8)
      expect(result.criteria.feature_4_50_100.probability).toBeCloseTo(0.00505, 8)
      expect(result.criteria.feature_4_50_100.avgWin).toBeCloseTo(75, 8)
      expect(result.criteria.feature_4_100_250.probability).toBeCloseTo(0.025, 8)
      expect(result.criteria.feature_4_100_250.avgWin).toBeCloseTo(111.53, 8)
      expect(result.criteria.feature_4_25_50).toBeUndefined()
      expect(
        mathBuckets("featureSpin").find((bucket) => bucket.name === "feature_4_win")!
          .range[0],
      ).toBe(50)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it("preserves the optimized featureSpin upgrade-count distribution", () => {
    const buckets = mathBuckets("featureSpin")
    for (const count of [1, 2, 3, 4] as const) {
      expect(
        buckets
          .filter((bucket) => bucket.startingUpgradeCount === count)
          .reduce((sum, bucket) => sum + bucket.probability, 0),
      ).toBeCloseTo(FEATURE_SPIN_UPGRADE_COUNT_PROBABILITIES[count], 12)
    }
    expect(buckets.find((bucket) => bucket.name === "feature_4_win")).toMatchObject({
      startingUpgradeCount: 4,
    })
    expect(buckets.find((bucket) => bucket.name === "feature_4_max")).toMatchObject({
      probability: 0.00001,
      average: MAX_WIN,
      range: [MAX_WIN, MAX_WIN],
      startingUpgradeCount: 4,
    })
  })
})
