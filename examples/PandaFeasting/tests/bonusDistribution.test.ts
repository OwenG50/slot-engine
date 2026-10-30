import { describe, expect, it } from "vitest"
import {
  bonusDistribution,
  lognormalBonusDistribution,
  naturalBonusDistribution,
  purchasedBonusDistribution,
} from "../src/bonusDistribution"
import { bonusAverage, bonusMinimum, mathBuckets, optimizationBuckets } from "../src/math"
import { BONUS_MAX_EXCESS_SHARE, BONUS_TARGETS, MODES } from "../src/settings"
import { BonusTier, MAX_WIN, ModeName } from "../src/types"

// Published pre-change standard deviations, measured from the 2026-10-24 pool.
const previousSpread: Record<
  Exclude<ModeName, "featureSpin">,
  Partial<Record<BonusTier, number>>
> = {
  base: { normal: 128.64, super: 205.06, hidden: 360.32 },
  extraChance: { normal: 119.47, super: 184.75, hidden: 329.12 },
  extraChance2: { normal: 113.33, super: 173.09, hidden: 307.58 },
  bonusFeature: { normal: 132.93 },
  superBonusFeature: { super: 387.15 },
  hiddenBonusFeature: { hidden: 1158.36 },
}

describe("wide bonus payout distributions", () => {
  for (const mode of Object.keys(previousSpread) as (keyof typeof previousSpread)[]) {
    for (const tier of ["normal", "super", "hidden"] as const) {
      const oldSpread = previousSpread[mode][tier]
      if (oldSpread === undefined) continue
      it(`${mode}/${tier} preserves its floor, mean and legal payout support`, () => {
        const floor = bonusMinimum(mode, tier)
        const mean = bonusAverage(mode, tier)
        const bands = (
          MODES[mode].boughtTier ? purchasedBonusDistribution : naturalBonusDistribution
        )(tier, floor, mean)
        expect(bands[0].range[0]).toBe(floor)
        expect(bands.at(-1)!.range).toEqual([MAX_WIN, MAX_WIN])
        expect(bands.reduce((sum, b) => sum + b.probability, 0)).toBeCloseTo(1, 12)
        expect(bands.reduce((sum, b) => sum + b.probability * b.average, 0)).toBeCloseTo(
          mean,
          8,
        )
        const varianceLowerBound = bands.reduce(
          (sum, band) => sum + band.probability * (band.average - mean) ** 2,
          0,
        )
        expect(Math.sqrt(varianceLowerBound)).toBeGreaterThan(0)
        if (MODES[mode].boughtTier || tier !== "hidden")
          expect(
            (bands.at(-1)!.probability * (MAX_WIN - floor)) / (mean - floor),
          ).toBeCloseTo(BONUS_MAX_EXCESS_SHARE, 12)
        for (const [index, band] of bands.entries()) {
          expect(band.probability).toBeGreaterThan(0)
          expect(Number.isFinite(band.average)).toBe(true)
          expect(band.average).toBeGreaterThanOrEqual(band.range[0])
          expect(band.average).toBeLessThanOrEqual(band.range[1])
          if (index)
            expect(band.range[0]).toBeCloseTo(bands[index - 1].range[1] + 0.01, 8)
        }
        const selected = optimizationBuckets(mode).filter((band) => band.tier === tier)
        const mass = selected.reduce((sum, band) => sum + band.probability, 0)
        const frequency = MODES[mode].bonusFrequencyMultiplier
        expect(mass).toBeCloseTo(
          MODES[mode].boughtTier ? 1 : frequency / BONUS_TARGETS[tier].oneIn,
          12,
        )
      })
    }
  }
  it.each([
    [0, 96],
    [100, 96],
    [1, MAX_WIN],
    [NaN, 96],
    [1, Infinity],
  ])("rejects invalid floor/mean %s/%s", (floor, mean) => {
    expect(() => bonusDistribution("normal", floor, mean)).toThrow("requires")
  })
  it.each([1500, 2100])("rejects unfundable natural Hidden budget %s", (mean) => {
    expect(() => naturalBonusDistribution("hidden", 1011, mean)).toThrow("cannot fund")
  })
  it("rejects a mean below the first reference band's conditional mean", () => {
    expect(() => bonusDistribution("normal", 16, 17)).toThrow("cannot fund")
  })
  it.each([0, -1, NaN, Infinity])("rejects invalid lognormal spread %s", (sigma) => {
    expect(() => lognormalBonusDistribution(50, 960, sigma)).toThrow("spread")
  })
})
describe("purchased single-peaked band probabilities", () => {
  it.each([
    ["normal", 1, 96, 20, 0.2227049904990499],
    ["super", 10, 288, 100, 0.29672172172172173],
    ["hidden", 50, 960, 200, 0.23308542713567837],
  ] as const)(
    "%s has progressively rarer bands away from its peak",
    (tier, floor, mean, lower, probability) => {
      const bands = purchasedBonusDistribution(tier, floor, mean)
      const peak = bands.findIndex((b) => b.range[0] === lower)
      expect(bands[peak].probability).toBeCloseTo(probability, 12)
      expect(bands.reduce((sum, b) => sum + b.probability, 0)).toBeCloseTo(1, 12)
      expect(bands.reduce((sum, b) => sum + b.probability * b.average, 0)).toBeCloseTo(
        mean,
        9,
      )
      for (let i = 1; i < bands.length; i++) {
        if (i <= peak)
          expect(bands[i].probability).toBeGreaterThan(bands[i - 1].probability)
        else expect(bands[i].probability).toBeLessThan(bands[i - 1].probability)
      }
      const previous = bonusDistribution(tier, floor, mean)
      const low = tier === "normal" ? 10 : tier === "super" ? 50 : 100
      const mass = (rows: typeof bands) =>
        rows.filter((b) => b.range[1] < low).reduce((sum, b) => sum + b.probability, 0)
      expect(mass(bands)).toBeLessThan(mass(previous))
    },
  )
  it("lets about 21% of Super buys recover cost with a spread RTP tail", () => {
    const bands = purchasedBonusDistribution("super", 10, 288)
    const sum = (filter: (b: (typeof bands)[number]) => boolean, ev = false) =>
      bands.filter(filter).reduce((s, b) => s + b.probability * (ev ? b.average : 1), 0)
    const recovery = sum((b) => b.range[0] >= 300)
    expect(recovery).toBeGreaterThan(0.2)
    expect(recovery).toBeLessThan(0.23)
    expect(sum((b) => b.range[0] >= 200 && b.range[1] < 500, true) / 288).toBeLessThan(0.3)
    expect(sum((b) => b.range[0] >= 1000, true) / 288).toBeGreaterThan(0.3)
  })
  it("keeps the Hidden buy median well below cost while funding a heavy tail", () => {
    const bands = purchasedBonusDistribution("hidden", 50, 960)
    const sum = (filter: (b: (typeof bands)[number]) => boolean) =>
      bands.filter(filter).reduce((s, b) => s + b.probability, 0)
    expect(sum((b) => b.range[1] < 500)).toBeGreaterThan(0.5)
    expect(sum((b) => b.range[0] >= 1000)).toBeGreaterThan(0.23)
    expect(sum((b) => b.range[0] >= 1000)).toBeLessThan(0.26)
    expect(sum((b) => b.range[0] >= 2000)).toBeGreaterThan(0.1)
    expect(sum((b) => b.range[0] >= 5000)).toBeGreaterThan(0.02)
  })
  it("rejects unsupported floors and unfundable averages", () => {
    expect(() => purchasedBonusDistribution("normal", 2, 96)).toThrow(
      "configured tier floor",
    )
    expect(() => purchasedBonusDistribution("normal", 1, 20)).toThrow("cannot fund")
    expect(() => purchasedBonusDistribution("normal", 1, Infinity)).toThrow("requires")
  })
})

