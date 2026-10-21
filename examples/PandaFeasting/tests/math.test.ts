import { describe, expect, it } from "vitest"
import {
  mathBuckets,
  optimizationBuckets,
  optimizationTargets,
  validateBuckets,
  BELOW_COST_TARGETS,
} from "../src/math"
import { MODES } from "../src/settings"
import { game } from ".."
import { MAX_WIN, ModeName } from "../src/types"
import {
  mathBuckets as referenceMath,
  optimizationBuckets as referenceOptimization,
} from "../../ButchEm/src/math"

describe("ButchEm distribution compatibility", () => {
  for (const mode of Object.keys(MODES) as ModeName[]) {
    it(`${mode} preserves RTP, hits, payout bands and bonus frequencies`, () => {
      for (const buckets of [mathBuckets(mode), optimizationBuckets(mode)]) {
        expect(() => validateBuckets(mode, buckets)).not.toThrow()
        expect(buckets.reduce((sum, b) => sum + b.probability, 0)).toBeCloseTo(1, 12)
        expect(
          buckets.reduce((sum, b) => sum + b.probability * b.average, 0) /
            MODES[mode].cost,
        ).toBeCloseTo(0.96, 12)
        expect(
          buckets
            .filter((b) => b.range[0] > 0)
            .reduce((sum, b) => sum + b.probability, 0),
        ).toBeCloseTo(MODES[mode].hitRate, 12)
        expect(buckets.some((b) => b.range[0] === MAX_WIN)).toBe(true)
      }
      const normalize = (buckets: ReturnType<typeof mathBuckets>) =>
        buckets.map(({ name, probability, average, range, tier }) => ({
          name,
          probability,
          average,
          range,
          tier,
        }))
      expect(normalize(mathBuckets(mode))).toEqual(normalize(referenceMath(mode)))
      const optimized = optimizationBuckets(mode)
      const reference = referenceOptimization(mode)
      const geometry = (values: typeof optimized) =>
        values.map(({ name, range, tier }) => ({ name, range, tier }))
      expect(geometry(optimized)).toEqual(geometry(reference))
      // PandaFeasting's discrete pays need interior band means. Preserve the
      // bonus-tier probability and conditional EV while allowing those means
      // and the ordinary-win balancing allocations to move.
      for (const tier of ["normal", "super", "hidden"] as const) {
        const actual = optimized.filter((bucket) => bucket.tier === tier)
        const expected = reference.filter((bucket) => bucket.tier === tier)
        expect(actual.reduce((sum, bucket) => sum + bucket.probability, 0)).toBeCloseTo(
          expected.reduce((sum, bucket) => sum + bucket.probability, 0),
          12,
        )
        expect(
          actual.reduce((sum, bucket) => sum + bucket.probability * bucket.average, 0),
        ).toBeCloseTo(
          expected.reduce((sum, bucket) => sum + bucket.probability * bucket.average, 0),
          12,
        )
      }
      expect(Object.keys(optimizationTargets(mode)).length).toBeGreaterThan(0)
      const target = BELOW_COST_TARGETS[mode]
      if (target !== undefined)
        expect(
          optimizationBuckets(mode)
            .filter((b) => b.range[1] < MODES[mode].cost)
            .reduce((sum, b) => sum + b.probability, 0),
        ).toBeCloseTo(target, 12)
    })
  }
  it("has all seven modes, including the hidden bonus buy", () => {
    expect(Object.keys(MODES)).toEqual([
      "base",
      "extraChance",
      "extraChance2",
      "featureSpin",
      "bonusFeature",
      "superBonusFeature",
      "hiddenBonusFeature",
    ])
  })
  it("registers the 1000x hidden buy with ButchEm's hidden payout targets", () => {
    const mode = game.getConfig().gameModes.hiddenBonusFeature
    expect(mode.cost).toBe(1000)
    expect(mode.isBonusBuy).toBe(true)
    expect(MODES.hiddenBonusFeature.boughtTier).toBe("hidden")
    expect(mode.resultSets.every((set) => set.userData?.tier === "hidden")).toBe(true)
    const buckets = optimizationBuckets("hiddenBonusFeature")
    expect(
      buckets.reduce((sum, bucket) => sum + bucket.probability * bucket.average, 0),
    ).toBeCloseTo(960, 10)
    expect(Math.min(...buckets.map((bucket) => bucket.range[0]))).toBe(800)
    expect(buckets.find((bucket) => bucket.range[0] === MAX_WIN)?.probability).toBe(
      1 / 5000,
    )
  })
  it.each([
    ["base", 1],
    ["extraChance", 2],
    ["extraChance2", 5],
  ] as const)("%s preserves the reference scatter-tier odds", (mode, scale) => {
    for (const [tier, frequency] of [
      ["normal", 300],
      ["super", 3000],
      ["hidden", 50000],
    ] as const)
      expect(
        mathBuckets(mode)
          .filter((b) => b.tier === tier)
          .reduce((sum, b) => sum + b.probability, 0),
      ).toBeCloseTo(scale / frequency, 12)
  })
})
