import { GeneratedReelSet } from "@slot-engine/core"
import { FEATURE_RULES } from "./settings"
import { PayingSymbol } from "./types"

export const BASE_WEIGHTS: Record<PayingSymbol, number> = {
  L5: 17,
  L4: 17,
  L3: 16,
  L2: 15,
  L1: 14,
  H5: 10,
  H4: 9,
  H3: 8,
  H2: 7,
  H1: 6,
}

/** Balanced physical strips shared by every payout band. No focus-symbol variants.
 * Versioned IDs prevent the engine from reusing old concentrated CSVs. */
export function createReelSets() {
  return (["base", "bonus"] as const).map(
    (phase) =>
      new GeneratedReelSet({
        id: `${phase}_lines_v1`,
        overrideExisting: false,
        rowsAmount: 1000,
        symbolWeights: {
          ...BASE_WEIGHTS,
          W: FEATURE_RULES.naturalWildWeight,
          ...(phase === "base" ? { S: 1.5 } : {}),
        },
        ...(phase === "base" ? { symbolQuotas: { S: 1 } } : {}),
        spaceBetweenSameSymbols: { S: 3 },
      }),
  )
}