describe("natural-only mean and tail rebalance", () => {
  const oldMeans = {
    base: { normal: 96, super: 288, hidden: 960 },
    extraChance: { normal: 92, super: 280, hidden: 940 },
    extraChance2: { normal: 90, super: 276, hidden: 930 },
  } as const
  for (const mode of ["base", "extraChance", "extraChance2"] as const) {
    it(`${mode} funds stronger Hidden bonuses with small Normal/Super mean reductions`, () => {
      for (const tier of ["normal", "super", "hidden"] as const) {
        const mean = bonusAverage(mode, tier)
        if (tier === "hidden") expect(mean).toBeGreaterThan(oldMeans[mode][tier])
        else {
          expect(mean).toBeLessThan(oldMeans[mode][tier])
          expect(mean).toBeGreaterThan(oldMeans[mode][tier] * 0.95)
        }
        const floor = bonusMinimum(mode, tier)
        const bands = naturalBonusDistribution(tier, floor, mean)
        const before = bonusDistribution(
          tier,
          tier === "hidden" ? 800 : floor,
          oldMeans[mode][tier],
        )
        const premium = (rows: typeof bands) =>
          rows
            .filter((band) => band.range[0] >= 5000)
            .reduce((sum, band) => sum + band.probability, 0)
        if (tier === "hidden") expect(premium(bands)).toBeGreaterThan(premium(before))
        if (tier === "hidden") {
          expect(floor).toBe(1011)
          expect(premium(bands)).toBeCloseTo(0.0309, 12)
          expect(premium(bands)).toBeGreaterThan(0.01)
        }
      }
    })
    it(`${mode} transfers every saved unit of bonus EV into ordinary wins`, () => {
      const buckets = optimizationBuckets(mode)
      const bonusMass = buckets
        .filter((band) => band.tier)
        .reduce((sum, band) => sum + band.probability, 0)
      const savedEv = (["normal", "super", "hidden"] as const).reduce(
        (sum, tier) =>
          sum +
          MODES[mode].bonusFrequencyMultiplier *
            (oldMeans[mode][tier] / { normal: 300, super: 3000, hidden: 50000 }[tier] -
              bonusAverage(mode, tier) / BONUS_TARGETS[tier].oneIn),
        0,
      )
      const priorBonusEv = (["normal", "super", "hidden"] as const).reduce(
        (sum, tier) =>
          sum +
          (MODES[mode].bonusFrequencyMultiplier /
            { normal: 300, super: 3000, hidden: 50000 }[tier]) *
            oldMeans[mode][tier],
        0,
      )
      const expectedOrdinary = MODES[mode].cost * 0.96 - priorBonusEv + savedEv
      expect(savedEv).toBeGreaterThan(0)
      for (const bands of [mathBuckets(mode), buckets]) {
        const ordinary = bands.filter((band) => !band.tier && band.average > 0)
        expect(
          ordinary.reduce((sum, band) => sum + band.probability * band.average, 0),
        ).toBeCloseTo(expectedOrdinary, 10)
        expect(ordinary.reduce((sum, band) => sum + band.probability, 0)).toBeCloseTo(
          MODES[mode].hitRate - bonusMass,
          12,
        )
      }
    })
  }
  it.each([
    ["bonusFeature", "normal", 1, 96],
    ["superBonusFeature", "super", 10, 288],
    ["hiddenBonusFeature", "hidden", 50, 960],
  ] as const)(
    "%s keeps its buy floor and mean while wiring every distribution band",
    (mode, tier, floor, mean) => {
      expect(bonusAverage(mode, tier)).toBe(mean)
      const expected = purchasedBonusDistribution(tier, floor, mean)
      expect(
        optimizationBuckets(mode).map(({ name, range, probability, average }) => ({
          name,
          range,
          probability,
          average,
        })),
      ).toEqual(expected.map((band) => ({ ...band, name: `${tier}_${band.name}` })))
    },
  )
})

