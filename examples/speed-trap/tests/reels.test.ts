import { describe, expect, it } from "vitest"
import { capWins, evaluateLines } from "../src/evaluations"
import { hasLegalCarLandings, hasLegalCarMovement, resolveCarMove } from "../src/feature"
import { maxWinReelStops } from "../src/reels"
import { Board, HEIGHT, MAX_WIN, SymbolId, WIDTH } from "../src/types"

describe("Speed Trap max-win reel sampling", () => {
  it("aligns existing car stops without changing strips or neighboring cells", () => {
    const strips = Array.from({ length: WIDTH }, () =>
      ["L1", "W3", "L2", "W2", "W1", "H1"].map((id) => ({ id })),
    )
    const before = structuredClone(strips)
    const placements = [[0, 3], [0, 4], [1, 4], [1, 3]]
    for (const [index, roll] of [0, 0.3, 0.6, 0.99].entries()) {
      const stops = maxWinReelStops(strips, () => roll)
      const row = Math.floor(roll * HEIGHT)
      strips.forEach((strip, reel) => {
        expect(strip[(stops[reel] + row) % strip.length].id).toBe(
          placements[index].includes(reel) ? ["W1", "W2", "W3"][Math.floor(roll * 3)] : "H1",
        )
        expect(stops[reel]).toBeGreaterThanOrEqual(0)
        expect(stops[reel]).toBeLessThan(strip.length)
      })
    }
    expect(strips).toEqual(before)
  })

  it("funds max-win bonus progression through real car movement and capped line wins", () => {
    const strips = Array.from({ length: WIDTH }, () =>
      (["W1", "L1", "L2", "L3", "H1", "L4"] as SymbolId[]).map((id) => ({ id })),
    )
    const edgePairRolls = () => {
      let call = 0
      return () => ++call === 2 ? 0.3 : 0.99
    }
    const stops = maxWinReelStops(strips, edgePairRolls())
    const board: Board = strips.map((strip, reel) =>
      Array.from(
        { length: HEIGHT },
        (_, row) => strip[(stops[reel] + row) % strip.length].id,
      ),
    )
    const movement = resolveCarMove({
      board,
      stickyCars: [],
      activeCameraReels: [],
      randomFloat: () => 0.99,
    })
    const wins = evaluateLines(movement.boardAfterMove, movement.multipliers)
    expect(hasLegalCarLandings(board, [])).toBe(true)
    expect(hasLegalCarMovement(movement.carsAfterMove)).toBe(true)
    expect(wins.reduce((sum, win) => sum + win.payout, 0)).toBe(2100)
    expect(capWins(wins, 1000).reduce((sum, win) => sum + win.payout, 0)).toBe(1000)
    const otherRow = maxWinReelStops(strips, edgePairRolls(), [0, 1])
    expect(strips[0][(otherRow[0] + 1) % strips[0].length].id).toBe("W1")
  })

  it("reports missing car stops instead of inventing symbols", () => {
    expect(() => maxWinReelStops([[{ id: "H1" }]], () => 0)).toThrow(
      "Speed Trap max-win sampling needs car symbols on reel 0",
    )
  })

  it("varies car tiers independently on both sides, spawn reels, rows, and movement", () => {
    const strip = (["W1", "W2", "W3", "H1"] as SymbolId[]).flatMap((id) =>
      [id, "L1", "L2", "L3", "L4"].map((symbol) => ({ id: symbol as SymbolId })),
    )
    const strips = Array.from({ length: WIDTH }, () => strip)
    let seed = 42
    const randomFloat = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 2 ** 32
    }
    const pairs = new Map<string, number>()
    const placements = new Map<string, number>()
    const rows = new Set<number>()
    const collisionReels = new Set<number>()
    let outward = 0
    for (let sample = 0; sample < 3600; sample++) {
      const stops = maxWinReelStops(strips, randomFloat)
      const board: Board = strips.map((strip, reel) =>
        Array.from({ length: HEIGHT }, (_, row) => strip[(stops[reel] + row) % strip.length].id),
      )
      const cars = board.flatMap((reel, x) =>
        reel.flatMap((symbol, y) => /^W[123]$/.test(symbol) ? [{ symbol, x, y }] : []),
      )
      expect(cars).toHaveLength(2)
      expect(cars[0].y).toBe(cars[1].y)
      rows.add(cars[0].y)
      const pair = cars.map((car) => car.symbol).join("-")
      pairs.set(pair, (pairs.get(pair) ?? 0) + 1)
      const placement = cars.map((car) => car.x).join("-")
      placements.set(placement, (placements.get(placement) ?? 0) + 1)
      const movement = resolveCarMove({
        board, stickyCars: [], activeCameraReels: [], randomFloat,
      })
      expect(hasLegalCarLandings(board, [])).toBe(true)
      expect(hasLegalCarMovement(movement.carsAfterMove)).toBe(true)
      for (const car of movement.event.cars)
        if (car.collision.kind === "newNew") collisionReels.add(car.end.reel)
      if (movement.event.cars.every((car) => car.collision.kind === "edge")) outward++
    }
    expect(pairs.size).toBe(9)
    for (const count of pairs.values()) expect(count).toBeGreaterThan(300)
    expect(placements.size).toBe(4)
    for (const count of placements.values()) expect(count).toBeGreaterThan(750)
    expect(rows.size).toBe(HEIGHT)
    expect([...collisionReels].sort()).toEqual([1, 2, 3])
    expect(outward).toBeGreaterThan(750)
  })
})
