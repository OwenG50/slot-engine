import { Board, ClusterWin, MAX_WIN, Position, SymbolId } from "./types"

/** Shared event contract used by cabin_fever, clusterGameOG and SmokeysStash.
 * Only the featureStart/moveRoamingWild/upgradeUnlocked events are specific to ButchEm. */
export const EVENT = {
  reveal: "reveal",
  winInfo: "winInfo",
  setWin: "setWin",
  setTotalWin: "setTotalWin",
  freeSpinTrigger: "freeSpinTrigger",
  updateFreeSpin: "updateFreeSpin",
  addAdditionalFreeSpins: "addAdditionalFreeSpins",
  freeSpinEnd: "freeSpinEnd",
  finalWin: "finalWin",
  featureStart: "featureStart",
  moveRoamingWild: "moveRoamingWild",
  upgradeUnlocked: "upgradeUnlocked",
} as const
export type EventName = (typeof EVENT)[keyof typeof EVENT]

export interface RevealSymbol {
  name: SymbolId
  Wild?: true
  Scatter?: true
  multiplier?: number
}

export interface WinInfoWin {
  symbol: ClusterWin["symbol"]
  kind: number
  win: number
  positions: { reel: number; row: number }[]
  meta: { multiplier: number; winWithoutMult: number }
}
export const eventPosition = ([reel, row]: Position) => ({ reel, row })

export function revealBoard(board: Board, wildMultiplier: number): RevealSymbol[][] {
  return board.map((reel) =>
    reel.map((name) => ({
      name,
      ...(name === "W" ? { Wild: true as const, multiplier: wildMultiplier } : {}),
      ...(name === "S" ? { Scatter: true as const } : {}),
    })),
  )
}

export function scatterPositions(board: Board) {
  return board.flatMap((reel, x) =>
    reel.flatMap((name, y) => (name === "S" ? [eventPosition([x, y])] : [])),
  )
}

/** Same left-to-right anticipation convention as the reference games. */
export function anticipation(board: Board) {
  let scatters = 0
  return board.map((reel) => {
    const active = scatters >= 2 ? 1 : 0
    scatters += reel.filter((name) => name === "S").length
    return active
  })
}

export function winInfo(wins: ClusterWin[]): { totalWin: number; wins: WinInfoWin[] } {
  const paying = wins.filter((win) => win.payout > 0)
  return {
    totalWin:
      paying.reduce((cents, win) => cents + Math.round(win.payout * 100), 0) / 100,
    wins: paying.map((win) => ({
      symbol: win.symbol,
      kind: win.count,
      win: win.payout,
      positions: win.positions.map(eventPosition),
      meta: { multiplier: win.multiplier, winWithoutMult: win.basePayout },
    })),
  }
}

/** Existing presentation bands, with ButchEm's own 10,000x maximum. */
export function calculateWinLevel(amount: number): number {
  if (amount >= MAX_WIN) return 7
  if (amount >= 350) return 6
  if (amount >= 200) return 5
  if (amount >= 100) return 4
  if (amount >= 50) return 3
  if (amount >= 25) return 2
  return amount > 0 ? 1 : 0
}
