import { GeneratedReelSet } from "@slot-engine/core"
import {
  FEATURE_RULES,
  FREE_SPIN_H_WEIGHT_MULTIPLIER,
  FREE_SPIN_L_WEIGHTS,
  FREE_SPIN_L_WEIGHT_MULTIPLIER,
  LIGHT_FREE_SPIN_H_WEIGHT_MULTIPLIER,
} from "./settings"
import { PAYING_SYMBOLS, PayingSymbol } from "./types"

/** "light" lowers H density on free spins only, so low payout bands of
 * triggered bonuses are reached in fewer simulation attempts. */
export type BoardProfile = "standard" | "dense" | "tail" | "maxwin" | "light"
const concentrations: Record<Exclude<BoardProfile, "light">, number> = {
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
// Triggered-bonus free spins carry a few more H symbols so roaming wilds
// collect toward upgrades slightly more often, and denser L4/L3 for more
// small early hits.
function freeWeights(hMultiplier: number) {
  return Object.fromEntries(
    PAYING_SYMBOLS.map((id) => [
      id,
      id.startsWith("H")
        ? BASE_WEIGHTS[id] * hMultiplier
        : FREE_SPIN_L_WEIGHTS[id as keyof typeof FREE_SPIN_L_WEIGHTS] *
          FREE_SPIN_L_WEIGHT_MULTIPLIER,
    ]),
  ) as Record<PayingSymbol, number>
}
const FREE_WEIGHTS = freeWeights(FREE_SPIN_H_WEIGHT_MULTIPLIER)
/** base: base game; bonus: featureSpin; free: triggered-bonus free spins. */
export type Phase = "base" | "bonus" | "free"
const PHASE_WEIGHTS: Record<Phase, Record<PayingSymbol, number>> = {
  base: BASE_WEIGHTS,
  bonus: BASE_WEIGHTS,
  free: FREE_WEIGHTS,
}

const LIGHT_FREE_WEIGHTS = freeWeights(LIGHT_FREE_SPIN_H_WEIGHT_MULTIPLIER)

/** Real reel strips used by the board service and editable in the panel. */
export function createReelSets() {
  return [
    ...profileReelSets(),
    new GeneratedReelSet({
      id: "free_light",
      rowsAmount: 1000,
      symbolWeights: { ...LIGHT_FREE_WEIGHTS, W: FEATURE_RULES.naturalWildWeight, S: 0.08 },
      spaceBetweenSameSymbols: { S: 5 },
    }),
  ]
}

function profileReelSets() {
  return (["base", "bonus", "free"] as const).flatMap((phase) =>
    (Object.keys(concentrations) as Exclude<BoardProfile, "light">[]).flatMap((profile) => {
      const concentration = concentrations[profile]
      const weights = PHASE_WEIGHTS[phase]
      const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0)
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
                  weights[id] +
                    (id === focus ? (total * concentration) / (1 - concentration) : 0),
                ]),
              ),
              W: phase === "base" ? 0.3 : FEATURE_RULES.naturalWildWeight,
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

export function reelWeights(profile: BoardProfile, prefix: Phase) {
  const key = `${prefix}_${profile}`
  let weights = weightCache.get(key)
  if (!weights) {
    weights =
      profile === "light"
        ? { [prefix === "free" ? "free_light" : prefix + "_standard"]: 1 }
        : profile === "standard"
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
  // the fixed twelve profile/phase combinations is shared between spins.
  return { ...weights }
}
