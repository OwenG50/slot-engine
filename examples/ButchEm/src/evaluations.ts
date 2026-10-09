import { ClusterWinType } from "@slot-engine/core"
import type { Context } from "./onHandleGameFlow"
import { clusterMultiplier } from "./feature"
import { PAYTABLE } from "./paytable"
import {
  Board,
  cents,
  ClusterWin,
  HEIGHT,
  MAX_WIN,
  PAYING_SYMBOLS,
  Position,
  RoamingWild,
  WIDTH,
  positionKey,
} from "./types"

export function neighbors([x, y]: Position): Position[] {
  return (
    [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ] as Position[]
  ).filter(([nx, ny]) => nx >= 0 && nx < WIDTH && ny >= 0 && ny < HEIGHT)
}

/** Independent audit/test reference (production uses ClusterWinType). Evaluate each symbol's connected components separately so wilds are reusable. */
export function evaluateClusters(
  board: Board,
  wildMultiplier: number | ((positions: Position[]) => number) = 1,
): ClusterWin[] {
  if (board.length !== WIDTH || board.some((column) => column.length !== HEIGHT)) {
    throw new Error("ButchEm requires an unpadded 5x5 board")
  }
  const wins: ClusterWin[] = []
  for (const symbol of PAYING_SYMBOLS) {
    const visited = new Set<number>()
    for (let x = 0; x < WIDTH; x++)
      for (let y = 0; y < HEIGHT; y++) {
        if (board[x][y] !== symbol || visited.has(positionKey([x, y]))) continue
        const pending: Position[] = [[x, y]]
        const positions: Position[] = []
        while (pending.length) {
          const pos = pending.pop()!
          const key = positionKey(pos)
          if (visited.has(key)) continue
          const current = board[pos[0]][pos[1]]
          if (current !== symbol && current !== "W") continue
          visited.add(key)
          positions.push(pos)
          pending.push(...neighbors(pos))
        }
        if (positions.length < 5) continue
        const basePayout = PAYTABLE[symbol][positions.length]
        // The callback calculates participating wild identities for this cluster.
        const multiplier = positions.some(([px, py]) => board[px][py] === "W")
          ? typeof wildMultiplier === "function"
            ? wildMultiplier(positions)
            : wildMultiplier
          : 1
        wins.push({
          symbol,
          count: positions.length,
          positions,
          basePayout,
          multiplier,
          payout: cents(basePayout * multiplier),
        })
      }
  }
  return wins
}

/** Clamp awards in integer cents so events and wallet agree at the round cap. */
export function capWins(wins: ClusterWin[], remaining: number): ClusterWin[] {
  let available = Math.max(0, Math.round(remaining * 100))
  return wins.map((win) => {
    const award = Math.min(available, Math.round(win.payout * 100))
    available -= award
    return { ...win, payout: award / 100 }
  })
}

/** Slot Engine finds the clusters; ButchEm adds identity-based wild multipliers. */
export function evaluateWins(ctx: Context, wilds: RoamingWild[]): ClusterWin[] {
  const { winCombinations } = new ClusterWinType({
    ctx,
    wildSymbol: { isWild: true },
  })
    .evaluateWins(ctx.services.board.getBoardReels())
    .getWins()

  const wins = winCombinations.map((win): ClusterWin => {
    const positions = win.symbols.map((s): Position => [s.reelIndex, s.posIndex])
    const multiplier = clusterMultiplier(positions, wilds)
    return {
      symbol: win.baseSymbol.id as ClusterWin["symbol"],
      count: win.kind,
      positions,
      basePayout: win.payout,
      multiplier,
      payout: cents(win.payout * multiplier),
    }
  })
  // Stable ordering also makes cap allocation and frontend playback reproducible.
  wins.sort(
    (a, b) =>
      PAYING_SYMBOLS.indexOf(a.symbol) - PAYING_SYMBOLS.indexOf(b.symbol) ||
      Math.min(...a.positions.map(([x, y]) => x * 5 + y)) -
        Math.min(...b.positions.map(([x, y]) => x * 5 + y)),
  )
  return capWins(wins, MAX_WIN - ctx.services.wallet.getCurrentWin())
}
