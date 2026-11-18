import { PAYTABLE } from "./paytable"
import { PAYLINES } from "./paylines"
import {
  Board,
  cents,
  HEIGHT,
  LineWin,
  PAYING_SYMBOLS,
  PayingSymbol,
  Position,
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
    const symbol = PAYING_SYMBOLS.find((symbol) => symbol === firstReal)
    const candidates: Array<{ symbol: PayingSymbol; count: number }> = []
    if (symbol) {
      let count = 0
      while (
        count < WIDTH &&
        (symbols[count] === symbol || isWildSymbol(symbols[count]))
      ) count++
      candidates.push({ symbol, count })
    }

    let wildCount = 0
    while (wildCount < WIDTH && isWildSymbol(symbols[wildCount])) wildCount++
    candidates.push({ symbol: "H1", count: wildCount })

    let best: LineWin | undefined
    for (const { symbol, count } of candidates) {
      const basePayout = PAYTABLE[symbol][count] ?? 0
      if (!basePayout) continue
      const positions = rows.slice(0, count).map((row, reel): Position => [reel, row])
      const multiplier = Math.max(
        1,
        positions.reduce((sum, pos) => {
          const current = board[pos[0]][pos[1]]
          const value = multipliers.get(positionKey(pos)) ?? 1
          return sum + (isWildSymbol(current) && value > 1 ? value : 0)
        }, 0),
      )
      const payout = cents(basePayout * multiplier)
      if (best && best.count >= count) continue

      best = { line: Number(line), symbol, positions, count, basePayout, multiplier, payout }
    }
    if (best) wins.push(best)
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
