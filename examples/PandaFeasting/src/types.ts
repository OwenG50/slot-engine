export const PAYING_SYMBOLS = [
  "L1",
  "L2",
  "L3",
  "L4",
  "L5",
  "H5",
  "H4",
  "H3",
  "H2",
  "H1",
] as const
export type PayingSymbol = (typeof PAYING_SYMBOLS)[number]
export type SymbolId = PayingSymbol | "W" | "S"
/** Column-major, visible cells only; coordinates are zero-based. */
export type Board = SymbolId[][]
export type Position = [reel: number, row: number]
export type Stage = 1 | 2 | 3 | 4 | 5
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
export interface GameEvent {
  type: string
  data: Record<string, unknown>
}
export interface Wild {
  position: Position
  multiplier: number
}
export const WIDTH = 5
export const HEIGHT = 3
export const MAX_WIN = 10_000
export const FREE_SPINS = 5
export const cents = (value: number) => Math.round(value * 100) / 100
export const positionKey = ([x, y]: Position) => x * HEIGHT + y
