import { GeneratedReelSet } from "@slot-engine/core"
import { FEATURE_RULES } from "./settings"
import { PAYING_SYMBOLS, PayingSymbol } from "./types"

export type BoardProfile = "standard" | "dense" | "tail" | "maxwin"
const concentrations: Record<BoardProfile, number> = {
  standard: 0,
  dense: 0.2,
  tail: 0.45,
  // Top cluster pays start at 15 cells. Leave room for other symbols instead
  // of using the old nearly monochrome strips to generate capped awards.
  maxwin: 0.5,
}

// Low-pay symbols dominate the strips like the reference games: weights fall
// as symbol value rises (L3/L4 pay the least, H1 the most).
const BASE_WEIGHTS: Record<PayingSymbol, number> = {
  L4: 17,
  L3: 16,
  L2: 15,
  L1: 14,
  H4: 9,
  H3: 8,
  H2: 7,
  H1: 6,
}
const TOTAL_WEIGHT = Object.values(BASE_WEIGHTS).reduce((sum, weight) => sum + weight, 0)

/** Real reel strips used by the board service and editable in the panel. */
export function createReelSets() {
  return (["base", "bonus"] as const).flatMap((phase) =>
    (Object.keys(concentrations) as BoardProfile[]).flatMap((profile) => {
      const concentration = concentrations[profile]
      return (profile === "standard" ? [undefined] : PAYING_SYMBOLS).map(
        (focus) =>
          new GeneratedReelSet({
            // Core reloads existing CSVs before considering new weights. Give
            // the mixed max-win strips fresh IDs while preserving edited reels.
            id: [phase, profile === "maxwin" ? "maxwin_mixed" : profile, focus]
              .filter(Boolean)
              .join("_"),
            rowsAmount: 1000,
            symbolWeights: {
              ...Object.fromEntries(
                PAYING_SYMBOLS.map((id) => [
                  id,
                  BASE_WEIGHTS[id] +
                    (id === focus
                      ? (TOTAL_WEIGHT * concentration) / (1 - concentration)
                      : 0),
                ]),
              ),
              W: phase === "bonus" ? FEATURE_RULES.naturalWildWeight : 0.3,
              // Scatters live on the physical strips like the other games: base
              // strips carry them for forced trigger draws and organic
              // near-misses, bonus strips keep them very rare for +1 retriggers.
              S: phase === "base" ? 1.5 : 0.08,
            },
            // Guarantee every base reel has scatter stops for forced 3/4/5
            // trigger draws (see the "No item selected" lesson in other games).
            ...(phase === "base" ? { symbolQuotas: { S: 1 } } : {}),
            // The visible window is 5 rows with no padding, so spacing 5 keeps
            // any reel from ever showing two scatters at once.
            spaceBetweenSameSymbols: { S: 5 },
          }),
      )
    }),
  )
}

const weightCache = new Map<string, Record<string, number>>()

export function reelWeights(profile: BoardProfile, inFeature: boolean) {
  const prefix = inFeature ? "bonus" : "base"
  const key = `${prefix}_${profile}`
  let weights = weightCache.get(key)
  if (!weights) {
    weights =
      profile === "standard"
        ? { [prefix + "_standard"]: 1 }
        : Object.fromEntries(
            PAYING_SYMBOLS.map((id) => [
              prefix + "_" + (profile === "maxwin" ? "maxwin_mixed" : profile) + "_" + id,
              1,
            ]),
          )
    Object.freeze(weights)
    weightCache.set(key, weights)
  }
  // Preserve callers' ownership of mutable weight maps; only construction of
  // the fixed eight profile/phase combinations is shared between spins.
  return { ...weights }
}
