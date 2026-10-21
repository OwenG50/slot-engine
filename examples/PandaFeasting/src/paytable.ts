import { PayingSymbol } from "./types"

/** Multiples of the total base bet, per winning line; no line-count divisor. */
export const PAYTABLE: Record<PayingSymbol, Record<number, number>> = {
  H1: { 3: 8, 4: 15, 5: 50 },
  H2: { 3: 5, 4: 12, 5: 40 },
  H3: { 3: 3, 4: 10, 5: 30 },
  H4: { 3: 2, 4: 5, 5: 15 },
  H5: { 3: 1.5, 4: 3, 5: 10 },
  L1: { 3: 0.5, 4: 1.5, 5: 5 },
  L2: { 3: 0.2, 4: 1, 5: 3 },
  L3: { 3: 0.2, 4: 1, 5: 3 },
  L4: { 3: 0.1, 4: 0.5, 5: 1.5 },
  L5: { 3: 0.1, 4: 0.5, 5: 1.5 },
}
