import { PayingSymbol } from "./types"

/** Multiples of the total base bet, per winning line; no line-count divisor. */
export const PAYTABLE: Record<PayingSymbol, Record<number, number>> = {
  H1: { 3: 5, 4: 15, 5: 30 },
  H2: { 3: 4, 4: 10, 5: 20 },
  H3: { 3: 3, 4: 8, 5: 15 },
  H4: { 3: 2, 4: 5, 5: 10 },
  H5: { 3: 1.5, 4: 3, 5: 6 },
  L1: { 3: 0.5, 4: 1.5, 5: 3 },
  L2: { 3: 0.2, 4: 1, 5: 2 },
  L3: { 3: 0.2, 4: 1, 5: 2 },
  L4: { 3: 0.1, 4: 0.5, 5: 1 },
  L5: { 3: 0.1, 4: 0.5, 5: 1 },
}
