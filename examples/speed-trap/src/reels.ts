import { GeneratedReelSet } from "@slot-engine/core"
import { HEIGHT, PAYING_SYMBOLS, WIDTH } from "./types"

export const REEL_SET_IDS = {
  base: "speed_trap_base_v4",
  bonus: "speed_trap_bonus_v11",
} as const

const BASE_WEIGHTS = Object.fromEntries(
  PAYING_SYMBOLS.map((symbol, i) => [symbol, 14 - i]),
)

type Strip = { id: string }[]
const maxWinStops = new WeakMap<Strip, Map<number, number[]>>()

/** Condition two edge cars and intervening H1s on real stops. */
export function maxWinReelStops(
  reels: Strip[],
  randomFloat: () => number,
  rows: readonly number[] = Array.from({ length: HEIGHT }, (_, row) => row),
) {
  if (!rows.length) throw new Error("Speed Trap max-win sampling needs an empty row")
  const row = rows[Math.floor(randomFloat() * rows.length)]
  const forcedStops: Record<string, number> = {}
  reels.forEach((strip, reel) => {
    const carReel = reel === 0 || reel === WIDTH - 1
    let cache = maxWinStops.get(strip)
    if (!cache) {
      cache = new Map()
      maxWinStops.set(strip, cache)
    }
    let stops = cache.get(reel)
    if (!stops) {
      // Mix car tiers to retain upper-tail coverage as car density changes.
      const candidates = reel === 0 ? ["W3", "W2", "W1"] : ["W1", "W2", "W3"]
      for (const symbol of carReel ? candidates : ["H1"]) {
        const candidates = strip.flatMap((cell, stop) =>
          cell.id === symbol ? [stop] : [],
        )
        if (candidates.length) {
          stops = candidates
          break
        }
      }
      if (!stops)
        throw new Error(
          `Speed Trap max-win sampling needs ${carReel ? "car symbols" : "H1"} on reel ${reel}`,
        )
      cache.set(reel, stops)
    }
    const stop = stops[Math.floor(randomFloat() * stops.length)]!
    forcedStops[reel] = (stop - row + strip.length) % strip.length
  })
  return forcedStops
}

export function createReelSets() {
  return (["base", "bonus"] as const).map(
    (phase) =>
      new GeneratedReelSet({
        id: REEL_SET_IDS[phase],
        overrideExisting: false,
        rowsAmount: 1200,
        symbolWeights: {
          ...BASE_WEIGHTS,
          W1: phase === "bonus" ? 0.78 : 0.26,
          W2: phase === "bonus" ? 0.6 : 0.24,
          W3: phase === "bonus" ? 0.7 : 0.32,
          S: phase === "bonus" ? 1.2 : 1.5,
        },
        symbolQuotas: { S: 1 },
        spaceBetweenSameSymbols: { S: 3 },
      }),
  )
}
