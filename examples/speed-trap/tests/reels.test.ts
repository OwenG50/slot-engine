import { describe, expect, it } from "vitest"
import { capWins, evaluateLines } from "../src/evaluations"
import { hasLegalCarLandings, hasLegalCarMovement, resolveCarMove } from "../src/feature"
import { maxWinReelStops } from "../src/reels"
import { Board, HEIGHT, MAX_WIN, SymbolId, WIDTH } from "../src/types"

describe("Speed Trap max-win reel sampling", () => {
  it("aligns existing car stops without changing strips or neighboring cells", () => {
    const strips = Array.from({ length: WIDTH }, (_, reel) =>
      ["L1", "W3", "L2", reel === 0 ? "W2" : "W1", "L3", "H1"].map((id) => ({ id })),
    )
    const before = structuredClone(strips)
    for (const roll of [0, 0.3, 0.6, 0.99]) {
      const stops = maxWinReelStops(strips, () => roll)
      const row = Math.floor(roll * HEIGHT)
      strips.forEach((strip, reel) => {
        expect(strip[(stops[reel] + row) % strip.length].id).toBe(
          reel === 0 ? "W3" : reel === WIDTH - 1 ? "W1" : "H1",
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
    const stops = maxWinReelStops(strips, () => 0.99)
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
    const otherRow = maxWinReelStops(strips, () => 0.99, [0, 1])
    expect(strips[0][(otherRow[0] + 1) % strips[0].length].id).toBe("W1")
  })

  it("reports missing car stops instead of inventing symbols", () => {
    expect(() => maxWinReelStops([[{ id: "H1" }]], () => 0)).toThrow(
      "Speed Trap max-win sampling needs car symbols on reel 0",
    )
  })

  it("keeps mixed-tier edge stops distinct even when reels share a strip", () => {
    const strip = ["W3", "H1", "W1"].map((id) => ({ id }))
    const strips = Array.from({ length: WIDTH }, () => strip)
    const stops = maxWinReelStops(strips, () => 0, [0])
    expect(strip[stops[0]].id).toBe("W3")
    expect(strip[stops[WIDTH - 1]].id).toBe("W1")
    for (let reel = 1; reel < WIDTH - 1; reel++)
      expect(strip[stops[reel]].id).toBe("H1")
  })
})
