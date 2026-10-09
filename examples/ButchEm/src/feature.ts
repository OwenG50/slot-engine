import { moveRoamingWilds, RevealedWild } from "./collection"
import { FEATURE_SPIN_UPGRADE_COUNT_PROBABILITIES, FeatureRules } from "./settings"
import { Board, Position, RoamingWild, UpgradeId, Upgrades, positionKey } from "./types"
import {
  applyWilds,
  footprint,
  footprintsOverlap,
  resizeAnchor,
  validAnchors,
} from "./wilds"

export interface RandomSource {
  randomItem<T>(items: T[]): T
  randomFloat(min: number, max: number): number
}
export interface FeatureState {
  upgrades: Upgrades
  collected: Record<UpgradeId, number>
  anchors: Position[]
}
export function activeEffects(state: FeatureState, rules: FeatureRules) {
  let multiplier = 0
  let size: "1" | "2" = "1"
  for (const id of [1, 2, 3, 4] as const) {
    if (!state.upgrades[id]) continue
    multiplier += rules.upgrades[id].multiplier ?? 0
    if (rules.upgrades[id].size === "2") size = "2"
  }
  return { multiplier: Math.max(1, multiplier), size }
}
export function randomStartingUpgrades(count: number, rng: RandomSource): UpgradeId[] {
  if (!Number.isInteger(count) || count < 0 || count > 4)
    throw new Error("Invalid starting upgrade count")
  const available: UpgradeId[] = [1, 2, 3, 4]
  const selected: UpgradeId[] = []
  while (selected.length < count) {
    const id = rng.randomItem(available)
    selected.push(id)
    available.splice(available.indexOf(id), 1)
  }
  return selected
}
/** Fallback for direct/test contexts. Production result sets encode the same
 * probabilities so optimization preserves the count distribution. */
export function randomFeatureSpinUpgradeCount(rng: RandomSource): number {
  const roll = rng.randomFloat(0, 1)
  let cumulative = 0
  for (const count of [1, 2, 3, 4] as const) {
    cumulative += FEATURE_SPIN_UPGRADE_COUNT_PROBABILITIES[count]
    if (roll < cumulative) return count
  }
  return 4
}
export function unlockUpgrade(
  state: FeatureState,
  id: UpgradeId,
  rules: FeatureRules,
  rng: RandomSource,
) {
  if (state.upgrades[id]) return
  state.upgrades[id] = true
  const { size } = activeEffects(state, rules)
  // Re-anchor for the new size; a wild whose footprint would now overlap an
  // earlier one relocates to a random free anchor instead.
  const placed: Position[] = []
  for (const anchor of state.anchors) {
    let next = resizeAnchor(anchor, size)
    if (placed.some((other) => footprintsOverlap(other, next, size))) {
      next = rng.randomItem(
        validAnchors(size).filter(
          (candidate) =>
            !placed.some((other) => footprintsOverlap(other, candidate, size)),
        ),
      )
    }
    placed.push(next)
  }
  state.anchors = placed
  for (
    let i = 0;
    i < (rules.upgrades[id].additionalWilds ?? 0) &&
    state.anchors.length < rules.maxRoamingWilds;
    i++
  ) {
    // A spawned wild inherits the active size immediately. Reserve its full
    // footprint so even a clear anchor cannot overlap an expanded wild.
    const available = validAnchors(size).filter(
      (candidate) =>
        !state.anchors.some((anchor) => footprintsOverlap(anchor, candidate, size)),
    )
    state.anchors.push(rng.randomItem(available))
  }
}
export function startFeature(
  initial: UpgradeId[],
  rules: FeatureRules,
  rng: RandomSource,
): FeatureState {
  const state: FeatureState = {
    upgrades: {},
    collected: { 1: 0, 2: 0, 3: 0, 4: 0 },
    anchors: [rng.randomItem(validAnchors("1"))],
  }
  for (const id of initial) unlockUpgrade(state, id, rules, rng)
  return state
}
/** Reposition for the new reveal using the same paths and steps as collection,
 * without collecting symbols or changing meters. Only the final footprint pays. */
export function roam(
  state: FeatureState,
  rules: FeatureRules,
  rng: RandomSource,
  board: Board,
): (RoamingWild & RevealedWild)[] {
  const effects = activeEffects(state, rules)
  return moveRoamingWilds(board, state, effects.size, rules, rng, false).map(
    (movement) => ({
      ...movement,
      multiplier: effects.multiplier,
      // Coordinate pairs remain internal to the evaluator; frontend movement
      // payloads uniformly use steps with { reel, row } objects.
      positions: movement.steps.map(({ reel, row }): Position => [reel, row]),
    }),
  )
}

/** All wild geometry and multipliers are snapshotted before evaluating this spin. */
export function featureBoard(
  source: Board,
  state: FeatureState,
  rules: FeatureRules,
  wilds: RoamingWild[],
) {
  const effects = activeEffects(state, rules)
  const naturalWilds: RoamingWild[] = []
  for (let x = 0; x < source.length; x++)
    for (let y = 0; y < source[x].length; y++) {
      if (source[x][y] === "W")
        naturalWilds.push({ ...effects, positions: [resizeAnchor([x, y], effects.size)] })
    }
  return { board: applyWilds(source, [...naturalWilds, ...wilds], false), naturalWilds }
}
export function clusterMultiplier(positions: Position[], wilds: RoamingWild[]): number {
  const cells = new Set(positions.map(positionKey))
  const participating = wilds.filter((wild) =>
    footprint(wild.positions[wild.positions.length - 1], wild.size).some((position) =>
      cells.has(positionKey(position)),
    ),
  )
  if (!participating.length) return 1
  // A 2x2 counts once even when all four of its cells participate.
  // Unupgraded 1x substitutes never boost the cluster.
  const upgraded = participating.filter((wild) => wild.multiplier > 1)
  if (!upgraded.length) return 1
  return upgraded.reduce((sum, wild) => sum + wild.multiplier, 0)
}
