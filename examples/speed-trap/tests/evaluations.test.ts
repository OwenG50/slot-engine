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
  it.each([
    { symbols: ["W2", "W", "W", "S", "W1"], count: 3, basePayout: 2.5 },
    { symbols: ["W1", "W", "W", "W", "S"], count: 4, basePayout: 5 },
  ] satisfies Array<{ symbols: SymbolId[]; count: number; basePayout: number }>)(
    "pays $count leading wilds when a scatter breaks the line",
    ({ symbols, count, basePayout }) => {
      const win = firstLine(symbols, [64, 1, 1, 1, 100])
      expect(win).toMatchObject({
        symbol: "H1", count, basePayout, multiplier: 64, payout: basePayout * 64,
        positions: Array.from({ length: count }, (_, reel) => [reel, 0]),
      })
    },
  )

  it.each([
    { symbols: ["W3", "W", "W", "W", "L2"], symbol: "L2", count: 5, basePayout: 1.2, payout: 4.8 },
    { symbols: ["W3", "W", "W", "L1", "L1"], symbol: "L1", count: 5, basePayout: 1.2, payout: 4.8 },
    { symbols: ["W3", "W", "W", "L2", "S"], symbol: "L2", count: 4, basePayout: 0.6, payout: 2.4 },
  ] satisfies Array<{
    symbols: SymbolId[]; symbol: SymbolId; count: number; basePayout: number; payout: number
  }>)("prefers the longer $count-symbol $symbol match over a higher-paying wild prefix", ({
    symbols, symbol, count, basePayout, payout,
  }) => {
    const win = firstLine(symbols, [4])
    expect(win).toMatchObject({
      symbol, count, basePayout, multiplier: 4, payout,
      positions: Array.from({ length: count }, (_, reel) => [reel, 0]),
    })
  })

  it("includes wild multipliers throughout the longest match", () => {
    const win = firstLine(["W3", "W", "W", "L1", "W1"], [2, 1, 1, 1, 50])
    expect(win).toMatchObject({ symbol: "L1", count: 5, multiplier: 52, payout: 62.4 })
  })

  it.each([
    ["W1", "W", "S", "W", "W2"],
    ["S", "W1", "W", "W", "W2"],
  ] as SymbolId[][])("does not pay wild runs that are too short or do not start on reel 1: %s", (...symbols) => {
    expect(firstLine(symbols, [64, 1, 1, 1, 100])).toBeUndefined()
  })

  it("emits one four-wild award for the screenshot's second-row payline", () => {
    const board: Board = [
      ["L1", "W1", "W", "L1"],
      ["S", "W", "W", "H3"],
      ["L1", "W", "W", "L2"],
      ["H3", "W", "W", "S"],
      ["H4", "S", "W1", "H4"],
    ]
    const wins = evaluateLines(board, new Map([["0:1", 64], ["4:2", 30]]))
    const secondRow = wins.filter((win) => win.line === 2)
    expect(secondRow).toHaveLength(1)
    expect(secondRow[0]).toMatchObject({
      symbol: "H1", count: 4, basePayout: 5, multiplier: 64, payout: 320,
      positions: [[0, 1], [1, 1], [2, 1], [3, 1]],
    })
  })

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
