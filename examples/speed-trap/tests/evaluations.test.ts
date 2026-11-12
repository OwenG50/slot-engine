import { describe, expect, it } from "vitest"
import { evaluateLines } from "../src/evaluations"
import { Board, HEIGHT, SymbolId, WIDTH, positionKey } from "../src/types"

function firstLine(symbols: SymbolId[], values: number[] = []) {
  const board: Board = Array.from({ length: WIDTH }, (_, reel) =>
    Array.from({ length: HEIGHT }, (_, row) => row === 0 ? symbols[reel] : "S"),
  )
  const multipliers = new Map(
    values.map((value, reel) => [positionKey([reel, 0]), value]),
  )
  return evaluateLines(board, multipliers).find((win) => win.line === 1)!
}

describe("Speed Trap line multipliers", () => {
  it("adds only wild multipliers above 1 without an extra base multiplier", () => {
    const win = firstLine(["W1", "W2", "W", "W3", "H1"], [5, 3, 1, 1, 100])
    expect(win.multiplier).toBe(8)
    expect(win.payout).toBe(80)
  })

  it("uses a single qualifying wild's exact multiplier", () => {
    const win = firstLine(["W1", "H1", "W", "H1", "H1"], [5, 1, 1])
    expect(win.multiplier).toBe(5)
    expect(win.payout).toBe(50)
  })

  it("ignores multipliers outside the matched portion of a line", () => {
    const win = firstLine(["W1", "H1", "H1", "L1", "W2"], [3, 1, 1, 1, 50])
    expect(win.multiplier).toBe(3)
    expect(win.payout).toBe(7.5)
  })

  it.each([
    ["H1", "H1", "H1", "H1", "H1"],
    ["W", "H1", "W3", "H1", "H1"],
    ["W", "W1", "W2", "W3", "W"],
  ] as SymbolId[][])("pays at 1x when no wild exceeds 1x: %s", (...symbols) => {
    const win = firstLine(symbols, [1, 1, 1, 1, 1])
    expect(win.multiplier).toBe(1)
    expect(win.payout).toBe(10)
  })

  it("applies the same additive rule to all-wild lines", () => {
    const win = firstLine(["W1", "W2", "W", "W3", "W"], [5, 3, 1, 1, 1])
    expect(win.multiplier).toBe(8)
    expect(win.payout).toBe(80)
  })

  it("defaults missing multiplier entries to an unmultiplied line", () => {
    expect(firstLine(["W", "W1", "W2", "W3", "W"]).multiplier).toBe(1)
  })
})
