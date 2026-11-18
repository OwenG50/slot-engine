import { GeneratedReelSet } from "@slot-engine/core"
import { HEAD_ON_PAIR_REELS } from "./feature"
import { HEIGHT, PAYING_SYMBOLS } from "./types"

export const REEL_SET_IDS = {
  base: "speed_trap_base_v4",
  bonus: "speed_trap_bonus_v12",
  featureSpin: "speed_trap_feature_spin_v2",
} as const

const BASE_WEIGHTS = Object.fromEntries(
  PAYING_SYMBOLS.map((symbol, i) => [symbol, 14 - i]),
)

type Strip = { id: string }[]
const maxWinStops = new WeakMap<Strip, Map<string, number[]>>()

function stopsForSymbol(strip: Strip, symbol: string) {
  let cache = maxWinStops.get(strip)
  if (!cache) {
    cache = new Map()
    maxWinStops.set(strip, cache)
  }
  let stops = cache.get(symbol)
  if (!stops) {
    stops = strip.flatMap((cell, stop) => cell.id === symbol ? [stop] : [])
    cache.set(symbol, stops)
  }
  return stops
}

/** Condition a random legal car pair and H1s on existing reel stops. */
export function maxWinReelStops(
  reels: Strip[],
  randomFloat: () => number,
  rows: readonly number[] = Array.from({ length: HEIGHT }, (_, row) => row),
) {
  if (!rows.length) throw new Error("Speed Trap max-win sampling needs an empty row")
  const row = rows[Math.floor(randomFloat() * rows.length)]
  const [left, right] = HEAD_ON_PAIR_REELS[
    Math.floor(randomFloat() * HEAD_ON_PAIR_REELS.length)
  ]
  const forcedStops: Record<string, number> = {}
  reels.forEach((strip, reel) => {
    const carReel = reel === left || reel === right
    const symbols = carReel
      ? ["W1", "W2", "W3"].filter((symbol) => stopsForSymbol(strip, symbol).length > 0)
      : ["H1"]
    if (!symbols.length)
      throw new Error(`Speed Trap max-win sampling needs car symbols on reel ${reel}`)
    const symbol = symbols[Math.floor(randomFloat() * symbols.length)]
    const stops = stopsForSymbol(strip, symbol)
    if (!stops.length)
      throw new Error(`Speed Trap max-win sampling needs H1 on reel ${reel}`)
    const stop = stops[Math.floor(randomFloat() * stops.length)]!
    forcedStops[reel] = (stop - row + strip.length) % strip.length
  })
  return forcedStops
}

export function createReelSets() {
  return (["base", "bonus", "featureSpin"] as const).map(
    (phase) =>
      new GeneratedReelSet({
        id: REEL_SET_IDS[phase],
        overrideExisting: false,
        rowsAmount: 1200,
        symbolWeights: {
          ...BASE_WEIGHTS,
          W1: phase === "base" ? 0.26 : 0.78,
          W2: phase === "base" ? 0.24 : 0.6,
          W3: phase === "base" ? 0.32 : 0.7,
          S: phase === "base" ? 1.5 : phase === "featureSpin" ? 0.24 : 0.6,
        },
        symbolQuotas: { S: phase === "base" ? 1 : phase === "featureSpin" ? 0.2 : 0.5 },
        spaceBetweenSameSymbols: { S: 3 },
      }),
  )
}
