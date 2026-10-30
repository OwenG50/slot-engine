import { describe, expect, it } from "vitest"
import {
  mathBuckets,
  optimizationBuckets,
  optimizationTargets,
  validateBuckets,
  BELOW_COST_TARGETS,
  bonusMinimum,
  bonusMaxWinProbability,
} from "../src/math"
import { MODES, MAX_WIN_ONE_IN } from "../src/settings"
import { game } from ".."
import { MAX_WIN, ModeName } from "../src/types"
describe("PandaFeasting distribution targets", () => {
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
      expect(Object.keys(optimizationTargets(mode)).length).toBeGreaterThan(0)
      for (const target of Object.values(optimizationTargets(mode)))
        expect(target).not.toHaveProperty("scale")
      const target = BELOW_COST_TARGETS[mode]
      if (target !== undefined)
        expect(
          optimizationBuckets(mode)
            .filter((b) => b.range[1] < MODES[mode].cost)
            .reduce((sum, b) => sum + b.probability, 0),
        ).toBeCloseTo(target, 12)
    })
  }
  it.each([
    ["bonusFeature", "normal", 1],
    ["superBonusFeature", "super", 10],
    ["hiddenBonusFeature", "hidden", 50],
  ] as const)(
    "%s has its own buy floor and broad lower-return coverage",
    (mode, tier, minimum) => {
      expect(bonusMinimum(mode, tier)).toBe(minimum)
      const bands = optimizationBuckets(mode)
      expect(Math.min(...bands.map((band) => band.range[0]))).toBe(minimum)
      expect(bands.length).toBeGreaterThanOrEqual(8)
    },
  )
  it.each(["base", "extraChance", "extraChance2"] as const)(
    "%s preserves natural bonus floors",
    (mode) => {
      expect(
        ["normal", "super", "hidden"].map((tier) =>
          bonusMinimum(mode, tier as "normal" | "super" | "hidden"),
        ),
      ).toEqual([16, 87, 1011])
      for (const [tier, minimum] of [
        ["normal", 16],
        ["super", 87],
        ["hidden", 1011],
      ] as const) {
        const bands = optimizationBuckets(mode).filter((band) => band.tier === tier)
        expect(Math.min(...bands.map((band) => band.range[0]))).toBe(minimum)
        expect(bands.every((band) => band.average >= minimum)).toBe(true)
      }
    },
  )
  it.each(Object.keys(MODES) as ModeName[])(
    "%s keeps the same max odds between math and optimization targets",
    (mode) => {
      const probability = (bands: ReturnType<typeof mathBuckets>) =>
        bands
          .filter((band) => band.range[0] === MAX_WIN)
          .reduce((sum, band) => sum + band.probability, 0)
      expect(probability(mathBuckets(mode))).toBeCloseTo(
        probability(optimizationBuckets(mode)),
        12,
      )
      if (mode === "featureSpin")
        expect(probability(mathBuckets(mode))).toBeCloseTo(
          1 / MAX_WIN_ONE_IN.featureSpin,
          12,
        )
    },
  )
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
  it("registers the 1000x hidden buy with Panda hidden payout targets", () => {
    const mode = game.getConfig().gameModes.hiddenBonusFeature
    expect(mode.cost).toBe(1000)
    expect(mode.isBonusBuy).toBe(true)
    expect(MODES.hiddenBonusFeature.boughtTier).toBe("hidden")
    expect(mode.resultSets.every((set) => set.userData?.tier === "hidden")).toBe(true)
    const buckets = optimizationBuckets("hiddenBonusFeature")
    expect(
      buckets.reduce((sum, bucket) => sum + bucket.probability * bucket.average, 0),
    ).toBeCloseTo(960, 10)
    expect(Math.min(...buckets.map((bucket) => bucket.range[0]))).toBe(50)
    expect(buckets.find((bucket) => bucket.range[0] === MAX_WIN)?.probability).toBe(
      bonusMaxWinProbability("hiddenBonusFeature", "hidden"),
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
      ["hidden", 62500],
    ] as const)
      expect(
        mathBuckets(mode)
          .filter((b) => b.tier === tier)
          .reduce((sum, b) => sum + b.probability, 0),
      ).toBeCloseTo(scale / frequency, 12)
  })
})

