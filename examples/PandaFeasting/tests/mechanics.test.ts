import { describe, expect, it } from "vitest"
import { LinesWinType, RandomNumberGenerator } from "@slot-engine/core"
import { evaluateLines, capWins } from "../src/evaluations"
import { advanceStage, collectLowSymbols, spawnWilds, startFeature } from "../src/feature"
import { PAYLINES } from "../src/paylines"
import { PAYTABLE } from "../src/paytable"
import { FEATURE_RULES } from "../src/settings"
import { Board, MAX_WIN, PAYING_SYMBOLS, Wild } from "../src/types"
import { fixture, fullBoard, losingBoard } from "./fixture"

describe("the eleven image paylines", () => {
  it("matches the confirmed image transcription", () => {
    expect(Object.values(PAYLINES).map((line) => line.join(""))).toEqual([
      "00000",
      "11111",
      "22222",
      "01210",
      "21012",
      "01010",
      "12121",
      "10101",
      "21212",
      "00122",
      "22100",
    ])
  })
  it.each(PAYING_SYMBOLS)("pays the supplied total-bet values for %s", (symbol) => {
    for (const count of [3, 4, 5]) {
      const board = losingBoard()
      for (let x = 0; x < count; x++) board[x][0] = symbol
      if (count < 5) board[count][0] = "S"
      const win = evaluateLines(board).find((win) => win.line === 1)!
      expect(win.count).toBe(count)
      expect(win.payout).toBe(PAYTABLE[symbol][count])
    }
  })
  it("does not pay right-to-left, disconnected or scatter combinations", () => {
    const board = losingBoard()
    for (let x = 2; x < 5; x++) board[x][0] = "H1"
    expect(evaluateLines(board).some((win) => win.line === 1)).toBe(false)
    expect(evaluateLines(fullBoard("S"))).toEqual([])
  })
  it("adds only wild multipliers participating in that line", () => {
    const board = losingBoard()
    board[0][0] = "H1"
    board[1][0] = "W"
    board[2][0] = "W"
    board[3][0] = "S"
    const wilds: Wild[] = [
      { position: [1, 0], multiplier: 2 },
      { position: [2, 0], multiplier: 25 },
      { position: [4, 2], multiplier: 10 },
    ]
    expect(evaluateLines(board, wilds).find((win) => win.line === 1)).toMatchObject({
      count: 3,
      basePayout: 8,
      multiplier: 27,
      payout: 216,
    })
  })
  it("keeps every single line below max win with the revised paytable", () => {
    expect(evaluateLines(fullBoard("W"))).toHaveLength(11)
    expect(evaluateLines(fullBoard("W"))[0]).toMatchObject({ symbol: "H1", payout: 250 })
    const allWilds: Wild[] = fullBoard("W").flatMap((reel, x) =>
      reel.map((_, y) => ({ position: [x, y] as [number, number], multiplier: 25 })),
    )
    expect(
      evaluateLines(fullBoard("W"), allWilds).every((win) => win.payout === 6250),
    ).toBe(true)
    for (const pays of Object.values(PAYTABLE))
      for (const [count, payout] of Object.entries(pays))
        expect(payout * Number(count) * 25).toBeLessThan(MAX_WIN)
    const board = losingBoard()
    board[0][0] = "W"
    board[1][0] = "W"
    board[2][0] = "W"
    board[3][0] = "H1"
    board[4][0] = "H1"
    const wilds: Wild[] = [0, 1, 2].map((x) => ({ position: [x, 0], multiplier: 25 }))
    expect(evaluateLines(board, wilds).find((win) => win.line === 1)?.payout).toBe(3750)
    board[3][0] = "W"
    wilds.push({ position: [3, 0], multiplier: 25 })
    expect(evaluateLines(board, wilds).find((win) => win.line === 1)?.payout).toBe(5000)
  })
  it("still reaches the round cap through multiple lines with eight added wilds", () => {
    const board = fullBoard("H1")
    const wilds: Wild[] = []
    for (let reel = 0; reel < 4; reel++)
      for (let row = 0; row < 2; row++) {
        board[reel][row] = "W"
        wilds.push({ position: [reel, row], multiplier: 25 })
      }
    expect(wilds).toHaveLength(8)
    const wins = evaluateLines(board, wilds)
    expect(wins.find((win) => win.line === 1)?.payout).toBe(5000)
    expect(wins.find((win) => win.line === 2)?.payout).toBe(5000)
    expect(wins.every((win) => win.payout < MAX_WIN)).toBe(true)
    expect(capWins(wins, MAX_WIN).reduce((sum, win) => sum + win.payout, 0)).toBe(MAX_WIN)
    expect(capWins(wins, 0.03).reduce((sum, win) => sum + win.payout, 0)).toBe(0.03)
  })
  it("agrees with the installed native line evaluator on 1000 non-all-wild boards", () => {
    const rng = new RandomNumberGenerator()
    rng.setSeed(7183)
    const { ctx } = fixture("base")
    for (let n = 0; n < 1000; n++) {
      const focus = rng.randomItem([...PAYING_SYMBOLS])
      const board: Board = Array.from({ length: 5 }, () =>
        Array.from({ length: 3 }, () =>
          rng.randomItem([
            ...PAYING_SYMBOLS,
            focus,
            focus,
            focus,
            "W",
            "S",
          ] as Board[number]),
        ),
      )
      // Pin reel 1 to real symbols; all-wild behavior is tested explicitly above.
      board[0] = board[0].map(() => focus)
      const native = new LinesWinType({
        ctx,
        lines: PAYLINES,
        wildSymbol: { isWild: true },
      })
        .evaluateWins(board.map((reel) => reel.map((id) => ctx.config.symbols.get(id)!)))
        .getWins().winCombinations
      expect(
        evaluateLines(board).map((win) => [
          win.line,
          win.symbol,
          win.count,
          win.basePayout,
        ]),
      ).toEqual(
        native.map((win) => [win.lineNumber, win.baseSymbol.id, win.kind, win.payout]),
      )
    }
  })
})

