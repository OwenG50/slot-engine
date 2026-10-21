import { describe, expect, it } from "vitest"
import { game } from ".."
import type { Context } from "../src/onHandleGameFlow"
import { FEATURE_RULES } from "../src/settings"

interface NativeSimulation {
  gameConfig: ReturnType<typeof game.getConfig>
  actualSims: number
  workerCtx?: Context
  runSingleSimulation(opts: {
    simId: number
    mode: string
    criteria: string
    index: number
  }): void
}

describe("native FeatureSpin high-win sampling", () => {
  it.each(["feature_4_3K_5K", "feature_4_5K_10K", "feature_4_max"])(
    "accepts %s across the failing seed and 100 further seeds below the worker retry limit",
    (criteria) => {
      const simulation = (game as unknown as { simulation: NativeSimulation }).simulation
      simulation.workerCtx = undefined
      for (const reel of simulation.gameConfig.gameModes.featureSpin.reelSets) {
        reel.associatedGameModeName = "featureSpin"
        reel.generateReels(simulation.gameConfig)
      }
      const flow = simulation.gameConfig.hooks.onHandleGameFlow
      let calls = 0
      simulation.gameConfig.hooks.onHandleGameFlow = (ctx) => {
        if (++calls > 5000)
          throw new Error("High-win candidate exceeded the 5,000-flow regression budget")
        flow(ctx)
      }
      let first: unknown
      try {
        for (const seed of [
          3,
          ...Array.from({ length: 100 }, (_, index) => index + 1000),
          3,
        ]) {
          calls = 0
          simulation.runSingleSimulation({
            simId: seed,
            mode: "featureSpin",
            criteria,
            index: 0,
          })
          expect(calls).toBeLessThanOrEqual(5000)
          const book = simulation.workerCtx!.services.data._getBook()
          const range = simulation.gameConfig.gameModes.featureSpin.resultSets.find(
            (set) => set.criteria === criteria,
          )!.multiplier as [number, number]
          expect(book.payout / 100).toBeGreaterThanOrEqual(range[0])
          expect(book.payout / 100).toBeLessThanOrEqual(range[1])
          const info = book.events.find((event) => event.type === "winInfo")!
          expect(info.data.totalWin).toBe(book.payout / 100)
          expect(
            info.data.wins.reduce(
              (sum: number, win: { win: number }) => sum + win.win,
              0,
            ),
          ).toBeCloseTo(book.payout / 100, 8)
          const added = book.events.find((event) => event.type === "spawnNewStageWilds")!
            .data.wilds as { reel: number; row: number; multiplier: number }[]
          expect(added.length).toBeGreaterThanOrEqual(3)
          expect(added.length).toBeLessThanOrEqual(10)
          expect(new Set(added.map((wild) => `${wild.reel},${wild.row}`)).size).toBe(
            added.length,
          )
          expect(
            added.every((wild) =>
              Object.values(FEATURE_RULES.stageMultipliers).includes(wild.multiplier),
            ),
          ).toBe(true)
          if (seed === 3) {
            if (first) expect(book.events).toEqual(first)
            else first = structuredClone(book.events)
          }
        }
      } finally {
        simulation.gameConfig.hooks.onHandleGameFlow = flow
      }
    },
    30_000,
  )
})
