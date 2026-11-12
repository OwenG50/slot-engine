import { describe, expect, it } from "vitest"
import { game } from ".."
import { anticipation, RevealSymbol } from "../src/events"
import { onHandleGameFlow } from "../src/onHandleGameFlow"
import { REEL_SET_IDS } from "../src/reels"
import { createResultSets } from "../src/resultSets"
import { MODES } from "../src/settings"
import { Board, ModeName } from "../src/types"

interface MovingCar {
  start: { reel: number; row: number }
  end: { reel: number; row: number }
  multiplier: number
}

interface NativeSimulation {
  gameConfig: ReturnType<typeof game.getConfig>
  workerCtx?: Parameters<typeof onHandleGameFlow>[0]
  runSingleSimulation(opts: {
    simId: number
    mode: string
    criteria: string
    index: number
  }): void
}

type BookEvent = { type: string; data: Record<string, any> }

// carMove is omitted when no new cars land on a reveal.
function carsAfterReveal(events: BookEvent[], revealIndex: number): MovingCar[] {
  expect(events[revealIndex].type).toBe("reveal")
  const next = events[revealIndex + 1]
  return next?.type === "carMove" ? (next.data.cars as MovingCar[]) : []
}

describe("car reel frequency and variety", () => {
  it.each(Object.keys(MODES) as ModeName[])(
    "%s mixes car types on base and denser bonus strips",
    (mode) => {
      const simulation = (game as unknown as { simulation: NativeSimulation }).simulation
      const sets = simulation.gameConfig.gameModes[mode].reelSets
      for (const set of sets) {
        set.associatedGameModeName = mode
        set.generateReels(simulation.gameConfig)
      }
      const base = sets.find((set) => set.id === REEL_SET_IDS.base)!.reels.flat()
      const bonus = sets.find((set) => set.id === REEL_SET_IDS.bonus)!.reels.flat()
      expect(base).toHaveLength(6000)
      expect(bonus).toHaveLength(6000)
      for (const strip of [base, bonus]) {
        const counts = ["W1", "W2", "W3"].map((symbol) =>
          strip.filter((cell) => cell.id === symbol).length,
        )
        const cars = counts.reduce((sum, count) => sum + count, 0)
        expect(Math.min(...counts) / cars).toBeGreaterThan(0.15)
        expect(Math.max(...counts) / cars).toBeLessThan(0.55)
        expect(strip.some((cell) => cell.id === "W")).toBe(false)
      }
      for (const symbol of ["W1", "W2", "W3"])
        expect(bonus.filter((cell) => cell.id === symbol).length)
          .toBeGreaterThan(base.filter((cell) => cell.id === symbol).length)
    },
  )
})

