import { FEATURE_RULES } from "./settings"
import { Board, BonusTier, LineWin, Position, Stage, Wild, positionKey } from "./types"

export interface RandomSource {
  randomFloat(min: number, max: number): number
  randomItem<T>(items: T[]): T
}
export interface FeatureState {
  tier: BonusTier
  stage: Stage
  progress: number
  pendingSpawn: boolean
}
export function startFeature(tier: BonusTier): FeatureState {
  return { tier, stage: 1, progress: 0, pendingSpawn: false }
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
export function featureSpinMultiplier(
  rng: RandomSource,
  stageWeights: Record<Stage, number> = FEATURE_RULES.featureSpinStageWeights,
): number {
  return FEATURE_RULES.stageMultipliers[weightedNumber(stageWeights, rng) as Stage]
}
export function spawnPositions(board: Board): Position[] {
  return board.flatMap((reel, x) =>
    reel.flatMap((symbol, y) =>
      symbol === "W" || symbol === "S" ? [] : [[x, y] as Position],
    ),
  )
}
/** Mutates only the evaluated board, after its original reveal was emitted. */
export function spawnWilds(
  board: Board,
  count: number,
  multiplier: () => number,
  rng: RandomSource,
): Wild[] {
  const available = spawnPositions(board)
  if (!Number.isInteger(count) || count < 3 || count > 10 || count > available.length)
    throw new Error("Wild spawn needs 3–10 distinct non-wild, non-scatter cells")
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
export function advanceStage(state: FeatureState, count: number): Stage[] {
  if (state.stage === 5) return []
  state.progress += count
  const stages: Stage[] = []
  while (state.stage < 5) {
    const threshold =
      FEATURE_RULES.stageThresholds[state.tier][state.stage as Exclude<Stage, 5>]
    if (!Number.isInteger(threshold) || threshold < 1)
      throw new Error("Stage thresholds must be positive integers")
    if (state.progress < threshold) break
    state.progress = FEATURE_RULES.carryProgress ? state.progress - threshold : 0
    state.stage = (state.stage + 1) as Stage
    state.pendingSpawn = true
    stages.push(state.stage)
    if (!FEATURE_RULES.carryProgress) break
  }
  if (state.stage === 5) state.progress = 0
  return stages
}
