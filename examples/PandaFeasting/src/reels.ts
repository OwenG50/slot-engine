import { GeneratedReelSet } from "@slot-engine/core"
import { FEATURE_RULES } from "./settings"
import { PayingSymbol } from "./types"

export const BASE_WEIGHTS: Record<PayingSymbol, number> = {
  L5: 13,
  L4: 13,
  L3: 12,
  L2: 11,
  L1: 10,
  H5: 14,
  H4: 13,
  H3: 12,
  H2: 11,
  H1: 10,
}

// Keep the paying-symbol weight total at 119: H increases from 40 to 60,
// while the relative natural-wild/scatter weights remain unchanged.
export const REEL_SET_IDS = { base: "base_lines_v2", bonus: "bonus_lines_v2" } as const

/** Balanced physical strips shared by every payout band. No focus-symbol variants.
 * Versioned IDs prevent the engine from reusing old concentrated CSVs. */
export function createReelSets() {
  return (["base", "bonus"] as const).map(
    (phase) =>
      new GeneratedReelSet({
        id: REEL_SET_IDS[phase],
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
