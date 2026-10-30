import { describe, expect, it } from "vitest"
import { LinesWinType, RandomNumberGenerator } from "@slot-engine/core"
import { evaluateLines, capWins } from "../src/evaluations"
import {
  advanceStage,
  collectLowSymbols,
  featureSpinStage,
  isFeatureComplete,
  spawnWilds,
  startFeature,
  weightedNumber,
} from "../src/feature"
import { winInfo } from "../src/events"
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
      basePayout: 5,
      multiplier: 27,
      payout: 135,
    })
  })
  it.each([
    [1, 1, 1],
    [2, 1, 2],
    [2, 2, 4],
    [1, 5, 5],
  ])("combines %ix and %ix wilds as %ix", (first, second, expected) => {
    const board = losingBoard()
    board[0][0] = "H1"
    board[1][0] = "W"
    board[2][0] = "W"
    board[3][0] = "S"
    const wilds: Wild[] = [
      { position: [1, 0], multiplier: first },
      { position: [2, 0], multiplier: second },
    ]
    expect(evaluateLines(board, wilds).find((win) => win.line === 1)).toMatchObject({
      basePayout: 5,
      multiplier: expected,
      payout: 5 * expected,
    })
  })
  it("excludes 1x wilds from the supplied three-line winInfo example", () => {
    const board = losingBoard()
    board[0] = ["L4", "H5", "L2"]
    board[3][1] = "S"
    const wilds: Wild[] = [
      { position: [4, 0], multiplier: 5 },
      { position: [4, 2], multiplier: 1 },
      { position: [2, 0], multiplier: 1 },
      { position: [1, 1], multiplier: 1 },
      { position: [3, 0], multiplier: 1 },
      { position: [2, 1], multiplier: 5 },
    ]
    for (const {
      position: [reel, row],
    } of wilds)
      board[reel][row] = "W"
    const result = winInfo(evaluateLines(board, wilds))
    expect(result.totalWin).toBe(7.8)
    expect(result.wins.map(({ symbol, win, meta }) => ({ symbol, win, meta }))).toEqual([
      { symbol: "H5", win: 7.5, meta: { multiplier: 5, winWithoutMult: 1.5 } },
      { symbol: "L2", win: 0.2, meta: { multiplier: 1, winWithoutMult: 0.2 } },
      { symbol: "L4", win: 0.1, meta: { multiplier: 1, winWithoutMult: 0.1 } },
    ])
  })
  it("keeps every single line below max win with the revised paytable", () => {
    expect(evaluateLines(fullBoard("W"))).toHaveLength(11)
    expect(evaluateLines(fullBoard("W"))[0]).toMatchObject({ symbol: "H1", payout: 30 })
    const allWilds: Wild[] = fullBoard("W").flatMap((reel, x) =>
      reel.map((_, y) => ({ position: [x, y] as [number, number], multiplier: 50 })),
    )
    expect(
      evaluateLines(fullBoard("W"), allWilds).every((win) => win.payout === 7500),
    ).toBe(true)
    for (const pays of Object.values(PAYTABLE))
      for (const [count, payout] of Object.entries(pays))
        expect(payout * Number(count) * 50).toBeLessThan(MAX_WIN)
    const board = losingBoard()
    board[0][0] = "W"
    board[1][0] = "W"
    board[2][0] = "W"
    board[3][0] = "H1"
    board[4][0] = "H1"
    const wilds: Wild[] = [0, 1, 2].map((x) => ({ position: [x, 0], multiplier: 50 }))
    expect(evaluateLines(board, wilds).find((win) => win.line === 1)?.payout).toBe(4500)
    board[3][0] = "W"
    wilds.push({ position: [3, 0], multiplier: 50 })
    expect(evaluateLines(board, wilds).find((win) => win.line === 1)?.payout).toBe(6000)
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
    expect(wins.find((win) => win.line === 1)?.payout).toBe(3000)
    expect(wins.find((win) => win.line === 2)?.payout).toBe(3000)
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
  it("keeps the regular FeatureSpin stage proposal weights with the revised ladder", () => {
    expect(FEATURE_RULES.featureSpinStageWeights).toEqual({
      1: 50,
      2: 30,
      3: 6,
      4: 6,
      5: 6,
      6: 2,
    })
    for (const [draw, stage, multiplier] of [
      [0, 1, 1],
      [49.99, 1, 1],
      [50, 2, 2],
      [79.99, 2, 2],
      [80, 3, 5],
      [86, 4, 10],
      [92, 5, 25],
      [98, 6, 50],
    ] as const) {
      const rng = new RandomNumberGenerator()
      rng.randomFloat = () => draw
      const selected = featureSpinStage(rng)
      expect(selected).toBe(stage)
      expect(FEATURE_RULES.stageMultipliers[selected]).toBe(multiplier)
    }
  })
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
    { tier: "normal" as const, thresholds: [10, 12, 15, 18, 21, 24] },
    { tier: "super" as const, thresholds: [9, 11, 13, 16, 19, 22] },
    { tier: "hidden" as const, thresholds: [8, 10, 12, 14, 17, 20] },
  ])(
    "uses the threshold for each $tier stage and discards surplus",
    ({ tier, thresholds }) => {
      const state = startFeature(tier)
      expect(Object.values(FEATURE_RULES.stageThresholds[tier])).toEqual(thresholds)
      thresholds.slice(0, 5).forEach((threshold, index) => {
        expect(advanceStage(state, threshold - 1)).toEqual([])
        expect(advanceStage(state, 15)).toEqual([index + 2])
        expect(state.progress).toBe(0)
      })
      const finalThreshold = thresholds[5]
      expect(isFeatureComplete(state)).toBe(false)
      expect(advanceStage(state, finalThreshold - 1)).toEqual([])
      expect(state.progress).toBe(finalThreshold - 1)
      expect(isFeatureComplete(state)).toBe(false)
      expect(advanceStage(state, 1)).toEqual([])
      expect(state).toEqual({ tier, stage: 6, progress: finalThreshold })
      expect(isFeatureComplete(state)).toBe(true)
      expect(advanceStage(state, 15)).toEqual([])
      expect(state.progress).toBe(finalThreshold)
    },
  )
  it.each(["normal", "super", "hidden"] as const)(
    "clamps surplus food at the final %s threshold without unlocking another stage",
    (tier) => {
      const state = { ...startFeature(tier), stage: 6 as const }
      expect(advanceStage(state, 100)).toEqual([])
      expect(state.progress).toBe(FEATURE_RULES.stageThresholds[tier][6])
      expect(state.stage).toBe(6)
      expect(isFeatureComplete(state)).toBe(true)
    },
  )
  it("supports every count from 3 to 15 in the shared launch pool", () => {
    const weights = FEATURE_RULES.spawnCountWeights
    expect(Object.keys(weights).map(Number)).toEqual(
      Array.from({ length: 13 }, (_, index) => index + 3),
    )
    const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0)
    expect(weights[15] / total).toBeCloseTo(1 / 101.9, 10)
    expect([weights[11], weights[12], weights[13], weights[14], weights[15]]).toEqual([
      0.5, 0.25, 0.1, 0.05, 1,
    ])
    let start = 0
    for (const [count, weight] of Object.entries(weights)) {
      expect(
        weightedNumber(weights, {
          randomFloat: () => start + weight / 2,
          randomItem: (items) => items[0],
        }),
      ).toBe(Number(count))
      start += weight
    }
  })
  it("spawns 3–15 distinct new cells", () => {
    const rng = new RandomNumberGenerator()
    rng.setSeed(71)
    for (let count = 3; count <= 15; count++) {
      const board = fullBoard("L1")
      const wilds = spawnWilds(board, count, () => 50, rng)
      expect(wilds).toHaveLength(count)
      expect(new Set(wilds.map((wild) => wild.position.join(","))).size).toBe(count)
      expect(board.flat().filter((symbol) => symbol === "W")).toHaveLength(count)
      expect(wilds.every((wild) => wild.multiplier === 50)).toBe(true)
    }
  })
  it("preserves scatters and existing wilds with up to 13 eligible cells", () => {
    const rng = new RandomNumberGenerator()
    rng.setSeed(71)
    for (let count = 3; count <= 13; count++) {
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
  it.each([0, -1, 1.5, 16, NaN, Infinity])("rejects invalid spawn count %s", (count) => {
    expect(() =>
      spawnWilds(fullBoard("L1"), count, () => 1, new RandomNumberGenerator()),
    ).toThrow("Wild spawn needs 1–15 distinct non-wild, non-scatter cells")
  })
  it("rejects counts exceeding eligible cells without changing the board", () => {
    const board = fullBoard("L1")
    board[0][0] = "S"
    board[1][0] = "W"
    const original = structuredClone(board)
    expect(() =>
      spawnWilds(board, 14, () => 1, new RandomNumberGenerator()),
    ).toThrow("Wild spawn needs 1–15 distinct non-wild, non-scatter cells")
    expect(board).toEqual(original)
  })
})
