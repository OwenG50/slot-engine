import { describe, expect, it } from "vitest"
import { capWins, evaluateClusters } from "../src/evaluations"
import { PAYTABLE } from "../src/paytable"
import { Board, PAYING_SYMBOLS, RoamingWild } from "../src/types"
import { applyWilds, footprint, validAnchors } from "../src/wilds"

const empty = (): Board => Array.from({ length: 5 }, () => Array(5).fill("S"))

describe("ButchEm clusters", () => {
  it("pays every count from 5 through 25 and preserves all symbol rankings", () => {
    for (let count = 5; count <= 25; count++) {
      expect(PAYTABLE.L1[count]).toBe(PAYTABLE.L2[count])
      expect(PAYTABLE.L3[count]).toBe(PAYTABLE.L4[count])
      expect(PAYTABLE.H4[count]).toBeGreaterThan(
        Math.max(PAYTABLE.L1[count], PAYTABLE.L3[count]),
      )
      expect(PAYTABLE.H3[count]).toBeGreaterThan(PAYTABLE.H4[count])
      expect(PAYTABLE.H2[count]).toBeGreaterThan(PAYTABLE.H3[count])
      expect(PAYTABLE.H1[count]).toBeGreaterThan(PAYTABLE.H2[count])
      for (const symbol of PAYING_SYMBOLS) {
        expect(Number.isInteger(PAYTABLE[symbol][count] * 10)).toBe(true)
        if (count > 5) {
          expect(PAYTABLE[symbol][count]).toBeGreaterThanOrEqual(
            PAYTABLE[symbol][count - 1],
          )
        }
        const board = empty()
        // Column snake fills one connected component for every count.
        for (let i = 0; i < count; i++) {
          const x = Math.floor(i / 5)
          const y = x % 2 === 0 ? i % 5 : 4 - (i % 5)
          board[x][y] = symbol
        }
        expect(evaluateClusters(board)).toMatchObject([
          { symbol, count, payout: PAYTABLE[symbol][count] },
        ])
        if (count >= 15) expect(PAYTABLE[symbol][count]).toBe(PAYTABLE[symbol][15])
      }
    }
  })

  it("uses the requested minimum and maximum payouts", () => {
    expect(PAYING_SYMBOLS.map((symbol) => PAYTABLE[symbol][5])).toEqual([
      0.4, 0.4, 0.2, 0.2, 0.5, 0.8, 1, 1.5,
    ])
    expect(PAYING_SYMBOLS.map((symbol) => PAYTABLE[symbol][15])).toEqual([
      40, 40, 20, 20, 50, 80, 100, 200,
    ])
  })
  it("lets the same wild pay as H1 and H3 in separate clusters", () => {
    const board = empty()
    board[2][2] = "W"
    for (const [x, y] of [
      [0, 2],
      [1, 2],
      [1, 1],
      [0, 1],
    ])
      board[x][y] = "H1"
    for (const [x, y] of [
      [3, 2],
      [4, 2],
      [3, 3],
      [4, 3],
    ])
      board[x][y] = "H3"
    const wins = evaluateClusters(board)
    expect(wins).toHaveLength(2)
    for (const win of wins) {
      expect(win.positions).toContainEqual([2, 2])
      expect(win.payout).toBe(PAYTABLE[win.symbol][5])
    }
  })

  it("merges same-symbol areas through wilds and does not pay wild-only boards", () => {
    const board = empty()
    for (let x = 0; x < 5; x++) board[x][2] = x === 2 ? "W" : "H2"
    expect(evaluateClusters(board)).toMatchObject([{ count: 5, symbol: "H2" }])
    expect(evaluateClusters(Array.from({ length: 5 }, () => Array(5).fill("W")))).toEqual(
      [],
    )
  })

  it("rejects diagonal connections, four-symbol groups, and padding", () => {
    const board = empty()
    for (let x = 0; x < 5; x++) board[x][x] = "H1"
    expect(evaluateClusters(board)).toEqual([])
    const four = empty()
    four[0] = ["H1", "H1", "H1", "H1", "S"]
    expect(evaluateClusters(four)).toEqual([])
    expect(() => evaluateClusters([...board, board[0]])).toThrow("unpadded")
  })

  it("caps awarded clusters to the remaining round budget", () => {
    const board: Board = Array.from({ length: 5 }, () => Array(5).fill("H1"))
    const wins = capWins(evaluateClusters(board), 0.15)
    expect(wins[0].payout).toBe(0.15)
    expect(capWins(wins, 0)[0].payout).toBe(0)
  })
})

describe("ButchEm wild geometry", () => {
  it("anchors a 2x2 at its bottom left and keeps every legal footprint on board", () => {
    expect(footprint([2, 2], "2")).toEqual([
      [2, 2],
      [3, 2],
      [2, 1],
      [3, 1],
    ])
    expect(validAnchors("2")).toHaveLength(16)
    for (const anchor of validAnchors("2")) expect(footprint(anchor, "2")).toHaveLength(4)
    expect(() => footprint([0, 0], "2")).toThrow()
    expect(() => footprint([4, 4], "2")).toThrow()
  })

  it("overlays all four cells and only leaves a trail when configured", () => {
    const board = empty()
    const wilds = [
      {
        multiplier: 25,
        size: "2" as const,
        positions: [
          [0, 1],
          [3, 4],
        ] as [number, number][],
      },
    ]
    const final = applyWilds(board, wilds, false)
    expect(final.flat().filter((symbol) => symbol === "W")).toHaveLength(4)
    expect(
      applyWilds(board, wilds, true)
        .flat()
        .filter((symbol) => symbol === "W"),
    ).toHaveLength(8)
    expect(board.flat().every((symbol) => symbol === "S")).toBe(true)
  })
})
