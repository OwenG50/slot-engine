export const PAYING_SYMBOLS = ["L1", "L2", "L3", "L4", "H4", "H3", "H2", "H1"] as const
export type PayingSymbol = (typeof PAYING_SYMBOLS)[number]

export type CarSymbol = "W1" | "W2" | "W3"
export type WildSymbol = "W" | CarSymbol
export type SymbolId = PayingSymbol | WildSymbol | "S"

/** Column-major visible board: board[reel][row]. */
export type Board = SymbolId[][]
export type Position = [reel: number, row: number]

export type BonusTier = "normal" | "super" | "hidden"
export type ModeName =
  | "base"
  | "extraChance"
  | "extraChance2"
  | "featureSpin"
  | "bonusFeature"
  | "superBonusFeature"
  | "hiddenBonusFeature"

export interface LineWin {
  line: number
  symbol: PayingSymbol
  count: number
  positions: Position[]
  basePayout: number
  multiplier: number
  payout: number
}

export interface StickyCar {
  symbol: CarSymbol
  position: Position
  multiplier: number
}

export interface CarState {
  id: string
  symbol: CarSymbol
  position: Position
  start: Position
  multiplier: number
  direction: -1 | 1
  path: Position[]
  spawnedThisSpin: boolean
  settled: boolean
  collision?: {
    kind: "newNew" | "newSticky"
    withId: string
    withPosition: Position
  }
}

export interface GameEvent {
  type: string
  data: Record<string, unknown>
}

export const WIDTH = 5
export const HEIGHT = 4
export const FREE_SPINS = 10
export const MAX_WIN = 10_000

export const cents = (value: number) => Math.round(value * 100) / 100
export const positionKey = ([x, y]: Position) => `${x}:${y}`

export const isCarSymbol = (symbol: SymbolId): symbol is CarSymbol =>
  symbol === "W1" || symbol === "W2" || symbol === "W3"

export const isWildSymbol = (symbol: SymbolId) =>
  symbol === "W" || symbol === "W1" || symbol === "W2" || symbol === "W3"
