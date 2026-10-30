import { describe, expect, it } from "vitest"
import { fitBonusProgression, type ProgressionBand } from "../src/bonusProgressionWeights"

describe("bonus progression entropy fit", () => {
  it("preserves a rare band's conditional mean rather than only its tiny EV error", () => {
    const rare = {
      name: "rare",
      probability: 1e-8,
      average: 7500,
      samples: [
        { id: 1, payout: 5000, stage: 6, spins: 20, hits: 10, weight: 3 },
        { id: 2, payout: 10000, stage: 6, spins: 20, hits: 10, weight: 1 },
      ],
    }
    const fit = fitBonusProgression(
      [
        {
          name: "common",
          probability: 1 - rare.probability,
          average: 10,
          samples: [{ id: 0, payout: 10, stage: 1, spins: 5, hits: 1, weight: 1 }],
        },
        rare,
      ],
      undefined,
      [1, 0, 0, 0, 0, 0],
      [],
      false,
    )
    const mass = rare.samples.reduce(
      (sum, sample) => sum + fit.weights.get(sample.id)!,
      0,
    )
    const mean =
      rare.samples.reduce(
        (sum, sample) => sum + sample.payout * fit.weights.get(sample.id)!,
        0,
      ) / mass
    expect(mass).toBeCloseTo(rare.probability, 14)
    expect(mean).toBeCloseTo(7500, 3)
  })
  it("does not impose historical reach targets when reach fitting is disabled", () => {
    const bands = [
      {
        name: "wide",
        probability: 1,
        average: 20,
        samples: [
          { id: 1, payout: 10, stage: 1, spins: 5, hits: 1, weight: 1 },
          { id: 2, payout: 30, stage: 6, spins: 10, hits: 8, weight: 1 },
        ],
      },
    ]
    const fit = fitBonusProgression(
      bands,
      undefined,
      [1, 0.99, 0.9, 0.8, 0.7, 0.6],
      [],
      false,
    )
    expect(fit.weights.get(1)).toBeCloseTo(0.5, 10)
    expect(fit.weights.get(2)).toBeCloseTo(0.5, 10)
    expect(fit.stageReach).toEqual([1, 0.5, 0.5, 0.5, 0.5, 0.5])
  })
  it("fits stage reach and payout means independently of spin hits without a hit target", () => {
    let id = 0
    const samples = [1, 2].flatMap((stage) =>
      [0, 5].flatMap((hits) =>
        [10, 30].map((payout) => ({
          id: id++,
          stage,
          hits,
          spins: 5,
          payout,
          weight: hits === 5 ? 3 : 1,
        })),
      ),
    )
    const reach = [1, 0.4, 0, 0, 0, 0]
    const fit = fitBonusProgression(
      [{ name: "natural", probability: 1, average: 20, samples }],
      undefined,
      reach,
      [20, 20, 20, 20, 20, 20],
    )
    expect(fit.hitRate).toBeCloseTo(0.75, 10)
    expect(fit.stageReach[1]).toBeCloseTo(0.4, 5)
    expect(
      samples.reduce(
        (sum, sample) => sum + sample.payout * fit.weights.get(sample.id)!,
        0,
      ),
    ).toBeCloseTo(20, 8)
    const changed = fitBonusProgression(
      [
        {
          name: "natural",
          probability: 1,
          average: 20,
          samples: samples.map((sample) => ({ ...sample, hits: 0, spins: 30 })),
        },
      ],
      undefined,
      reach,
      [20, 20, 20, 20, 20, 20],
    )
    for (const [id, weight] of fit.weights)
      expect(changed.weights.get(id)).toBeCloseTo(weight, 12)
  })
  it("fits conditional stage payouts alongside reach, band means and spin hits", () => {
    let id = 0
    const samples = [1, 2].flatMap((stage) =>
      [1, 2].flatMap((hits) =>
        [30, 40, 50, 60, 70].map((payout) => ({
          id: id++,
          stage,
          hits,
          spins: 5,
          payout,
          weight: 1,
        })),
      ),
    )
    const fit = fitBonusProgression(
      [{ name: "one", probability: 1, average: 50, samples }],
      0.3,
      [1, 0.5, 0, 0, 0, 0],
      [40, 60, 80, 100, 200, 300],
    )
    expect(fit.hitRate).toBeCloseTo(0.3, 7)
    for (const stage of [1, 2]) {
      const rows = samples.filter((sample) => sample.stage === stage)
      const mass = rows.reduce((sum, row) => sum + fit.weights.get(row.id)!, 0)
      const average =
        rows.reduce((sum, row) => sum + row.payout * fit.weights.get(row.id)!, 0) / mass
      expect(mass).toBeCloseTo(0.5, 5)
      expect(Math.abs(average - (stage === 1 ? 40 : 60))).toBeLessThan(3)
    }
  })
  it("matches stage reach and hits while preserving different band masses and means", () => {
    let id = 0
    const bands: ProgressionBand[] = [
      { name: "low", probability: 0.7, average: 10, samples: [] },
      { name: "high", probability: 0.3, average: 100, samples: [] },
    ]
    for (const band of bands)
      for (const stage of [1, 2, 3, 4, 5, 6])
        for (const hits of [1, 4])
          for (const factor of [0.8, 1.2])
            band.samples.push({
              id: id++,
              stage,
              hits,
              spins: 5,
              payout: band.average * factor,
              weight: 1,
            })
    const targets = [1, 0.4, 0.15, 0.05, 0.005, 0.0005]
    const fit = fitBonusProgression(bands, 0.3, targets)
    expect(fit.hitRate).toBeCloseTo(0.3, 8)
    fit.stageReach.forEach((rate, index) => expect(rate).toBeCloseTo(targets[index], 5))
    for (const band of bands) {
      const mass = band.samples.reduce(
        (sum, sample) => sum + fit.weights.get(sample.id)!,
        0,
      )
      const ev = band.samples.reduce(
        (sum, sample) => sum + sample.payout * fit.weights.get(sample.id)!,
        0,
      )
      expect(mass).toBeCloseTo(band.probability, 10)
      expect(ev / mass).toBeCloseTo(band.average, 7)
    }
  })
  it("treats unsupported progression as a soft goal without changing payout or hit promises", () => {
    const fit = fitBonusProgression(
      [
        {
          name: "only",
          probability: 1,
          average: 10,
          samples: [1, 2].map((hits, id) => ({
            id,
            stage: 1,
            hits,
            spins: 5,
            payout: 10,
            weight: 1,
          })),
        },
      ],
      0.3,
      [1, 0.4, 0.2, 0.1, 0.01, 0.001],
    )
    expect(fit.hitRate).toBeCloseTo(0.3, 8)
    expect(fit.stageReach).toEqual([1, 0, 0, 0, 0, 0])
  })
  it("rejects a hit target that cannot be achieved rather than silently altering it", () => {
    expect(() =>
      fitBonusProgression(
        [
          {
            name: "only",
            probability: 1,
            average: 10,
            samples: [{ id: 1, stage: 1, hits: 1, spins: 5, payout: 10, weight: 1 }],
          },
        ],
        0.3,
        [1, 0.4, 0.2, 0.1, 0.01, 0.001],
      ),
    ).toThrow("cannot preserve")
  })
})