describe("middle-weighted bonus distributions", () => {
  const previousBuySpread = { normal: 1.3, super: 1.35, hidden: 1.75 }
  const previousNaturalSpread = { normal: 1.55, super: 1.65 }
  const mass = (
    bands: ReturnType<typeof bonusDistribution>,
    lower: number,
    upper: number,
  ) =>
    bands
      .filter((band) => band.range[0] >= lower && band.range[1] < upper)
      .reduce((sum, band) => sum + band.probability, 0)

  for (const mode of Object.keys(previousSpread) as (keyof typeof previousSpread)[]) {
    for (const tier of ["normal", "super", "hidden"] as const) {
      if (previousSpread[mode][tier] === undefined) continue
      it(`${mode}/${tier} follows chart bands while preserving Hidden targets`, () => {
        const floor = bonusMinimum(mode, tier)
        const mean = bonusAverage(mode, tier)
        if (!MODES[mode].boughtTier && tier === "hidden") {
          const bands = naturalBonusDistribution(tier, floor, mean)
          expect(mass(bands, floor, 1500)).toBeCloseTo(0.3, 12)
          expect(mass(bands, 1500, 5000)).toBeCloseTo(0.6691, 12)
          expect(mass(bands, 5000, Infinity)).toBeCloseTo(0.0309, 12)
          expect(bands[1].average).toBeGreaterThanOrEqual(1500)
          return
        }
        const bought = !!MODES[mode].boughtTier
        const previousSigma =
          bought || tier === "hidden"
            ? previousBuySpread[tier]
            : previousNaturalSpread[tier]
        const before = lognormalBonusDistribution(floor, mean, previousSigma)
        const after = (bought ? bonusDistribution : naturalBonusDistribution)(
          tier,
          floor,
          mean,
        )
        if (tier === "hidden") {
          expect(after).toEqual(before)
        } else if (tier === "normal") {
          expect(mass(after, 20, 50)).toBeLessThan(mass(before, 20, 50) * 0.7)
          expect(mass(after, floor, 20)).toBeGreaterThan(mass(before, floor, 20))
          expect(mass(after, 50, 500)).toBeGreaterThan(mass(before, 50, 500))
          if (bought) expect(mass(after, 20, 50)).toBeCloseTo(0.1611, 3)
        } else {
          expect(mass(after, 200, 500)).toBeGreaterThan(mass(before, 200, 500))
          if (bought)
            expect(mass(after, floor, 50)).toBeGreaterThan(mass(before, floor, 50))
          expect(mass(after, 100, 200)).toBeLessThan(mass(before, 100, 200))
        }
      })
    }
  }
})

