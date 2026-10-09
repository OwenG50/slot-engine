export const PAYING_SYMBOLS = ["L1", "L2", "L3", "L4", "H4", "H3", "H2", "H1"] as const
export type PayingSymbol = (typeof PAYING_SYMBOLS)[number]
export type SymbolId = PayingSymbol | "W" | "S"
/** Column-major board: board[x][y], with no padding. */
export type Board = SymbolId[][]
export type Position = [x: number, y: number]
export type UpgradeId = 1 | 2 | 3 | 4
export type Upgrades = Partial<Record<UpgradeId, true>>
export type BonusTier = "normal" | "super" | "hidden"
export type ModeName =
  | "base"
  | "extraChance"
  | "extraChance2"
  | "featureSpin"
  | "bonusFeature"
  | "superBonusFeature"
  | "hiddenBonusFeature"

export interface RoamingWild {
  multiplier: number
  size: "1" | "2"
  /** Internal evaluator coordinates. Frontend movement payloads use steps. */
  positions: Position[]
}

export interface ClusterWin {
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

export const WIDTH = 5
export const HEIGHT = 5
export const MAX_WIN = 10_000
export const FREE_SPINS = 10
export const cents = (value: number) => Math.round(value * 100) / 100
export const positionKey = ([x, y]: Position) => x * HEIGHT + y
