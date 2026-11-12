import { describe, expect, it } from "vitest"
import { revealBoard } from "../src/events"
import {
  addHeadOnPartners,
  addFeatureSpinCars,
  applyStickyCars,
  cameraActivationFromScatters,
  hasLegalCarLandings,
  hasLegalCarMovement,
  pickFeatureSpinCameraCount,
  resolveCarMove,
  stickyFromCars,
} from "../src/feature"
import { Board, HEIGHT, StickyCar, WIDTH } from "../src/types"

const emptyBoard = (): Board =>
  Array.from({ length: WIDTH }, () => Array(HEIGHT).fill("L1"))

describe("Speed Trap carMove events", () => {
  it("doubles a waiting car at its start and again when it pulls away", () => {
    const board = emptyBoard()
    board[2][0] = "W3"
    board[2][1] = "W3"
    const result = resolveCarMove({
      board, stickyCars: [], activeCameraReels: [2], randomFloat: () => 0,
    })
    expect(hasLegalCarMovement(result.carsAfterMove)).toBe(true)
    expect(result.event.cameraFlashes).toEqual([
      {
        reel: 2,
        triggeringCar: { start: { reel: 2, row: 0 }, before: 2, after: 4 },
        doubledCars: [{ position: { reel: 2, row: 1 }, before: 2, after: 4 }],
      },
      {
        reel: 2,
        triggeringCar: { start: { reel: 2, row: 1 }, before: 4, after: 8 },
        doubledCars: [],
      },
    ])
    expect(result.event.cars.map((car) => car.initialMultiplier)).toEqual([2, 2])
    expect(result.event.cars.map((car) => car.multiplierAfterMove)).toEqual([4, 8])
    expect(result.event.cars.map((car) => car.multiplier)).toEqual([4, 8])
    expect(result.multipliers.get("0:1")).toBe(8)
    expect(result.multipliers.has("2:1")).toBe(false)
    expect(result.boardAfterMove[2][1]).toBe("W")
  })

  it("repeatedly doubles every waiting lower row without using its future endpoint", () => {
    const board = emptyBoard()
    for (let row = 0; row < HEIGHT; row++) board[2][row] = "W3"
    const result = resolveCarMove({
      board, stickyCars: [], activeCameraReels: [0, 2], randomFloat: () => 0,
    })
    expect(result.event.cars.map((car) => car.initialMultiplier)).toEqual([2, 2, 2, 2])
    expect(result.event.cars.map((car) => car.multiplierAfterMove)).toEqual([8, 16, 32, 64])
    expect(result.event.cars.map((car) => car.multiplier)).toEqual([64, 64, 64, 64])
    expect(result.event.cameraFlashes?.[0].doubledCars).toEqual([
      { position: { reel: 2, row: 1 }, before: 2, after: 4 },
      { position: { reel: 2, row: 2 }, before: 2, after: 4 },
      { position: { reel: 2, row: 3 }, before: 2, after: 4 },
    ])
    expect(result.event.cameraFlashes?.[1].doubledCars).toEqual([])
    expect(result.event.cameraFlashes?.[3].doubledCars).toEqual([
      { position: { reel: 0, row: 0 }, before: 8, after: 16 },
    ])
  })

  it("applies waiting-car doubles before the lower row's collision addition", () => {
    const board = emptyBoard()
    board[0][0] = "W3"
    board[0][1] = "W2"
    board[4][1] = "W3"
    const result = resolveCarMove({
      board, stickyCars: [], activeCameraReels: [0], randomFloat: () => 0,
    })
    expect(result.event.cameraFlashes?.[0].doubledCars).toEqual([
      { position: { reel: 0, row: 1 }, before: 6, after: 12 },
    ])
    expect(result.event.cameraFlashes?.[1].triggeringCar).toEqual({
      start: { reel: 0, row: 1 }, before: 12, after: 24,
    })
    expect(result.event.cars.map((car) => car.multiplierAfterMove)).toEqual([4, 26, 26])
    expect(hasLegalCarMovement(result.carsAfterMove)).toBe(true)
  })

  it.each([0, 4])("leaves unmultiplied wilds along the full path from reel %i", (start) => {
    const board = emptyBoard()
    board[1][0] = "H2"
    board[2][0] = "H3"
    board[3][0] = "H4"
    board[start][0] = "W1"
    const original = structuredClone(board)
    const result = resolveCarMove({
      board, stickyCars: [], activeCameraReels: [1, 2, 3], randomFloat: () => 0,
    })
    const end = start === 0 ? 4 : 0
    expect(result.boardAfterMove[start][0]).toBe("W")
    expect(result.multipliers.has(`${start}:0`)).toBe(false)
    expect(result.boardAfterMove[end][0]).toBe("W1")
    expect(result.multipliers.get(`${end}:0`)).toBe(160)
    for (const reel of [1, 2, 3]) {
      expect(result.boardAfterMove[reel][0]).toBe("W")
      expect(result.multipliers.has(`${reel}:0`)).toBe(false)
    }
    for (let reel = 0; reel < WIDTH; reel++)
      expect(result.boardAfterMove[reel].slice(1)).toEqual(original[reel].slice(1))
    expect(result.boardAfterMove.flat().filter((symbol) => symbol === "W")).toHaveLength(4)
    expect(result.event.cameraFlashes).toHaveLength(3)
    expect(board).toEqual(original)
    expect(stickyFromCars(result.carsAfterMove)).toEqual([
      { symbol: "W1", position: [end, 0], multiplier: 160 },
    ])
  })

  it("samples every FeatureSpin camera count from one through five", () => {
    expect([0, 0.7, 0.88, 0.96, 0.99].map((roll) =>
      pickFeatureSpinCameraCount(() => roll + 0.0001),
    )).toEqual([1, 2, 3, 4, 5])
  })

  it("supports every FeatureSpin car count from two through eight without replacing scatters", () => {
    for (const [index, roll] of [0, 0.7001, 0.8201, 0.9001, 0.9401, 0.9701, 0.9901].entries()) {
      const board = emptyBoard()
      board[2][0] = "S"
      let first = true
      const result = addFeatureSpinCars(board, () => {
        if (first) { first = false; return roll }
        return 0
      })
      expect(result.flat().filter((symbol) => symbol.startsWith("W")))
        .toHaveLength(index + 2)
      expect(hasLegalCarLandings(result, [])).toBe(true)
      expect(result[2][0]).toBe("S")
      expect(board.flat().filter((symbol) => symbol.startsWith("W"))).toHaveLength(0)
    }
  })

  it("steers toward a reachable sticky car at the increased probability", () => {
    const stickyCars: StickyCar[] = [{ symbol: "W2", position: [4, 0], multiplier: 10 }]
    const board = applyStickyCars(emptyBoard(), stickyCars)
    board[1][0] = "W3"
    const result = resolveCarMove({
      board, stickyCars, activeCameraReels: [], randomFloat: () => 0.4,
    })
    expect(hasLegalCarMovement(result.carsAfterMove)).toBe(true)
    expect(result.event.cars[0]).toMatchObject({
      direction: "right", end: { reel: 3, row: 0 },
      collision: { kind: "newSticky" },
    })
  })

  it.each([
    { roll: 0.85, direction: "left" },
    { roll: 0.95, direction: "left" },
  ])("applies the new-pair steering threshold at $roll", ({ roll, direction }) => {
    const board = emptyBoard()
    board[0][0] = "W3"
    board[3][0] = "W3"
    const result = resolveCarMove({
      board, stickyCars: [], activeCameraReels: [], randomFloat: () => roll,
    })
    expect(result.event.cars[1].direction).toBe(direction)
    if (direction === "left") {
      expect(result.event.cars.map((car) => car.collision)).toEqual([
        { kind: "newNew", withStart: { reel: 3, row: 0 }, withPosition: { reel: 2, row: 0 } },
        { kind: "newNew", withStart: { reel: 0, row: 0 }, withPosition: { reel: 1, row: 0 } },
      ])
    }
  })

  it("steers unlocked pairs apart when too close to both move before meeting", () => {
    const board = emptyBoard()
    board[1][0] = "W3"
    board[3][0] = "W3"
    const result = resolveCarMove({
      board, stickyCars: [], activeCameraReels: [], randomFloat: () => 0.4,
    })
    expect(result.event.cars.map((car) => car.direction)).toEqual(["left", "right"])
    expect(hasLegalCarMovement(result.carsAfterMove)).toBe(true)
  })

  it.each([
    { lone: 0, partners: [3, 4] },
    { lone: 1, partners: [3, 4] },
    { lone: 2, partners: [] },
    { lone: 3, partners: [0, 1] },
    { lone: 4, partners: [0, 1] },
  ])("adds an opposing partner for a lone car on reel $lone", ({ lone, partners }) => {
    const seen = new Set<number>()
    for (const pick of [0, 0.99]) {
      const board = emptyBoard()
      board[lone][2] = "W2"
      const rolls = [0, pick, 0]
      const result = addHeadOnPartners({
        board, stickyCars: [], chance: 1, allowScatterCrossing: false,
        randomFloat: () => rolls.shift() ?? 0,
      })
      const cars = result.map((reel) => reel[2]).flatMap((symbol, reel) =>
        symbol.startsWith("W") ? [reel] : [],
      )
      if (partners.length === 0) {
        expect(cars).toEqual([lone])
        continue
      }
      expect(cars).toHaveLength(2)
      expect(hasLegalCarLandings(result, [])).toBe(true)
      const partner = cars.find((reel) => reel !== lone)!
      seen.add(partner)
      const moved = resolveCarMove({
        board: result, stickyCars: [], activeCameraReels: [], randomFloat: () => 0,
      })
      expect(hasLegalCarMovement(moved.carsAfterMove)).toBe(true)
      const outward = Math.min(lone, partner) === 1 && Math.max(lone, partner) === 3
      expect(moved.event.cars.every((car) =>
        car.collision.kind === (outward ? "edge" : "newNew"))).toBe(true)
    }
    expect([...seen].sort()).toEqual(partners)
  })

  it("balances fresh inward and outward pairs at the 50% threshold", () => {
    for (const [roll, starts, directions] of [
      [0.499, [0, 3], ["right", "left"]],
      [0.5, [1, 3], ["left", "right"]],
    ] as const) {
      const rolls = [0, roll, 0, 0, 0]
      const board = addHeadOnPartners({
        board: emptyBoard(), stickyCars: [], chance: 0, pairChance: 1,
        allowScatterCrossing: false, randomFloat: () => rolls.shift() ?? 0,
      })
      const result = resolveCarMove({
        board, stickyCars: [], activeCameraReels: [], randomFloat: () => 0,
      })
      expect(hasLegalCarMovement(result.carsAfterMove)).toBe(true)
      expect(result.event.cars.map((car) => car.start.reel)).toEqual(starts)
      expect(result.event.cars.map((car) => car.direction)).toEqual(directions)
    }
  })

  it("never partners across sticky cars, scatters, or rows that already have a pair", () => {
    const stickyCars: StickyCar[] = [{ symbol: "W2", position: [2, 0], multiplier: 5 }]
    const board = applyStickyCars(emptyBoard(), stickyCars)
    board[0][0] = "W3"
    board[0][1] = "W3"
    board[3][1] = "S"
    board[0][2] = "W3"
    board[4][2] = "W1"
    const paid = addHeadOnPartners({
      board, stickyCars, chance: 1, allowScatterCrossing: false, randomFloat: () => 0,
    })
    expect(paid).toEqual(board)
    const free = addHeadOnPartners({
      board, stickyCars, chance: 1, allowScatterCrossing: true, randomFloat: () => 0,
    })
    expect(free[3][1]).toBe("S")
    expect(free[4][1]).toBe("W3")
    expect(free[0]).toEqual(board[0])
  })

  it("adds a fresh oncoming pair only when no head-on pair landed", () => {
    const stickyCars: StickyCar[] = [{ symbol: "W2", position: [2, 0], multiplier: 5 }]
    const board = applyStickyCars(emptyBoard(), stickyCars)
    const added = addHeadOnPartners({
      board, stickyCars, chance: 0, pairChance: 1, allowScatterCrossing: true,
      randomFloat: () => 0,
    })
    const rows = [0, 1, 2, 3].map((row) =>
      added.flatMap((reel, x) => (reel[row].startsWith("W") ? [x] : [])),
    )
    expect(rows[0]).toEqual([2])
    expect(rows.flat()).toHaveLength(3)
    const moved = resolveCarMove({
      board: added, stickyCars, activeCameraReels: [], randomFloat: () => 0,
    })
    expect(moved.event.cars).toHaveLength(2)
    expect(moved.event.cars.every((car) => car.collision.kind === "newNew")).toBe(true)

    const paired = emptyBoard()
    paired[0][1] = "W3"
    paired[4][1] = "W3"
    expect(addHeadOnPartners({
      board: paired, stickyCars: [], chance: 0, pairChance: 1,
      allowScatterCrossing: true, randomFloat: () => 0,
    })).toEqual(paired)
  })

  it("sends initial and final multipliers for each moving car", () => {
    const board = emptyBoard()
    board[0][0] = "W3"
    const result = resolveCarMove({
      board,
      stickyCars: [],
      activeCameraReels: [],
      randomFloat: () => 0,
    })
    expect(result.event).toEqual({
      cars: [
        {
          start: { reel: 0, row: 0 },
          end: { reel: 4, row: 0 },
          direction: "right",
          initialMultiplier: 2,
          multiplierAfterMove: 2,
          multiplier: 2,
          collision: { kind: "edge" },
        },
      ],
    })
    expect(result.carsAfterMove[0].path).toEqual([
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
    ])
    expect(result.boardAfterMove.map((reel) => reel[0])).toEqual([
      "W",
      "W",
      "W",
      "W",
      "W3",
    ])
    expect(result.multipliers.get("4:0")).toBe(2)
  })

  it("identifies and rejects an immediately blocked landing", () => {
    const board = emptyBoard()
    board[4][0] = "W3"
    const stickyCars: StickyCar[] = [{ symbol: "W2", position: [3, 0], multiplier: 10 }]
    const result = resolveCarMove({
      board: applyStickyCars(board, stickyCars),
      stickyCars,
      activeCameraReels: [],
      randomFloat: () => 0,
    })
    expect(result.event).toEqual({
      cars: [
        {
          start: { reel: 4, row: 0 },
          end: { reel: 4, row: 0 },
          direction: "left",
          initialMultiplier: 2,
          multiplierAfterMove: 2,
          multiplier: 2,
          collision: {
            kind: "newSticky",
            withStart: { reel: 3, row: 0 },
            withPosition: { reel: 3, row: 0 },
          },
        },
      ],
    })
    expect(result.carsAfterMove[1].collision?.kind).toBe("newSticky")
    expect(hasLegalCarMovement(result.carsAfterMove)).toBe(false)
    expect(stickyFromCars(result.carsAfterMove)).toEqual([
      ...stickyCars,
      { symbol: "W3", position: [4, 0], multiplier: 2 },
    ])
  })

  it("identifies a new-car collision partner", () => {
    const board = emptyBoard()
    board[0][0] = "W3"
    board[3][0] = "W3"
    const result = resolveCarMove({
      board,
      stickyCars: [],
      activeCameraReels: [],
      randomFloat: () => 0,
    })
    expect(result.carsAfterMove.some((car) => car.collision?.kind === "newNew")).toBe(
      true,
    )
    for (const car of result.event.cars) {
      expect(Object.keys(car).sort()).toEqual([
        "collision",
        "direction",
        "end",
        "initialMultiplier",
        "multiplier",
        "multiplierAfterMove",
        "start",
      ])
      expect(car.initialMultiplier).toBe(2)
      expect(car.multiplier).toBe(4)
      expect(car.collision.kind).toBe("newNew")
      expect(result.multipliers.get(`${car.end.reel}:${car.end.row}`)).toBe(
        car.multiplier,
      )
    }
  })

  it("accepts a mutual crash only after both cars move at least one cell", () => {
    const board = emptyBoard()
    board[0][0] = "W2"
    board[4][0] = "W3"
    const result = resolveCarMove({
      board,
      stickyCars: [],
      activeCameraReels: [],
      randomFloat: () => 0,
    })
    expect(hasLegalCarMovement(result.carsAfterMove)).toBe(true)
    expect(result.event.cars.map((car) => car.multiplier)).toEqual([8, 8])
    expect(result.boardAfterMove.map((reel) => reel[0])).toEqual([
      "W", "W", "W2", "W3", "W",
    ])
    for (const car of result.event.cars) {
      expect(car.start.reel).not.toBe(car.end.reel)
      expect(car.collision.kind).toBe("newNew")
      if (car.collision.kind === "edge") throw new Error("Expected car collision")
      const partnerStart = car.collision.withStart
      const partner = result.event.cars.find(
        (other) => other.start.reel === partnerStart.reel,
      )
      expect(partner).toBeDefined()
      expect(car.collision.withPosition).toEqual(partner!.end)
    }
  })

  it("identifies a sticky-car crash after movement", () => {
    const stickyCars: StickyCar[] = [{ symbol: "W1", position: [3, 0], multiplier: 30 }]
    const board = applyStickyCars(emptyBoard(), stickyCars)
    board[0][0] = "W3"
    const result = resolveCarMove({
      board,
      stickyCars,
      activeCameraReels: [],
      randomFloat: () => 0,
    })

    expect(hasLegalCarMovement(result.carsAfterMove)).toBe(true)
    expect(result.event.cars[0]).toMatchObject({
      end: { reel: 2, row: 0 },
      collision: {
        kind: "newSticky",
        withStart: { reel: 3, row: 0 },
        withPosition: { reel: 3, row: 0 },
      },
    })
  })

  it("rejects a close edge pair instead of allowing a rear-end crash", () => {
    const board = emptyBoard()
    board[0][0] = "W3"
    board[2][0] = "W3"
    const result = resolveCarMove({
      board, stickyCars: [], activeCameraReels: [], randomFloat: () => 0.99,
    })
    expect(result.event.cars.map((car) => car.direction)).toEqual(["right", "left"])
    expect(hasLegalCarMovement(result.carsAfterMove)).toBe(false)
  })

  it("rejects conflicting scatter-locked directions instead of emitting a same-direction pair", () => {
    const board = emptyBoard()
    board[0][0] = "S"
    board[1][0] = "W3"
    board[3][0] = "W3"
    const result = resolveCarMove({
      board, stickyCars: [], activeCameraReels: [], randomFloat: () => 0.99,
    })
    expect(hasLegalCarMovement(result.carsAfterMove)).toBe(false)
  })

  it("preserves opposite directions when a sticky car intercepts both new cars", () => {
    const stickyCars: StickyCar[] = [{ symbol: "W1", position: [2, 0], multiplier: 20 }]
    const board = applyStickyCars(emptyBoard(), stickyCars)
    board[0][0] = "W3"
    board[4][0] = "W2"
    const result = resolveCarMove({
      board, stickyCars, activeCameraReels: [], randomFloat: () => 0.99,
    })
    expect(hasLegalCarMovement(result.carsAfterMove)).toBe(true)
    expect(result.event.cars.map((car) => car.direction)).toEqual(["right", "left"])
    expect(result.event.cars.every((car) => car.collision.kind === "newSticky")).toBe(true)
  })

  it("accepts only opposite directions and reciprocal new-car crashes across all pair placements", () => {
    let accepted = 0
    for (let left = 0; left < WIDTH; left++) {
      for (let right = left + 1; right < WIDTH; right++) {
        for (const allowScatterCrossing of [false, true]) {
          for (let blocker = -1; blocker < WIDTH; blocker++) {
            if (blocker === left || blocker === right) continue
            for (const roll of [0, 0.4, 0.85, 0.95, 0.99]) {
              const board = emptyBoard()
              board[left][0] = "W3"
              board[right][0] = "W2"
              if (blocker >= 0) board[blocker][0] = "S"
              const result = resolveCarMove({
                board, stickyCars: [], activeCameraReels: [0, 2, 4],
                allowScatterCrossing, randomFloat: () => roll,
              })
              if (!hasLegalCarMovement(result.carsAfterMove)) continue
              accepted++
              const [a, b] = result.event.cars
              expect(a.direction).not.toBe(b.direction)
              for (const car of [a, b]) {
                if (car.collision.kind !== "newNew") continue
                const partner = car === a ? b : a
                expect(partner.collision).toMatchObject({
                  kind: "newNew", withStart: car.start, withPosition: car.end,
                })
              }
              expect(hasLegalCarMovement(result.carsAfterMove.map((car) => ({
                ...car, direction: 1,
              })))).toBe(false)
            }
          }
        }
      }
    }
    expect(accepted).toBeGreaterThan(0)
  })

  it("allows two new cars per row, rejects three, and excludes existing sticky cars", () => {
    const board = emptyBoard()
    board[0][0] = "W3"
    board[2][0] = "W3"
    expect(hasLegalCarLandings(board, [])).toBe(true)
    board[4][0] = "W3"
    expect(hasLegalCarLandings(board, [])).toBe(false)
    expect(
      hasLegalCarLandings(board, [{ symbol: "W3", position: [2, 0], multiplier: 2 }]),
    ).toBe(true)
    board[4][0] = "L1"
    board[0][1] = "W3"
    board[4][1] = "W3"
    expect(hasLegalCarLandings(board, [])).toBe(true)
  })

  it("adds unequal mutual crash multipliers exactly once and preserves their initial values", () => {
    const board = emptyBoard()
    board[0][0] = "W2"
    board[3][0] = "W3"
    const result = resolveCarMove({
      board,
      stickyCars: [],
      activeCameraReels: [],
      randomFloat: () => 0,
    })
    expect(hasLegalCarMovement(result.carsAfterMove)).toBe(true)
    expect(result.event.cars.map((car) => car.initialMultiplier)).toEqual([6, 2])
    expect(result.event.cars.map((car) => car.multiplier)).toEqual([8, 8])
    expect(result.carsAfterMove.every((car) => car.collision?.kind === "newNew")).toBe(
      true,
    )
    expect(stickyFromCars(result.carsAfterMove).map((car) => car.multiplier)).toEqual([
      8, 8,
    ])
  })

  it("flashes for each crossing and repeatedly doubles existing sticky cars", () => {
    const stickyCars: StickyCar[] = [{ symbol: "W1", position: [2, 1], multiplier: 30 }]
    const board = applyStickyCars(emptyBoard(), stickyCars)
    board[0][0] = "W3"
    board[0][2] = "W3"
    const result = resolveCarMove({
      board,
      stickyCars,
      activeCameraReels: [2],
      randomFloat: () => 0,
    })
    expect(result.event.cameraFlashes).toEqual([
      {
        reel: 2,
        triggeringCar: { start: { reel: 0, row: 0 }, before: 2, after: 4 },
        doubledCars: [{ position: { reel: 2, row: 1 }, before: 30, after: 60 }],
      },
      {
        reel: 2,
        triggeringCar: { start: { reel: 0, row: 2 }, before: 2, after: 4 },
        doubledCars: [{ position: { reel: 2, row: 1 }, before: 60, after: 120 }],
      },
    ])
    expect(result.event.cars).toHaveLength(2)
    expect(result.event.cars.map((car) => car.multiplier)).toEqual([4, 4])
    expect(result.multipliers.get("2:1")).toBe(120)
    expect(
      stickyFromCars(result.carsAfterMove).find((car) => car.symbol === "W1")?.multiplier,
    ).toBe(120)
    expect(revealBoard(board, () => 30)[2][1].multiplier).toBe(30)
  })

  it("doubles an earlier-row crashed car when a later row triggers its camera", () => {
    const stickyCars: StickyCar[] = [{ symbol: "W1", position: [3, 0], multiplier: 30 }]
    const board = applyStickyCars(emptyBoard(), stickyCars)
    board[1][0] = "W3"
    board[0][2] = "W3"
    const result = resolveCarMove({
      board,
      stickyCars,
      activeCameraReels: [2, 3],
      allowScatterCrossing: true,
      randomFloat: () => 0.99,
    })
    const crashed = result.carsAfterMove.find(
      (car) => car.spawnedThisSpin && car.start[1] === 0,
    )!
    expect(crashed.collision?.kind).toBe("newSticky")
    expect(crashed.position).toEqual([2, 0])
    expect(crashed.multiplier).toBe(20)
    expect(result.event.cameraFlashes?.filter((flash) => flash.reel === 2)).toEqual([
      {
        reel: 2,
        triggeringCar: { start: { reel: 1, row: 0 }, before: 5, after: 10 },
        doubledCars: [],
      },
      {
        reel: 2,
        triggeringCar: { start: { reel: 0, row: 2 }, before: 5, after: 10 },
        doubledCars: [{ position: { reel: 2, row: 0 }, before: 10, after: 20 }],
      },
    ])
    expect(result.multipliers.get("2:0")).toBe(20)
    expect(result.multipliers.get("3:0")).toBe(60)
  })

  it("reports a real flash even if there are no sticky cars to double", () => {
    const board = emptyBoard()
    board[0][0] = "W3"
    const result = resolveCarMove({
      board,
      stickyCars: [],
      activeCameraReels: [2],
      randomFloat: () => 0,
    })
    expect(result.event.cameraFlashes).toEqual([{
      reel: 2,
      triggeringCar: { start: { reel: 0, row: 0 }, before: 2, after: 4 },
      doubledCars: [],
    }])
  })

  it("activates and flashes a camera before movement crosses its scatter on the same spin", () => {
    const stickyCars: StickyCar[] = [{ symbol: "W1", position: [2, 1], multiplier: 30 }]
    const board = applyStickyCars(emptyBoard(), stickyCars)
    board[0][0] = "W3"
    board[2][0] = "S"
    const activation = cameraActivationFromScatters(board, [])
    expect(activation).toEqual({ activeReels: [2], newlyActivated: [2] })
    const result = resolveCarMove({
      board,
      stickyCars,
      activeCameraReels: activation.activeReels,
      allowScatterCrossing: true,
      randomFloat: () => 0,
    })
    expect(result.event.cameraFlashes).toEqual([
      {
        reel: 2,
        triggeringCar: { start: { reel: 0, row: 0 }, before: 2, after: 4 },
        doubledCars: [{ position: { reel: 2, row: 1 }, before: 30, after: 60 }],
      },
    ])
    expect(board[2][0]).toBe("S")
    expect(result.boardAfterMove[2][0]).toBe("W")
    expect(result.event.cars[0].multiplier).toBe(4)
    expect(result.multipliers.get("2:1")).toBe(60)
    const next = cameraActivationFromScatters(board, activation.activeReels)
    expect(next).toEqual({ activeReels: [2], newlyActivated: [] })
  })

  it("flashes the starting reel's camera as the car pulls away", () => {
    const stickyCars: StickyCar[] = [{ symbol: "W2", position: [0, 2], multiplier: 10 }]
    const board = applyStickyCars(emptyBoard(), stickyCars)
    board[0][0] = "W3"
    const result = resolveCarMove({
      board,
      stickyCars,
      activeCameraReels: [0],
      randomFloat: () => 0,
    })
    expect(result.event.cameraFlashes).toEqual([{
      reel: 0,
      triggeringCar: { start: { reel: 0, row: 0 }, before: 2, after: 4 },
      doubledCars: [{ position: { reel: 0, row: 2 }, before: 10, after: 20 }],
    }])
    expect(result.event.cars[0]).toMatchObject({
      initialMultiplier: 2, multiplierAfterMove: 4, multiplier: 4,
    })
    expect(result.multipliers.get("0:2")).toBe(20)
  })

  it("keeps an empty cars list when there is no movement", () => {
    expect(
      resolveCarMove({
        board: emptyBoard(),
        stickyCars: [],
        activeCameraReels: [0, 1],
        randomFloat: () => 0,
      }).event,
    ).toEqual({ cars: [] })
  })

  it.each([
    { scatterReel: 0, roll: 0, direction: "left", end: 0 },
    { scatterReel: 4, roll: 0.99, direction: "right", end: 4 },
  ] as const)(
    "allows free-spin movement $direction over a scatter",
    ({ scatterReel, roll, direction, end }) => {
      const board = emptyBoard()
      board[2][0] = "W3"
      board[scatterReel][0] = "S"
      const active = cameraActivationFromScatters(board, []).activeReels
      const free = resolveCarMove({
        board,
        stickyCars: [],
        activeCameraReels: active,
        allowScatterCrossing: true,
        randomFloat: () => roll,
      })
      expect(free.event.cars[0].direction).toBe(direction)
      expect(free.event.cars[0].end).toEqual({ reel: end, row: 0 })
      expect(free.boardAfterMove[end][0]).toBe("W3")
      expect(free.event.cameraFlashes).toEqual([{
        reel: scatterReel,
        triggeringCar: {
          start: { reel: 2, row: 0 },
          before: roll === 0 ? 2 : 5,
          after: roll === 0 ? 4 : 10,
        },
        doubledCars: [],
      }])
      const paid = resolveCarMove({
        board,
        stickyCars: [],
        activeCameraReels: [],
        randomFloat: () => roll,
      })
      expect(paid.boardAfterMove[scatterReel][0]).toBe("S")
      expect(paid.event.cars[0].direction).not.toBe(direction)
    },
  )

  it("doubles a newly landed car when it enters and stops on an active camera reel", () => {
    const board = emptyBoard()
    board[0][0] = "W3"
    board[4][3] = "S"
    const result = resolveCarMove({
      board,
      stickyCars: [],
      activeCameraReels: cameraActivationFromScatters(board, []).activeReels,
      allowScatterCrossing: true,
      randomFloat: () => 0,
    })
    expect(result.event.cars[0].end).toEqual({ reel: 4, row: 0 })
    expect(result.event.cars[0].multiplier).toBe(4)
    expect(result.event.cameraFlashes).toEqual([{
      reel: 4,
      triggeringCar: { start: { reel: 0, row: 0 }, before: 2, after: 4 },
      doubledCars: [],
    }])
    expect(stickyFromCars(result.carsAfterMove)[0].multiplier).toBe(4)
  })

  it.each([
    { start: 0, cameras: [1, 2], roll: 0, reels: [1, 2], initial: 2 },
    { start: 4, cameras: [2, 3], roll: 0.99, reels: [3, 2], initial: 5 },
  ])("doubles at every entered camera from reel $start", ({
    start, cameras, roll, reels, initial,
  }) => {
    const board = emptyBoard()
    board[start][0] = "W3"
    const result = resolveCarMove({
      board, stickyCars: [], activeCameraReels: cameras, randomFloat: () => roll,
    })
    expect(result.event.cars[0].initialMultiplier).toBe(initial)
    expect(result.event.cars[0].multiplier).toBe(initial * 4)
    expect(result.event.cameraFlashes).toEqual(reels.map((reel, index) => ({
      reel,
      triggeringCar: {
        start: { reel: start, row: 0 },
        before: initial * 2 ** index,
        after: initial * 2 ** (index + 1),
      },
      doubledCars: [],
    })))
  })

  it("doubles moving cars before adding their collision multipliers", () => {
    const board = emptyBoard()
    board[0][0] = "W2"
    board[4][0] = "W3"
    const result = resolveCarMove({
      board, stickyCars: [], activeCameraReels: [1, 2, 3], randomFloat: () => 0,
    })
    expect(hasLegalCarMovement(result.carsAfterMove)).toBe(true)
    expect(result.event.cars.map((car) => car.initialMultiplier)).toEqual([6, 2])
    expect(result.event.cars.map((car) => car.multiplier)).toEqual([28, 28])
    expect(result.event.cameraFlashes?.map((flash) => flash.triggeringCar.after))
      .toEqual([12, 24, 4])
  })

  it("does not make an edge-stopped car eligible for stationary doubles within its row", () => {
    const board = emptyBoard()
    board[1][0] = "W3"
    board[3][0] = "W3"
    const result = resolveCarMove({
      board, stickyCars: [], activeCameraReels: [1, 2, 4], randomFloat: () => 0.99,
    })
    expect(hasLegalCarMovement(result.carsAfterMove)).toBe(true)
    expect(result.event.cars.map((car) => car.direction)).toEqual(["left", "right"])
    expect(result.event.cars.map((car) => car.multiplier)).toEqual([10, 10])
    expect(result.event.cars[1].collision.kind).toBe("edge")
    expect(result.event.cameraFlashes?.map((flash) => flash.triggeringCar.after))
      .toEqual([10, 10])
    expect(result.event.cameraFlashes?.every((flash) => flash.doubledCars.length === 0))
      .toBe(true)
  })

  it("keeps stationary eligibility on later spins and settles each row before the next", () => {
    const firstBoard = emptyBoard()
    firstBoard[0][0] = "W3"
    const first = resolveCarMove({
      board: firstBoard, stickyCars: [], activeCameraReels: [4], randomFloat: () => 0,
    })
    expect(first.event.cars[0].multiplier).toBe(4)
    const stickyCars = stickyFromCars(first.carsAfterMove)
    const nextBoard = applyStickyCars(emptyBoard(), stickyCars)
    nextBoard[0][1] = "W3"
    nextBoard[0][2] = "W3"
    const next = resolveCarMove({
      board: nextBoard, stickyCars, activeCameraReels: [4], randomFloat: () => 0,
    })
    expect(next.event.cars.map((car) => car.multiplierAfterMove)).toEqual([4, 4])
    expect(next.event.cars.map((car) => car.multiplier)).toEqual([8, 4])
    expect(next.event.cameraFlashes?.map((flash) => flash.doubledCars)).toEqual([
      [{ position: { reel: 4, row: 0 }, before: 4, after: 8 }],
      [
        { position: { reel: 4, row: 0 }, before: 8, after: 16 },
        { position: { reel: 4, row: 1 }, before: 4, after: 8 },
      ],
    ])
    expect(next.multipliers.get("4:0")).toBe(16)
  })

  it("resolves all four rows in order and repeatedly doubles an earlier crashed pair", () => {
    const board = emptyBoard()
    board[0][0] = "W2"
    board[4][0] = "W3"
    for (let row = 1; row < HEIGHT; row++) board[0][row] = "W3"
    const result = resolveCarMove({
      board, stickyCars: [], activeCameraReels: [1, 2, 3], randomFloat: () => 0,
    })
    expect(hasLegalCarMovement(result.carsAfterMove)).toBe(true)
    expect(result.event.cars.map((car) => car.start.row)).toEqual([0, 0, 1, 2, 3])
    expect(result.event.cars.map((car) => car.multiplierAfterMove))
      .toEqual([28, 28, 16, 16, 16])
    expect(result.event.cars.map((car) => car.multiplier))
      .toEqual([224, 224, 16, 16, 16])
    expect(result.event.cameraFlashes?.map((flash) => flash.triggeringCar.start.row))
      .toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3])
    expect(result.event.cameraFlashes?.filter((flash) =>
      flash.triggeringCar.start.row === 0,
    ).every((flash) => flash.doubledCars.length === 0)).toBe(true)
    expect(result.event.cameraFlashes?.filter((flash) => flash.reel === 2)
      .map((flash) => flash.doubledCars)).toEqual([
        [],
        [{ position: { reel: 2, row: 0 }, before: 28, after: 56 }],
        [{ position: { reel: 2, row: 0 }, before: 56, after: 112 }],
        [{ position: { reel: 2, row: 0 }, before: 112, after: 224 }],
      ])
  })
})
