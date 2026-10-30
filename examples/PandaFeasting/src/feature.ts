import { FEATURE_RULES } from "./settings"
import {
  Board,
  BonusTier,
  HEIGHT,
  LineWin,
  Position,
  Stage,
  WIDTH,
  Wild,
  positionKey,
} from "./types"

export interface RandomSource {
  randomFloat(min: number, max: number): number
  randomItem<T>(items: T[]): T
}
export interface FeatureState {
  tier: BonusTier
  stage: Stage
  progress: number
}
export function startFeature(tier: BonusTier): FeatureState {
  return { tier, stage: 1, progress: 0 }
}
export function weightedNumber(
  weights: Record<number, number>,
  rng: RandomSource,
): number {
  const entries = Object.entries(weights)
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
  if (!(total > 0) || entries.some(([, weight]) => weight < 0))
    throw new Error("Weights must be nonnegative with a positive total")
  let pick = rng.randomFloat(0, total)
  for (const [value, weight] of entries) {
    pick -= weight
    if (pick < 0) return Number(value)
  }
  return Number(entries.filter(([, weight]) => weight > 0).at(-1)![0])
}
export function featureSpinStage(
  rng: RandomSource,
  stageWeights: Record<Stage, number> = FEATURE_RULES.featureSpinStageWeights,
): Stage {
  return weightedNumber(stageWeights, rng) as Stage
}
export function spawnPositions(board: Board): Position[] {
  return board.flatMap((reel, x) =>
    reel.flatMap((symbol, y) =>
      symbol === "W" || symbol === "S" ? [] : [[x, y] as Position],
    ),
  )
}
/** Mutates only the evaluated board; callers preserve the original reveal snapshot. */
export function spawnWilds(
  board: Board,
  count: number,
  multiplier: () => number,
  rng: RandomSource,
): Wild[] {
  const available = spawnPositions(board)
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > WIDTH * HEIGHT ||
    count > available.length
  )
    throw new Error(
      `Wild spawn needs 1–${WIDTH * HEIGHT} distinct non-wild, non-scatter cells`,
    )
  const wilds: Wild[] = []
  for (let i = 0; i < count; i++) {
    const pos = rng.randomItem(available)
    available.splice(available.indexOf(pos), 1)
    board[pos[0]][pos[1]] = "W"
    wilds.push({ position: pos, multiplier: multiplier() })
  }
  return wilds
}
export function collectLowSymbols(board: Board, wins: LineWin[]) {
  const collected = new Map<number, { symbol: string; reel: number; row: number }>()
  for (const win of wins) {
    if (win.payout <= 0) continue
    for (const [reel, row] of win.positions) {
      const symbol = board[reel][row]
      if (symbol.startsWith("L"))
        collected.set(positionKey([reel, row]), { symbol, reel, row })
    }
  }
  return [...collected.values()].sort((a, b) => a.reel - b.reel || a.row - b.row)
}
export function isFeatureComplete(state: FeatureState): boolean {
  return (
    state.stage === 6 && state.progress >= FEATURE_RULES.stageThresholds[state.tier][6]
  )
}
export function advanceStage(state: FeatureState, count: number): Stage[] {
  if (isFeatureComplete(state)) return []
  if (state.stage === 6) {
    const threshold = FEATURE_RULES.stageThresholds[state.tier][6]
    if (!Number.isInteger(threshold) || threshold < 1)
      throw new Error("Stage thresholds must be positive integers")
    state.progress = Math.min(state.progress + count, threshold)
    return []
  }
  state.progress += count
  const stages: Stage[] = []
  while (state.stage < 6) {
    const threshold = FEATURE_RULES.stageThresholds[state.tier][state.stage]
    if (!Number.isInteger(threshold) || threshold < 1)
      throw new Error("Stage thresholds must be positive integers")
    if (state.progress < threshold) break
    state.progress = FEATURE_RULES.carryProgress ? state.progress - threshold : 0
    state.stage = (state.stage + 1) as Stage
    stages.push(state.stage)
    if (!FEATURE_RULES.carryProgress) break
  }
  if (state.stage === 6) state.progress = 0
  return stages
}
