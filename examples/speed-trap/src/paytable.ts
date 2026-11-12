import { PayingSymbol } from "./types"

/**
 * Payout shape aligned to prior line games, then tuned for 8 paying symbols
 * and stronger multiplier volatility from moving car wilds.
 */
export const PAYTABLE: Record<PayingSymbol, Record<number, number>> = {
  H1: { 3: 2.5, 4: 5, 5: 10 },
  H2: { 3: 1, 4: 2, 5: 4 },
  H3: { 3: 0.8, 4: 1.5, 5: 3 },
  H4: { 3: 0.5, 4: 1, 5: 2 },
  L1: { 3: 0.2, 4: 0.6, 5: 1.2 },
  L2: { 3: 0.2, 4: 0.6, 5: 1.2 },
  L3: { 3: 0.1, 4: 0.5, 5: 1 },
  L4: { 3: 0.1, 4: 0.5, 5: 1 },
}
