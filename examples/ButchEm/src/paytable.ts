import { PayingSymbol } from "./types"

// Columns: 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15-25.
// Values are intentionally written out per symbol so every payout can be
// tuned independently. Reuse simple steps with at most one decimal place.
export const PAY_ROWS: Record<PayingSymbol, number[]> = {
  L1: [0.4, 0.5, 0.6, 0.8, 1.5, 3, 5, 10, 15, 25, 40],
  L2: [0.4, 0.5, 0.6, 0.8, 1.5, 3, 5, 10, 15, 25, 40],
  L3: [0.2, 0.3, 0.4, 0.6, 0.8, 1.5, 3, 5, 8, 12, 20],
  L4: [0.2, 0.3, 0.4, 0.6, 0.8, 1.5, 3, 5, 8, 12, 20],
  H4: [0.5, 0.8, 1.5, 3, 5, 10, 15, 20, 25, 35, 50],
  H3: [0.8, 1, 2, 4, 8, 15, 20, 30, 40, 50, 80],
  H2: [1, 1.5, 3, 5, 10, 20, 30, 40, 50, 70, 100],
  H1: [1.5, 2, 4, 8, 15, 30, 40, 60, 80, 120, 200],
}

export const PAYTABLE = Object.fromEntries(
  Object.entries(PAY_ROWS).map(([symbol, payouts]) => [
    symbol,
    Object.fromEntries(
      Array.from({ length: 21 }, (_, i) => [i + 5, payouts[Math.min(i, 10)]]),
    ),
  ]),
) as Record<PayingSymbol, Record<number, number>>