describe("collection and spawning", () => {
  it("collects each actual low once across intersecting winning lines, excluding wilds", () => {
    const board = fullBoard("L1")
    board[0][0] = "W"
    const cells = collectLowSymbols(board, evaluateLines(board))
    expect(cells).toHaveLength(14)
    expect(new Set(cells.map((cell) => `${cell.reel},${cell.row}`)).size).toBe(14)
    expect(cells.every((cell) => cell.symbol === "L1")).toBe(true)
    expect(cells).not.toContainEqual({ symbol: "W", reel: 0, row: 0 })
  })
  it("collects no losing low symbols or symbols from non-paying capped lines", () => {
    const board = losingBoard()
    board[4][2] = "L1"
    expect(collectLowSymbols(board, evaluateLines(board))).toEqual([])
    expect(
      collectLowSymbols(fullBoard("L1"), capWins(evaluateLines(fullBoard("L1")), 0)),
    ).toEqual([])
  })
  it.each([
    { tier: "normal" as const, threshold: 15 },
    { tier: "super" as const, threshold: 12 },
    { tier: "hidden" as const, threshold: 10 },
  ])(
    "requires $threshold actual collected symbols at every $tier stage and discards surplus",
    ({ tier, threshold }) => {
      const state = startFeature(tier)
      expect(Object.values(FEATURE_RULES.stageThresholds[tier])).toEqual(
        Array(4).fill(threshold),
      )
      expect(advanceStage(state, threshold - 1)).toEqual([])
      expect(advanceStage(state, 15)).toEqual([2])
      expect(state.progress).toBe(0)
      for (const stage of [3, 4, 5]) expect(advanceStage(state, 15)).toEqual([stage])
      expect(advanceStage(state, 15)).toEqual([])
      expect(state.progress).toBe(0)
    },
  )
  it("spawns 3–10 distinct new cells, preserving scatters and existing wilds", () => {
    const rng = new RandomNumberGenerator()
    rng.setSeed(71)
    for (let count = 3; count <= 10; count++) {
      const board = fullBoard("L1")
      board[0][0] = "S"
      board[1][0] = "W"
      const wilds = spawnWilds(board, count, () => 25, rng)
      expect(new Set(wilds.map((wild) => wild.position.join(","))).size).toBe(count)
      expect(board[0][0]).toBe("S")
      expect(board[1][0]).toBe("W")
      expect(wilds.every((wild) => wild.multiplier === 25)).toBe(true)
    }
  })
})
