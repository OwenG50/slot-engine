import { PAYTABLE } from "./paytable"
import { PAYLINES } from "./paylines"
import {
  Board,
  cents,
  HEIGHT,
  LineWin,
  Position,
  Wild,
  WIDTH,
  positionKey,
} from "./types"

/** Left-to-right contiguous wins, one longest win per line.
 * An entirely wild line substitutes H1. Wilds do not substitute scatters. */
export function evaluateLines(board: Board, wilds: Wild[] = []): LineWin[] {
  if (board.length !== WIDTH || board.some((reel) => reel.length !== HEIGHT))
    throw new Error("PandaFeasting requires an unpadded 5x3 board")
  const multipliers = new Map(
    wilds.map((wild) => [positionKey(wild.position), wild.multiplier]),
  )
  const wins: LineWin[] = []
  for (const [line, rows] of Object.entries(PAYLINES)) {
    const symbols = rows.map((row, reel) => board[reel][row])
    const firstReal = symbols.find((symbol) => symbol !== "W")
    if (firstReal === "S") continue
    const symbol = firstReal ?? "H1"
    const positions: Position[] = []
    for (let reel = 0; reel < WIDTH; reel++) {
      if (symbols[reel] !== symbol && symbols[reel] !== "W") break
      positions.push([reel, rows[reel]])
    }
    const basePayout = PAYTABLE[symbol][positions.length] ?? 0
    if (!basePayout) continue
    const multiplier = Math.max(
      1,
      positions.reduce(
        (sum, pos) =>
          sum +
          (board[pos[0]][pos[1]] === "W" ? (multipliers.get(positionKey(pos)) ?? 1) : 0),
        0,
      ),
    )
    wins.push({
      line: Number(line),
      symbol,
      positions,
      count: positions.length,
      basePayout,
      multiplier,
      payout: cents(basePayout * multiplier),
    })
  }
  return wins
}

/** Allocate the remaining round cap in integer cents, preserving raw win metadata. */
export function capWins(wins: LineWin[], remaining: number): LineWin[] {
  let available = Math.max(0, Math.round(remaining * 100))
  return wins.map((win) => {
    const award = Math.min(available, Math.round(win.payout * 100))
    available -= award
    return { ...win, payout: award / 100 }
  })
}
