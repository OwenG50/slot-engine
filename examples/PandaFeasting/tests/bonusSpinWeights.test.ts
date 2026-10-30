import { describe, expect, it } from "vitest"
import { fitBonusHitRate } from "../src/bonusSpinWeights"
import { bonusSpinStats } from "../src/bonusSpinStats"
import type { GameEvent } from "../src/types"

describe("bonus spin hit-rate calibration", () => {
  it("retains payout values and fits spin-weighted hit rates rather than averaging round ratios", () => {
    const samples = [
      { id: 1, payout: 10, spins: 5, hits: 1, weight: 1 },
      { id: 2, payout: 10, spins: 5, hits: 3, weight: 1 },
      { id: 3, payout: 30, spins: 10, hits: 2, weight: 1 },
      { id: 4, payout: 30, spins: 10, hits: 6, weight: 1 },
    ]
    const original = structuredClone(samples)
    const fitted = fitBonusHitRate(
      [{ name: "test", probability: 1, average: 20, samples }],
      0.3,
    )
    expect(fitted.hitRate).toBeCloseTo(0.3, 8)
    const sum = (value: (sample: (typeof samples)[number]) => number) =>
      samples.reduce(
        (acc, sample) => acc + fitted.weights.get(sample.id)! * value(sample),
        0,
      )
    expect(sum(() => 1)).toBeCloseTo(1, 10)
    expect(sum((sample) => sample.payout)).toBeCloseTo(20, 8)
    expect(sum((sample) => sample.hits) / sum((sample) => sample.spins)).toBeCloseTo(
      0.3,
      8,
    )
    expect(samples).toEqual(original)
  })

  it("preserves each payout band probability separately", () => {
    const bands = [10, 30].map((payout, i) => ({
      name: String(payout),
      probability: i ? 0.7 : 0.3,
      average: payout,
      samples: [1, 3].map((hits, j) => ({
        id: i * 2 + j,
        payout,
        spins: 5,
        hits,
        weight: 1,
      })),
    }))
    const fit = fitBonusHitRate(bands, 0.35)
    bands.forEach((band) =>
      expect(band.samples.reduce((s, r) => s + fit.weights.get(r.id)!, 0)).toBeCloseTo(
        band.probability,
        10,
      ),
    )
    expect(fit.hitRate).toBeCloseTo(0.35, 8)
  })

  it("rejects unsupported targets instead of changing payouts or inventing losing spins", () => {
    const bands = [
      {
        name: "dense",
        probability: 1,
        average: 10,
        samples: [{ id: 1, payout: 10, spins: 5, hits: 4, weight: 1 }],
      },
    ]
    expect(() => fitBonusHitRate(bands, 0.3)).toThrow("outside the sampled")
  })

  it.each([0.1, 0.9])(
    "uses the nearest feasible rate for sample-limited target %s without changing band masses or means",
    (target) => {
      const bands = [
        {
          name: "low",
          probability: 0.7,
          average: 20,
          samples: [
            { id: 1, payout: 10, spins: 5, hits: 1, weight: 1 },
            { id: 2, payout: 20, spins: 10, hits: 4, weight: 1 },
            { id: 3, payout: 30, spins: 5, hits: 3, weight: 1 },
          ],
        },
        {
          name: "high",
          probability: 0.3,
          average: 50,
          samples: [
            { id: 4, payout: 50, spins: 5, hits: 3, weight: 1 },
            { id: 5, payout: 50, spins: 5, hits: 4, weight: 1 },
          ],
        },
      ]
      const original = structuredClone(bands)
      const fit = fitBonusHitRate(bands, target, { unsupportedTarget: "nearest" })
      expect(fit.targetReached).toBe(false)
      expect(fit.supportedRange).toEqual([
        expect.closeTo(3.7 / 8.5, 10),
        expect.closeTo(0.52, 10),
      ])
      expect(fit.hitRate).toBeCloseTo(target < 0.5 ? 3.7 / 8.5 : 0.52, 10)
      for (const band of bands) {
        expect(
          band.samples.reduce((sum, sample) => sum + fit.weights.get(sample.id)!, 0),
        ).toBeCloseTo(band.probability, 10)
        expect(
          band.samples.reduce(
            (sum, sample) => sum + fit.weights.get(sample.id)! * sample.payout,
            0,
          ),
        ).toBeCloseTo(band.average * band.probability, 10)
      }
      expect(bands).toEqual(original)
    },
  )

  it("fits exact supported endpoints that require zero probability on other samples", () => {
    const fit = fitBonusHitRate(
      [
        {
          name: "endpoint",
          probability: 1,
          average: 20,
          samples: [
            { id: 1, payout: 10, spins: 5, hits: 1, weight: 1 },
            { id: 2, payout: 20, spins: 5, hits: 3, weight: 1 },
            { id: 3, payout: 30, spins: 5, hits: 1, weight: 1 },
          ],
        },
      ],
      0.2,
    )
    expect(fit.targetReached).toBe(true)
    expect(fit.hitRate).toBeCloseTo(0.2, 8)
    expect(fit.weights.get(1)).toBeCloseTo(0.5, 8)
    expect(fit.weights.get(3)).toBeCloseTo(0.5, 8)
  })

  it("solves stiff feasible cases beyond the exponential bracket", () => {
    const fit = fitBonusHitRate(
      [
        {
          name: "stiff",
          probability: 1,
          average: 20,
          samples: [
            { id: 1, payout: 20, spins: 5, hits: 1, weight: 1e-300 },
            { id: 2, payout: 20, spins: 5, hits: 2, weight: 1 },
          ],
        },
      ],
      0.25,
    )
    expect(fit.targetReached).toBe(true)
    expect(fit.hitRate).toBeCloseTo(0.25, 8)
    expect(fit.weights.get(1)).toBeCloseTo(0.75, 8)
  })

  it("retains a preference for higher stages while preserving hit and payout constraints", () => {
    const samples = [
      { id: 1, payout: 10, spins: 5, hits: 1, weight: 1, stage: 1 },
      { id: 2, payout: 10, spins: 5, hits: 3, weight: 1, stage: 3 },
      { id: 3, payout: 30, spins: 5, hits: 1, weight: 1, stage: 3 },
      { id: 4, payout: 30, spins: 5, hits: 3, weight: 1, stage: 1 },
    ]
    const baseline = fitBonusHitRate(
      [{ name: "stages", probability: 1, average: 20, samples }],
      0.4,
    )
    const fit = fitBonusHitRate(
      [
        {
          name: "stages",
          probability: 1,
          average: 20,
          samples: samples.map((sample) => ({
            ...sample,
            weight: Math.exp(sample.stage - 1),
          })),
        },
      ],
      0.4,
    )
    const mean = (
      weights: Map<number, number>,
      value: (sample: (typeof samples)[number]) => number,
    ) => samples.reduce((sum, sample) => sum + weights.get(sample.id)! * value(sample), 0)
    expect(fit.hitRate).toBeCloseTo(0.4, 10)
    expect(mean(fit.weights, (sample) => sample.payout)).toBeCloseTo(20, 10)
    expect(mean(fit.weights, () => 1)).toBeCloseTo(1, 10)
    expect(mean(fit.weights, (sample) => sample.stage)).toBeGreaterThan(
      mean(baseline.weights, (sample) => sample.stage),
    )
    expect(fit.weights.get(2)! + fit.weights.get(3)!).toBeGreaterThan(0.8)
  })

  it("preserves the payout fit without biasing hit counts when no target is supplied", () => {
    const samples = [
      { id: 1, payout: 10, spins: 5, hits: 0, weight: 1 },
      { id: 2, payout: 10, spins: 5, hits: 5, weight: 3 },
      { id: 3, payout: 30, spins: 10, hits: 9, weight: 1 },
    ]
    const fit = fitBonusHitRate(
      [{ name: "natural", probability: 1, average: 20, samples }],
      undefined,
    )
    expect(fit.weights.get(1)).toBeCloseTo(0.125, 10)
    expect(fit.weights.get(2)).toBeCloseTo(0.375, 10)
    expect(fit.weights.get(3)).toBeCloseTo(0.5, 10)
    expect(fit.hitRate).toBeCloseTo(0.85, 10)
    const changed = fitBonusHitRate(
      [
        {
          name: "natural",
          probability: 1,
          average: 20,
          samples: samples.map((sample) => ({ ...sample, hits: 0 })),
        },
      ],
      undefined,
    )
    for (const [id, weight] of fit.weights)
      expect(changed.weights.get(id)).toBeCloseTo(weight, 12)
  })

  it("counts paid H/L bonus lines independently of spin hits and excludes trigger lines", () => {
    const event = (type: string, data: Record<string, unknown> = {}): GameEvent => ({
      type,
      data,
    })
    const result = bonusSpinStats([
      event("reveal"),
      event("winInfo", { wins: [{ symbol: "H1", win: 30 }] }),
      event("freeSpinTrigger", { tier: "normal" }),
      event("reveal"),
      event("winInfo", {
        wins: [
          { symbol: "H2", win: 4 },
          { symbol: "L1", win: 1 },
          { symbol: "L2", win: 0 },
        ],
      }),
      event("reveal"),
      event("winInfo", { wins: [{ symbol: "H3", win: 3 }] }),
      event("freeSpinEnd"),
    ])
    expect(result).toMatchObject({
      spins: 2,
      hits: 2,
      highOnly: 1,
      highLines: 2,
      paidLines: 3,
    })
  })

  it("excludes trigger wins, treats multiple win lines as one hit and includes losing final spins", () => {
    const event = (type: string, data: Record<string, unknown> = {}): GameEvent => ({
      type,
      data,
    })
    const result = bonusSpinStats([
      event("reveal"),
      event("winInfo", { wins: [{ symbol: "H1", win: 10 }] }),
      event("freeSpinTrigger", { tier: "super" }),
      event("reveal"),
      event("winInfo", {
        wins: [
          { symbol: "H1", win: 2 },
          { symbol: "H2", win: 3 },
        ],
      }),
      event("reveal"),
      event("winInfo", { wins: [{ symbol: "L1", win: 0 }] }),
      event("newStageUnlocked", { stage: 3 }),
      event("freeSpinEnd"),
    ])
    expect(result).toEqual({
      tier: "super",
      spins: 2,
      hits: 1,
      highOnly: 1,
      maxStage: 3,
      highLines: 2,
      paidLines: 2,
    })
  })
})
