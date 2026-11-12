import {
  Board,
  HEIGHT,
  LineWin,
  MAX_WIN,
  Position,
  SymbolId,
  WIDTH,
  isWildSymbol,
} from "./types"

export const EVENT = {
  reveal: "reveal",
  carMove: "carMove",
  winInfo: "winInfo",
  setWin: "setWin",
  setTotalWin: "setTotalWin",
  freeSpinTrigger: "freeSpinTrigger",
  updateFreeSpin: "updateFreeSpin",
  freeSpinEnd: "freeSpinEnd",
  finalWin: "finalWin",
} as const

export interface RevealSymbol {
  name: SymbolId
  Wild?: true
  Scatter?: true
  multiplier?: number
}

export interface WinInfoWin {
  symbol: LineWin["symbol"]
  kind: number
  win: number
  positions: { reel: number; row: number }[]
  meta: { multiplier: number; winWithoutMult: number }
}

export const eventPosition = ([reel, row]: Position) => ({ reel, row })

export function revealBoard(
  board: Board,
  getMultiplier: (position: Position) => number,
): RevealSymbol[][] {
  if (board.length !== WIDTH || board.some((reel) => reel.length !== HEIGHT))
    throw new Error("Speed Trap expects an unpadded 5x4 board")
  return board.map((reel, x) =>
    reel.map((name, y) => {
      const base: RevealSymbol = { name }
      if (name === "S") base.Scatter = true
      if (isWildSymbol(name)) {
        base.Wild = true
        base.multiplier = getMultiplier([x, y])
      }
      return base
    }),
  )
}

export function anticipation(board: Board) {
  let scatters = 0
  return board.map((reel) => {
    const active = scatters >= 2 ? 1 : 0
    scatters += reel.filter((symbol) => symbol === "S").length
    return active
  })
}

export function cameraStatus(activeReels: number[]) {
  const active = new Set(activeReels)
  return Array.from({ length: WIDTH }, (_, reel) => ({ reel, active: active.has(reel) }))
}

export function winInfo(wins: LineWin[]): { totalWin: number; wins: WinInfoWin[] } {
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

export function calculateWinLevel(amount: number): number {
  if (amount >= MAX_WIN) return 7
  if (amount >= 350) return 6
  if (amount >= 200) return 5
  if (amount >= 100) return 4
  if (amount >= 50) return 3
  if (amount >= 25) return 2
  return amount > 0 ? 1 : 0
}
