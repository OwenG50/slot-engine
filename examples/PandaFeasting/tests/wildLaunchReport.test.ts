import { describe, expect, it } from "vitest"
import { launchAccumulator, wildLaunches } from "../scripts/reportWildLaunches"
import { GameEvent } from "../src/types"
import { fitFullScreenStages } from "../src/fullScreenWeights"

const reveal = (natural = false): GameEvent => ({
  type: "reveal",
  data: {
    board: Array.from({ length: 5 }, (_, reel) =>
      Array.from({ length: 3 }, (_, row) => ({
        name: natural && reel === 0 && row === 0 ? "W" : "L1",
      })),
    ),
  },
})
const launch = (natural = false): GameEvent => ({
  type: "spawnNewStageWilds",
  data: {
    wilds: Array.from({ length: 15 }, (_, index) => ({
      reel: Math.floor(index / 3),
      row: index % 3,
      multiplier: 50,
    })).slice(natural ? 1 : 0),
  },
})

describe("published wild launch report", () => {
  it("moves full-screen stage masses to explicit targets without changing band mass", () => {
    const samples = Array.from({ length: 60 }, (_, id) => ({
      id,
      payout: 10,
      spins: 1,
      hits: 1,
      weight: 1,
      fullScreens: id < 10 ? [1] : id < 12 ? [5] : id < 13 ? [50] : [],
    }))
    const targets = new Map([
      [1, 0.4],
      [5, 0.2],
      [50, 0.05],
    ])
    const result = fitFullScreenStages(
      [{ name: "fixed", probability: 1, average: 10, samples }],
      targets,
    )
    expect(result.achieved).toBe(true)
    for (const [multiplier, target] of targets)
      expect(result.masses.get(multiplier)! / target).toBeCloseTo(1, 1)
    expect(
      [...result.weights.values()].reduce((sum, weight) => sum + weight, 0),
    ).toBeCloseTo(1, 10)
  })
  it("retains payout means when targeting books with different payouts", () => {
    const samples = Array.from({ length: 60 }, (_, id) => ({
      id,
      payout: id % 2 ? 10 : 30,
      spins: 1,
      hits: 1,
      weight: 1,
      fullScreens: id < 30 ? [1] : id < 50 ? [] : [50],
    }))
    const targets = new Map([
      [1, 0.1],
      [50, 0.02],
    ])
    const result = fitFullScreenStages(
      [{ name: "variable", probability: 0.2, average: 17, samples }],
      targets,
    )
    const mass = [...result.weights.values()].reduce((sum, weight) => sum + weight, 0)
    const mean =
      samples.reduce(
        (sum, sample) => sum + result.weights.get(sample.id)! * sample.payout,
        0,
      ) / mass
    expect(result.achieved).toBe(true)
    expect(mass).toBeCloseTo(0.2, 10)
    expect(mean).toBeCloseTo(17, 8)
    expect(samples.every((sample) => sample.weight === 1)).toBe(true)
    expect([
      ...fitFullScreenStages(
        [{ name: "variable", probability: 0.2, average: 17, samples }],
        targets,
      ).weights,
    ]).toEqual([...result.weights])
  })
  it("holds an explosion rate target jointly with full-screen targets", () => {
    const samples = Array.from({ length: 80 }, (_, id) => ({
      id,
      payout: id % 2 ? 10 : 30,
      spins: 1,
      hits: Number(id % 4 < 2),
      weight: 1,
      fullScreens: id < 8 ? [1] : [],
    }))
    const result = fitFullScreenStages(
      [{ name: "variable", probability: 1, average: 17, samples }],
      new Map([[1, 0.05]]),
      0.2,
    )
    const exploded = samples.reduce(
      (sum, sample) => sum + result.weights.get(sample.id)! * sample.hits,
      0,
    )
    const mean = samples.reduce(
      (sum, sample) => sum + result.weights.get(sample.id)! * sample.payout,
      0,
    )
    expect(result.achieved).toBe(true)
    expect(result.targetReached).toBe(true)
    expect(exploded).toBeCloseTo(0.2, 6)
    expect(mean).toBeCloseTo(17, 8)
    expect(result.masses.get(1)! / 0.05).toBeCloseTo(1, 1)
  })
  it("reports unreachable targets rather than changing payout-band budgets", () => {
    const result = fitFullScreenStages(
      [1, 50].map((multiplier, index) => ({
        name: String(multiplier),
        probability: index ? 0.01 : 0.99,
        average: 10,
        samples: [
          {
            id: index,
            payout: 10,
            weight: 1,
            spins: 1,
            hits: 1,
            fullScreens: [multiplier],
          },
        ],
      })),
      new Map([
        [1, 0.5],
        [50, 0.5],
      ]),
    )
    expect(result.achieved).toBe(false)
    expect(result.weights.get(0)).toBeCloseTo(0.99, 10)
    expect(result.weights.get(1)).toBeCloseTo(0.01, 10)
  })
  it("counts a full screen completed by 14 launches plus a natural wild", () => {
    expect(wildLaunches([reveal(true), launch(true)], "featureSpin")).toEqual([
      { source: "featureSpin", count: 14, multiplier: 50, fullScreen: true },
    ])
  })
  it("tracks bonus sources and resets the board on each reveal", () => {
    expect(
      wildLaunches(
        [
          reveal(),
          launch(),
          { type: "freeSpinTrigger", data: { tier: "super" } },
          reveal(),
          launch(),
        ],
        "base",
      ).map((value) => value.source),
    ).toEqual(["base", "bonus:super"])
  })
  it("rejects duplicate or protected launch positions", () => {
    expect(() => wildLaunches([reveal(true), launch()], "base")).toThrow("protected cell")
    expect(() => wildLaunches([launch()], "base")).toThrow("without a reveal")
    const duplicate = launch()
    const wilds = duplicate.data.wilds as { reel: number; row: number }[]
    wilds[1] = { ...wilds[0] }
    expect(() => wildLaunches([reveal(), duplicate], "base")).toThrow("protected cell")
  })
  it("weights rounds and explosions differently and ignores zero-weight support", () => {
    const accumulator = launchAccumulator()
    const full = wildLaunches([reveal(), launch()], "featureSpin")[0]
    accumulator.add(2, [full, full])
    accumulator.add(6, [])
    accumulator.add(0, [{ ...full, count: 14 }])
    const report = accumulator.report()
    expect(report.averageExplosionsPerRound).toBe(0.5)
    expect(report.counts[14]).toMatchObject({
      count: 15,
      probabilityPerExplosion: 1,
      averageLaunchesPerRound: 0.5,
      roundProbability: 0.25,
      roundOneIn: 4,
      supportedBooks: 1,
    })
    expect(report.counts[13].supportedBooks).toBe(0)
    expect(report.fullScreen.roundProbability).toBe(0.25)
    expect(report.fullScreenByLaunchMultiplier).toEqual([
      expect.objectContaining({ stage: 6, multiplier: 50, shareOfFullScreens: 1 }),
    ])
    expect(report.countAndMultiplier).toHaveLength(1)
  })
  it("reports no explosion probability when there are no launches", () => {
    const accumulator = launchAccumulator()
    accumulator.add(5, [])
    expect(accumulator.report().counts[14]).toMatchObject({
      probabilityPerExplosion: null,
      averageLaunchesPerRound: 0,
      roundProbability: 0,
      roundOneIn: null,
      supportedBooks: 0,
    })
  })
})
