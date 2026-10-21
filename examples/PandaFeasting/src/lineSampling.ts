import { RandomSource, weightedNumber } from "./feature"
import { PAYLINES } from "./paylines"
import { PAYING_SYMBOLS, Stage } from "./types"

// This is candidate generation for the optimizer, not a player hit-rate setting.
// Only one payline is conditioned; all adjacent cells stay on physical strips.
export const BONUS_LINE_SAMPLING = {
  roundProbabilities: [0, 0.35, 0.65, 0.85, 1],
  tailProbability: 1,
  lowSymbolProbability: 0.9,
  countWeights: { 3: 15, 4: 25, 5: 60 },
  progressWildProbability: 0.05,
  finalStageWildProbability: 0.25,
  maxFinalStageWildProbability: 0.6,
}

type Strip = { id: string }[]
const positions = new WeakMap<Strip, Map<string, number[]>>()
function symbolStops(strip: Strip, symbol: string) {
  let index = positions.get(strip)
  if (!index) {
    index = new Map()
    strip.forEach((cell, stop) => {
      if (!index!.has(cell.id)) index!.set(cell.id, [])
      index!.get(cell.id)!.push(stop)
    })
    positions.set(strip, index)
  }
  return index.get(symbol) ?? []
}

/** Pick existing stops along one randomly selected line, without painting cells.
 * Unselected reels use the engine's ordinary random stops. */
export function bonusLineStops(
  reels: Strip[],
  rng: RandomSource,
  stage: Stage,
  maxWin: boolean,
): Record<string, number> {
  const rules = BONUS_LINE_SAMPLING
  const line = rng.randomItem(Object.values(PAYLINES))
  const count = weightedNumber(rules.countWeights, rng)
  const pool =
    stage < 5 && rng.randomFloat(0, 1) < rules.lowSymbolProbability
      ? PAYING_SYMBOLS.filter((symbol) => symbol.startsWith("L"))
      : [...PAYING_SYMBOLS]
  const symbol = rng.randomItem(pool)
  const wildProbability =
    stage < 5
      ? rules.progressWildProbability
      : maxWin
        ? rules.maxFinalStageWildProbability
        : rules.finalStageWildProbability
  const forcedStops: Record<string, number> = {}
  for (let reel = 0; reel < count; reel++) {
    const wild = rng.randomFloat(0, 1) < wildProbability
    const available = symbolStops(reels[reel], wild ? "W" : symbol)
    // A strip without W may still be used; never invent a missing symbol.
    const stops = available.length ? available : symbolStops(reels[reel], symbol)
    if (!stops.length) continue
    forcedStops[reel] =
      (rng.randomItem(stops) - line[reel] + reels[reel].length) % reels[reel].length
  }
  return forcedStops
}
