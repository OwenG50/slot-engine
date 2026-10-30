import { describe, expect, it } from "vitest"
import { game } from ".."
import type { Context } from "../src/onHandleGameFlow"
import { FEATURE_RULES } from "../src/settings"
import { wildLaunches } from "../src/wildLaunches"
import { GameEvent } from "../src/types"

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
  it.each(["feature_3K_5K", "feature_5K_10K", "feature_max"])(
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
          expect(added.length).toBeLessThanOrEqual(15)
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

describe("neutral-wild high-base payout coverage", () => {
  it.each(["base", "extraChance", "extraChance2"] as const)(
    "samples the upper ordinary-win band in %s",
    (mode) => {
      const simulation = (game as unknown as { simulation: NativeSimulation }).simulation
      simulation.workerCtx = undefined
      for (const reel of simulation.gameConfig.gameModes[mode].reelSets) {
        reel.associatedGameModeName = mode
        reel.generateReels(simulation.gameConfig)
      }
      simulation.runSingleSimulation({
        simId: 7183,
        mode,
        criteria: mode === "base" ? "baseWin_200_plus" : "baseWin_100_plus",
        index: 0,
      })

      const book = simulation.workerCtx!.services.data._getBook()
      expect(book.payout / 100).toBeGreaterThanOrEqual(mode === "base" ? 200 : 100)
      expect(book.events.some((event) => event.type === "freeSpinTrigger")).toBe(false)
    },
  )
})

describe("full-screen candidate coverage without fixed player odds", () => {
  it.each([
    { mode: "featureSpin" as const, criteria: "feature_250_500" },
    { mode: "featureSpin" as const, criteria: "feature_max" },
    { mode: "extraChance" as const, criteria: "baseWin_100_plus" },
  ])("naturally samples 15-wild launches in $mode/$criteria", ({ mode, criteria }) => {
    const simulation = (game as unknown as { simulation: NativeSimulation }).simulation
    simulation.workerCtx = undefined
    for (const reel of simulation.gameConfig.gameModes[mode].reelSets) {
      reel.associatedGameModeName = mode
      reel.generateReels(simulation.gameConfig)
    }
    let fullScreens = 0
    for (let seed = 0; seed < 200; seed++) {
      simulation.runSingleSimulation({ simId: seed, mode, criteria, index: 0 })
      const book = simulation.workerCtx!.services.data._getBook()
      const added = book.events.find((event) => event.type === "spawnNewStageWilds")?.data
        .wilds as { multiplier: number }[] | undefined
      if (added?.length === 15) {
        fullScreens++
        const range = simulation.gameConfig.gameModes[mode].resultSets.find(
          (set) => set.criteria === criteria,
        )!.multiplier as [number, number]
        expect(book.payout / 100).toBeGreaterThanOrEqual(range[0])
        expect(book.payout / 100).toBeLessThanOrEqual(range[1])
        expect(added.every((wild) => wild.multiplier === added[0].multiplier)).toBe(true)
      }
    }
    expect(fullScreens).toBeGreaterThan(0)
  })

  describe("high-stage full-screen max-win coverage", () => {
    it.each([
      { mode: "base" as const, criteria: "normal_max" },
      { mode: "base" as const, criteria: "super_max" },
      { mode: "base" as const, criteria: "hidden_max" },
      { mode: "extraChance" as const, criteria: "normal_max" },
      { mode: "extraChance" as const, criteria: "super_max" },
      { mode: "extraChance" as const, criteria: "hidden_max" },
      { mode: "extraChance2" as const, criteria: "normal_max" },
      { mode: "extraChance2" as const, criteria: "super_max" },
      { mode: "extraChance2" as const, criteria: "hidden_max" },
      { mode: "bonusFeature" as const, criteria: "normal_max" },
      { mode: "superBonusFeature" as const, criteria: "super_max" },
      { mode: "hiddenBonusFeature" as const, criteria: "hidden_max" },
    ])("can complete a 50x full screen in $mode/$criteria", ({ mode, criteria }) => {
      const simulation = (game as unknown as { simulation: NativeSimulation }).simulation
      simulation.workerCtx = undefined
      for (const reel of simulation.gameConfig.gameModes[mode].reelSets) {
        reel.associatedGameModeName = mode
        reel.generateReels(simulation.gameConfig)
      }
      let fullScreens = 0
      for (let seed = 0; seed < 1000 && fullScreens === 0; seed++) {
        simulation.runSingleSimulation({ simId: seed, mode, criteria, index: 0 })
        const book = simulation.workerCtx!.services.data._getBook()
        const launches = wildLaunches(book.events as GameEvent[], mode)
        if (launches.some((launch) => launch.fullScreen && launch.multiplier === 50)) {
          fullScreens++
          expect(book.payout / 100).toBe(10_000)
          const events = book.events as GameEvent[]
          const spawn = events.findIndex(
            (event) =>
              event.type === "spawnNewStageWilds" &&
              (event.data.wilds as { multiplier: number }[])[0].multiplier === 50,
          )
          expect(events[spawn - 1]).toMatchObject({
            type: "triggerExplode",
            data: { source: "stage" },
          })
          expect(events.slice(spawn + 1).some((event) => event.type === "reveal")).toBe(
            false,
          )
          expect(events.at(-1)).toMatchObject({
            type: "finalWin",
            data: { amount: 10_000 },
          })
        }
      }
      expect(fullScreens).toBeGreaterThan(0)
    })
  })
})