describe("bought bonus trigger spins", () => {
  it("rejects below-minimum and wrong-tier results in simulation acceptance", () => {
    const simulation = (game as unknown as { simulation: NativeSimulation }).simulation
    simulation.workerCtx = undefined
    for (const reel of simulation.gameConfig.gameModes.base.reelSets) {
      reel.associatedGameModeName = "base"
      reel.generateReels(simulation.gameConfig)
    }
    simulation.runSingleSimulation({
      simId: 0, mode: "base", criteria: "normal_bonus", index: 0,
    })
    const ctx = simulation.workerCtx!
    const sets = createResultSets("base")
    const bonus = sets.find((set) => set.criteria === "normal_bonus")!
    const ordinary = sets.find((set) => set.criteria === "loss")!
    ctx.state.userData.bonusMinimum = ctx.state.userData.bonusPayout + 1
    expect(bonus.evaluate!(ctx)).toBe(false)
    ctx.state.userData.bonusMinimum = 0
    ctx.state.userData.bonusTier = "super"
    expect(bonus.evaluate!(ctx)).toBe(false)
    ctx.state.userData.bonusTier = "normal"
    expect(ordinary.evaluate!(ctx)).toBe(false)
  })

  it.each([
    ["bonusFeature", "normal", 3],
    ["superBonusFeature", "super", 4],
    ["hiddenBonusFeature", "hidden", 5],
  ] as const)(
    "%s plays its %s trigger spin with exactly %i scatters",
    (mode, tier, scatters) => {
      // Exercise the native worker like the reference games' simulation tests.
      const simulation = (game as unknown as { simulation: NativeSimulation }).simulation
      simulation.workerCtx = undefined
      for (const reel of simulation.gameConfig.gameModes[mode].reelSets) {
        reel.associatedGameModeName = mode
        reel.generateReels(simulation.gameConfig)
      }

      for (const [index, criteria] of [
        `${tier}_buy_100_1000`,
        `${tier}_buy_max`,
      ].entries()) {
        simulation.runSingleSimulation({ simId: 26, mode, criteria, index })
        const ctx = simulation.workerCtx!
        const book = ctx.services.data._getBook()
        const events = book.events
        expect(events[0].type).toBe("reveal")
        expect(events.filter((event) =>
          event.type === "carMove" && event.data.cars.length === 0,
        )).toHaveLength(0)
        const board = events[0].data.board as RevealSymbol[][]
        expect(board.flat().filter((cell) => cell.name === "S")).toHaveLength(scatters)
        expect(board.every((reel) => reel.filter((cell) => cell.name === "S").length <= 1))
          .toBe(true)
        expect(events[0].data.cameraStatus.every((camera: { active: boolean }) =>
          !camera.active,
        )).toBe(true)
        expect(events[0].data.newlyActivatedCameras).toBeUndefined()
        const triggerIndex = events.findIndex((event) => event.type === "freeSpinTrigger")
        expect(triggerIndex).toBeGreaterThanOrEqual(1)
        expect(events[triggerIndex].data).toMatchObject({ tier, totalFs: 10 })
        expect(events[triggerIndex + 1]).toMatchObject({
          type: "updateFreeSpin", data: { amount: 1, total: 10 },
        })

        const triggerWin = events.slice(0, triggerIndex)
          .filter((event) => event.type === "winInfo")
          .reduce((total, event) => total + event.data.totalWin, 0)
        const firstTotalIndex = events.findIndex((event) => event.type === "setTotalWin")
        const firstFreeWin = events.slice(triggerIndex + 1, firstTotalIndex)
          .filter((event) => event.type === "winInfo")
          .reduce((total, event) => total + event.data.totalWin, 0)
        expect(events[firstTotalIndex].data.amount)
          .toBeCloseTo(triggerWin + firstFreeWin, 8)
        expect(events.filter((event) => event.type === "updateFreeSpin").length)
          .toBeGreaterThan(0)
        const sum = events
          .filter((event) => event.type === "winInfo")
          .reduce((total, event) => total + event.data.totalWin, 0)
        const final = events.find((event) => event.type === "finalWin")!
        const end = events.find((event) => event.type === "freeSpinEnd")!
        expect(final.data.amount).toBeCloseTo(sum, 8)
        expect(end.data.amount).toBe(final.data.amount)
        expect(ctx.state.userData.bonusPayout).toBe(final.data.amount)
        expect(book.payout / 100).toBe(final.data.amount)
        expect(MODES[mode].boughtTier).toBe(tier)
        if (criteria.endsWith("_max")) expect(final.data.amount).toBe(10000)
      }
    },
    30_000,
  )
})

describe("free-spin anticipation", () => {
  it.each(Object.keys(MODES) as ModeName[])(
    "%s disables anticipation in free spins but preserves trigger-spin anticipation",
    (mode) => {
      const simulation = (game as unknown as { simulation: NativeSimulation }).simulation
      simulation.workerCtx = undefined
      for (const reel of simulation.gameConfig.gameModes[mode].reelSets) {
        reel.associatedGameModeName = mode
        reel.generateReels(simulation.gameConfig)
      }
      const tier = MODES[mode].boughtTier
      simulation.runSingleSimulation({
        simId: 26,
        mode,
        criteria: tier ? `${tier}_buy_100_1000` : "normal_bonus",
        index: 0,
      })
      const reveals = simulation.workerCtx!.services.data._getBook().events
        .filter((event) => event.type === "reveal")
      const board: Board = (reveals[0].data.board as RevealSymbol[][])
        .map((reel) => reel.map((cell) => cell.name))
      expect(reveals[0].data.anticipation).toEqual(anticipation(board))
      expect(reveals[0].data.anticipation).toContain(1)
      expect(reveals.length).toBeGreaterThan(1)
      for (const reveal of reveals.slice(1)) {
        expect(reveal.data.anticipation).toEqual([0, 0, 0, 0, 0])
      }
    },
    30_000,
  )
})