describe("rarer natural Hidden entries fund higher typical payouts", () => {
  it.each([
    ["base", 62500, 1400, 92, 276],
    ["extraChance", 31250, 1380, 88, 268],
    ["extraChance2", 12500, 1370, 86, 264],
  ] as const)(
    "%s preserves Hidden EV while funding a median of at least 1500x",
    (mode, oneIn, previousMean, normalMean, superMean) => {
      const mean = bonusAverage(mode, "hidden")
      const oldFrequency = MODES[mode].bonusFrequencyMultiplier / 50000
      const expectedFrequency = 1 / oneIn
      expect(mean).toBe(previousMean * 1.25)
      const buckets = optimizationBuckets(mode).filter((b) => b.tier === "hidden")
      expect(buckets.reduce((sum, b) => sum + b.probability, 0)).toBeCloseTo(
        expectedFrequency,
        12,
      )
      expect(buckets.reduce((sum, b) => sum + b.probability * b.average, 0)).toBeCloseTo(
        oldFrequency * previousMean,
        12,
      )
      expect(bonusAverage(mode, "normal")).toBe(normalMean)
      expect(bonusAverage(mode, "super")).toBe(superMean)
      const bands = naturalBonusDistribution("hidden", bonusMinimum(mode, "hidden"), mean)
      expect(bands[0].range).toEqual([1011, 1499.99])
      expect(bands[0].probability).toBe(0.3)
      expect(bands[1].range).toEqual([1500, 1999.99])
      expect(bands[1].probability).toBeCloseTo(0.6191, 12)
      expect(bands[0].probability).toBeLessThan(0.5)
      expect(bands[0].probability + bands[1].probability).toBeGreaterThan(0.5)
      expect(bands[1].average).toBeGreaterThan(1600)
    },
  )
})

describe("natural Normal/Super spread", () => {
  const median = (bands: { range: [number, number]; probability: number }[]) => {
    let cumulative = 0
    for (const band of bands) {
      if (cumulative + band.probability >= 0.5)
        return (
          band.range[0] +
          ((band.range[1] - band.range[0]) * (0.5 - cumulative)) / band.probability
        )
      cumulative += band.probability
    }
    return MAX_WIN
  }
  for (const mode of ["base", "extraChance", "extraChance2"] as const) {
    for (const [tier, low, high] of [
      ["normal", 38, 44],
      ["super", 135, 155],
    ] as const) {
      it(`${mode}/${tier} lowers its median at the same mean`, () => {
        const floor = bonusMinimum(mode, tier)
        const mean = bonusAverage(mode, tier)
        const spread = naturalBonusDistribution(tier, floor, mean)
        const flat = bonusDistribution(tier, floor, mean)
        const ev = spread.reduce((sum, band) => sum + band.probability * band.average, 0)
        expect(ev).toBeCloseTo(mean, 8)
        expect(median(spread)).toBeLessThan(median(flat))
        expect(median(spread)).toBeGreaterThan(low)
        expect(median(spread)).toBeLessThan(high)
      })
    }
  }
})
