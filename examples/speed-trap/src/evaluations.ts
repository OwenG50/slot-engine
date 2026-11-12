import { PAYTABLE } from "./paytable"
import { PAYLINES } from "./paylines"
import {
  Board,
  cents,
  HEIGHT,
  LineWin,
  Position,
  SymbolId,
  WIDTH,
  isWildSymbol,
  positionKey,
} from "./types"

export function evaluateLines(
  board: Board,
  multipliers: Map<string, number> = new Map(),
): LineWin[] {
  if (board.length !== WIDTH || board.some((reel) => reel.length !== HEIGHT))
    throw new Error("Speed Trap requires an unpadded 5x4 board")

  const wins: LineWin[] = []
  for (const [line, rows] of Object.entries(PAYLINES)) {
    const symbols = rows.map((row, reel) => board[reel][row])
    const firstReal = symbols.find((symbol) => !isWildSymbol(symbol))
    if (!firstReal || firstReal === "S") {
      if (symbols.every((symbol) => isWildSymbol(symbol))) {
        const positions = rows.map((row, reel) => [reel, row] as Position)
        const basePayout = PAYTABLE.H1[5]
        const multiplier = Math.max(
          1,
          positions.reduce((sum, pos) => {
            const value = multipliers.get(positionKey(pos)) ?? 1
            return sum + (value > 1 ? value : 0)
          }, 0),
        )
        wins.push({
          line: Number(line),
          symbol: "H1",
          positions,
          count: 5,
          basePayout,
          multiplier,
          payout: cents(basePayout * multiplier),
        })
      }
      continue
    }

    const symbol = firstReal as Exclude<SymbolId, "W" | "W1" | "W2" | "W3" | "S">
    const positions: Position[] = []
    for (let reel = 0; reel < WIDTH; reel++) {
      if (symbols[reel] !== symbol && !isWildSymbol(symbols[reel])) break
      positions.push([reel, rows[reel]])
    }
    const basePayout = PAYTABLE[symbol][positions.length] ?? 0
    if (!basePayout) continue

    const multiplier = Math.max(
      1,
      positions.reduce((sum, pos) => {
        const current = board[pos[0]][pos[1]]
        const value = multipliers.get(positionKey(pos)) ?? 1
        return sum + (isWildSymbol(current) && value > 1 ? value : 0)
      }, 0),
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

export function capWins(wins: LineWin[], remaining: number): LineWin[] {
  let available = Math.max(0, Math.round(remaining * 100))
  return wins.map((win) => {
    const award = Math.min(available, Math.round(win.payout * 100))
    available -= award
    return { ...win, payout: award / 100 }
  })
}