describe("trigger-spin sticky cars", () => {
  it.each(Object.keys(MODES) as ModeName[])(
    "%s preserves trigger endpoints and multipliers without moving them in free spins",
    (mode) => {
      const simulation = (game as unknown as { simulation: NativeSimulation }).simulation
      simulation.workerCtx = undefined
      for (const reel of simulation.gameConfig.gameModes[mode].reelSets) {
        reel.associatedGameModeName = mode
        reel.generateReels(simulation.gameConfig)
      }
      let inherited = 0
      let doubled = 0
      for (const tier of ["normal", "super", "hidden"] as const) {
        const boughtTier = MODES[mode].boughtTier
        if (boughtTier && boughtTier !== tier) continue
        for (let seed = 0; seed < 1000 && (seed < 30 || !inherited || !doubled); seed++) {
          simulation.runSingleSimulation({
            simId: seed, mode,
            criteria: boughtTier ? `${tier}_buy_tail` : `${tier}_bonus`,
            index: 0,
          })
          const events = simulation.workerCtx!.services.data._getBook().events
          const original = events[0].data.board as RevealSymbol[][]
          const cars = carsAfterReveal(events, 0)
          const trigger = events.findIndex((event) => event.type === "freeSpinTrigger")
          expect(trigger).toBeGreaterThan(0)
          const firstRevealIndex = events.findIndex((event, index) =>
            index > trigger && event.type === "reveal",
          )
          const firstReveal = events[firstRevealIndex].data.board as RevealSymbol[][]
          for (const car of cars) {
            inherited++
            const { reel, row } = car.end
            expect(firstReveal[reel][row]).toEqual({
              name: original[car.start.reel][car.start.row].name,
              Wild: true, multiplier: car.multiplier,
            })
            const position = `${reel}:${row}`
            let multiplier = car.multiplier
            for (const event of events.slice(trigger + 1)) {
              if (event.type === "reveal") {
                const board = event.data.board as RevealSymbol[][]
                expect(board[reel][row].multiplier).toBe(multiplier)
              }
              if (event.type !== "carMove") continue
              expect((event.data.cars as MovingCar[]).some((moving) =>
                `${moving.start.reel}:${moving.start.row}` === position,
              )).toBe(false)
              const flashes = event.data.cameraFlashes as Array<{
                doubledCars: Array<{
                  position: { reel: number; row: number }
                  before: number; after: number
                }>
              }> | undefined
              for (const flash of flashes ?? []) {
                for (const update of flash.doubledCars) {
                  if (`${update.position.reel}:${update.position.row}` !== position)
                    continue
                  expect(update.before).toBe(multiplier)
                  expect(update.after).toBe(multiplier * 2)
                  multiplier = update.after
                  doubled++
                }
              }
            }
          }
        }
      }
      expect(inherited).toBeGreaterThan(0)
      expect(doubled).toBeGreaterThan(0)
    },
    30_000,
  )
})