describe("Panda wild-feature payout bands", () => {
  it("broadens FeatureSpin toward the reference while preserving price, mean and max odds", () => {
    const bands = mathBuckets("featureSpin")
    const old = bands.map((band) => ({ ...band }))
    for (const [name, probability, average] of [
      ["feature_loss", 0.2, 0],
      ["feature_under_025", 0.005, 0.15],
      ["feature_025_05", 0.01, 0.35],
      ["feature_05_1", 0.015, 0.7],
      ["feature_1_2", 0.025, 1.5],
      ["feature_2_5", 0.075, 3.5],
      ["feature_5_10", 0.1, 7],
      ["feature_10_25", 0.215, 20],
      ["feature_25_50", 0.155, 40],
      ["feature_50_100", 0.1, 70],
      ["feature_250_500", 0.023, 350],
      ["feature_500_1K", 0.0045, 700],
      ["feature_1K_2K", 0.0005, 1400],
      ["feature_2K_3K", 0.0002, 2400],
      ["feature_3K_5K", 0.0001, 3600],
      ["feature_5K_10K", 0.00019, 6000],
    ] as const)
      Object.assign(old.find((band) => band.name === name)!, { probability, average })
    const balance = old.find((band) => band.range[0] === 100)!
    const fixed = old.filter((band) => band !== balance)
    balance.probability = 1 - fixed.reduce((sum, band) => sum + band.probability, 0)
    balance.average =
      (48 - fixed.reduce((sum, band) => sum + band.probability * band.average, 0)) /
      balance.probability
    const varianceOfBandMeans = (curve: typeof bands) =>
      curve.reduce((sum, band) => sum + band.probability * (band.average - 48) ** 2, 0)
    expect(varianceOfBandMeans(bands)).toBeGreaterThan(varianceOfBandMeans(old) * 1.25)
    expect(MODES.featureSpin.cost).toBe(50)
    expect(
      bands.reduce((sum, band) => sum + band.probability * band.average, 0),
    ).toBeCloseTo(48, 12)
    expect(bands.find((band) => band.name === "feature_loss")!.probability).toBeCloseTo(
      0.28,
      12,
    )
    const atLeast = (minimum: number, curve = bands) =>
      curve
        .filter((band) => band.range[0] >= minimum)
        .reduce((sum, band) => sum + band.probability, 0)
    expect(atLeast(500)).toBeCloseTo(0.02076, 12)
    expect(atLeast(1000)).toBeCloseTo(0.00326, 12)
    expect(atLeast(2000)).toBeCloseTo(0.00056, 12)
    expect(atLeast(5000)).toBeCloseTo(0.0001, 12)
    expect(atLeast(1000)).toBeGreaterThan(atLeast(1000, old) * 3)
    expect(atLeast(10000)).toBeCloseTo(1 / 60_000, 12)
    expect(BELOW_COST_TARGETS.featureSpin).toBeUndefined()
  })
  it("uses disjoint payout bands without inherited coverage-count groups", () => {
    const bands = optimizationBuckets("featureSpin").sort(
      (a, b) => a.range[0] - b.range[0],
    )
    expect(bands.length).toBe(18)
    for (let i = 0; i < bands.length; i++) {
      expect(bands[i]).not.toHaveProperty("coverageBand")
      if (i) expect(bands[i].range[0]).toBeGreaterThan(bands[i - 1].range[1])
    }
    expect(
      bands.filter((b) => b.range[1] < 50).reduce((sum, b) => sum + b.probability, 0),
    ).toBeCloseTo(0.829, 12)
  })
})