describe("FeatureSpin guarantees and bonus inheritance", () => {
  it("generates eight moving cars through its dedicated coverage pool", () => {
    const simulation = (game as unknown as { simulation: NativeSimulation }).simulation
    simulation.workerCtx = undefined
    for (const reel of simulation.gameConfig.gameModes.featureSpin.reelSets) {
      reel.associatedGameModeName = "featureSpin"
      reel.generateReels(simulation.gameConfig)
    }
    simulation.runSingleSimulation({
      simId: 0, mode: "featureSpin", criteria: "feature_eight_cars", index: 0,
    })
    const events = simulation.workerCtx!.services.data._getBook().events
    const cars = carsAfterReveal(events, 0)
    expect(cars).toHaveLength(8)
    for (let row = 0; row < 4; row++)
      expect(cars.filter((car) => car.start.row === row)).toHaveLength(2)
  })

  it.each(["normal", "super", "hidden"] as const)(
    "adds the %s tier guarantees on top of inherited cameras and cars",
    (tier) => {
      const simulation = (game as unknown as { simulation: NativeSimulation }).simulation
      simulation.workerCtx = undefined
      for (const reel of simulation.gameConfig.gameModes.featureSpin.reelSets) {
        reel.associatedGameModeName = "featureSpin"
        reel.generateReels(simulation.gameConfig)
      }
      for (let seed = 0; seed < 10; seed++) {
        simulation.runSingleSimulation({
          simId: seed, mode: "featureSpin", criteria: `${tier}_bonus`, index: 0,
        })
        const events = simulation.workerCtx!.services.data._getBook().events
        const cameras = events[0].data.cameraStatus as Array<{ reel: number; active: boolean }>
        const active = cameras.filter((camera) => camera.active)
        expect(active.length).toBeGreaterThanOrEqual(1)
        expect(active.length).toBeLessThanOrEqual(5)
        const triggerCars = carsAfterReveal(events, 0)
        expect(triggerCars.length).toBeGreaterThanOrEqual(2)
        const triggerIndex = events.findIndex((event) => event.type === "freeSpinTrigger")
        const status = events[triggerIndex].data.initialCameraStatus as typeof cameras
        const added = { normal: 0, super: 1, hidden: 2 }[tier]
        expect(status.filter((camera) => camera.active))
          .toHaveLength(Math.min(5, active.length + added))
        for (const camera of active) expect(status[camera.reel].active).toBe(true)
        const firstNewCars = carsAfterReveal(events, events.findIndex((event, index) =>
          index > triggerIndex && event.type === "reveal",
        ))
        expect(firstNewCars.length).toBeGreaterThanOrEqual(added)
        for (const car of triggerCars) {
          expect(firstNewCars.some((fresh) =>
            fresh.start.reel === car.end.reel && fresh.start.row === car.end.row,
          )).toBe(false)
        }
      }
    },
    30_000,
  )
})

describe("one-time bonus scatter landings", () => {
  it.each(Object.keys(MODES) as ModeName[])(
    "%s only lands free-spin scatters on cameras not yet activated",
    (mode) => {
      const simulation = (game as unknown as { simulation: NativeSimulation }).simulation
      simulation.workerCtx = undefined
      for (const reel of simulation.gameConfig.gameModes[mode].reelSets) {
        reel.associatedGameModeName = mode
        reel.generateReels(simulation.gameConfig)
      }
      for (const tier of ["normal", "super", "hidden"] as const) {
        const boughtTier = MODES[mode].boughtTier
        if (boughtTier && boughtTier !== tier) continue
        for (const seed of [26, 42, 1000]) {
          simulation.runSingleSimulation({
            simId: seed, mode,
            criteria: boughtTier ? `${tier}_buy_100_1000` : `${tier}_bonus`,
            index: 0,
          })
          let active: Set<number> | undefined
          for (const event of simulation.workerCtx!.services.data._getBook().events) {
            if (event.type === "freeSpinTrigger") {
              const status = event.data.initialCameraStatus as Array<{
                reel: number; active: boolean
              }>
              active = new Set(status.filter((camera) => camera.active)
                .map((camera) => camera.reel))
            }
            if (event.type !== "reveal" || !active) continue
            const newlyActivated: number[] = []
            const board = event.data.board as RevealSymbol[][]
            board.forEach((reel, index) => {
              const count = reel.filter((symbol) => symbol.name === "S").length
              expect(count).toBeLessThanOrEqual(1)
              if (!count) return
              expect(active!.has(index)).toBe(false)
              active!.add(index)
              newlyActivated.push(index)
            })
            expect(event.data.newlyActivatedCameras).toEqual(newlyActivated)
            expect(event.data.cameraStatus).toEqual(
              Array.from({ length: 5 }, (_, reel) => ({
                reel, active: active!.has(reel),
              })),
            )
          }
          expect(active).toBeDefined()
        }
      }
    },
    30_000,
  )
})
