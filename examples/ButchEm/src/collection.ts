import type { FeatureState, RandomSource } from "./feature"
import { MAX_ROAMING_MOVES, type FeatureRules } from "./settings"
import { eventPosition } from "./events"
import { Board, HEIGHT, Position, SymbolId, UpgradeId, WIDTH, positionKey } from "./types"
import { footprint, footprintMask } from "./wilds"

export interface MovementCell {
  reel: number
  row: number
  symbol: SymbolId
  /** True exactly once per real H cell across all trucks this spin. */
  collected: boolean
}

export interface MovementStep {
  reel: number
  row: number
  /** Entire footprint, including lows, scatters and previously crossed cells. */
  symbols: MovementCell[]
}

export interface MovementCredit {
  symbol: `H${UpgradeId}`
  upgrade: UpgradeId
  /** Symbols picked up by this truck on this spin. */
  count: number
  /** Shared feature meter after this truck's movement. */
  collected: number
}

export interface WildMovement {
  roamingWildIndex: number
  size: "1" | "2"
  /** Starting anchor, followed by every unit move in order. */
  steps: MovementStep[]
  collectedSymbols: MovementCredit[]
  collectedCount: number
}

/** Reveal movement uses the same per-truck payload plus its payout multiplier. */
export interface RevealedWild extends WildMovement {
  multiplier: number
}

/** Find joint repositioning paths whose final footprints cover no H or scatter.
 * Backtrack when an earlier endpoint blocks a later truck's route.
 * Keep every route in the random sample, even when endpoints coincide. */
function repositioningPaths(
  board: Board,
  anchors: Position[],
  size: "1" | "2",
  maxMoves: number,
  rng: RandomSource,
): Position[][] | undefined {
  const forbidden = forbiddenLandings(board)
  const current = anchors.map((anchor): Position => [...anchor])
  const paths: Position[][] = []
  function search(index: number): boolean {
    if (index === current.length) return true
    const from = current[index]
    const candidates = movementRoutes(
      from,
      current.filter((_, other) => other !== index),
      size,
      maxMoves,
    )
      .filter((route) => !(route.destinationMask & forbidden))
      .map((route) => route.path)
    while (candidates.length) {
      const path = rng.randomItem(candidates)
      candidates.splice(candidates.indexOf(path), 1)
      current[index] = path.at(-1)!
      paths.push(path)
      if (search(index + 1)) return true
      paths.pop()
      current[index] = from
    }
    return false
  }
  return search(0) ? paths : undefined
}

function forbiddenLandings(board: Board): number {
  let forbidden = 0
  for (let x = 0; x < WIDTH; x++)
    for (let y = 0; y < HEIGHT; y++)
      if (board[x][y] === "S" || board[x][y].startsWith("H"))
        forbidden |= 1 << (x * HEIGHT + y)
  return forbidden
}

export function canRepositionWilds(
  board: Board,
  anchors: Position[],
  size: "1" | "2",
  maxMoves = MAX_ROAMING_MOVES,
): boolean {
  const forbidden = forbiddenLandings(board)
  const current = anchors.map((anchor): Position => [...anchor])
  // This read-only check needs reachable endpoints, not a sampled path.
  // Different routes to the same endpoint leave identical blockers for the
  // next truck. Deduplicate only here; random playback keeps every route.
  function search(index: number): boolean {
    if (index === current.length) return true
    const from = current[index]
    const routes = movementRoutes(
      from,
      current.filter((_, other) => other !== index),
      size,
      maxMoves,
    )
    let checked = 0
    for (const route of routes) {
      if (route.destinationMask & forbidden) continue
      const endpoint = route.path[route.path.length - 1]
      const bit = 1 << positionKey(endpoint)
      if (checked & bit) continue
      checked |= bit
      current[index] = endpoint
      if (search(index + 1)) return true
    }
    current[index] = from
    return false
  }
  return search(0)
}

/** Straight or L-shaped routes with one to eight unit moves. A second direction
 * must be perpendicular: no reversal or second turn. Other trucks remain
 * stationary while this truck's route is played. */
export function movementPaths(
  from: Position,
  blockers: Position[],
  size: "1" | "2",
  maxMoves = MAX_ROAMING_MOVES,
): Position[][] {
  // Public callers own their arrays; mutations cannot corrupt worker caches.
  return movementRoutes(from, blockers, size, maxMoves).map((route) =>
    route.path.map(([x, y]): Position => [x, y]),
  )
}

interface MovementRoute {
  path: Position[]
  /** Moved-to footprints only: the starting anchor does not block a route. */
  sweptMask: number
  destinationMask: number
}
const geometryCache = new Map<number, MovementRoute[]>()
const layoutCache = new Map<number, MovementRoute[]>()
const MAX_CACHED_LAYOUTS = 1024

/** Immutable board geometry shared within a worker, with original DFS order.
 * Caching only geometry preserves RNG calls, path weighting and board retries. */
function movementRoutes(
  from: Position,
  blockers: Position[],
  size: "1" | "2",
  maxMoves: number,
): MovementRoute[] {
  if (!Number.isInteger(maxMoves) || maxMoves < 1 || maxMoves > MAX_ROAMING_MOVES)
    throw new Error("Roaming movement must allow between one and eight cells")
  footprintMask(from, size)
  let blocked = 0
  for (const anchor of blockers) blocked |= footprintMask(anchor, size)
  const anchorKey = (size === "2" ? WIDTH * HEIGHT : 0) + positionKey(from)
  // 25 bits of blockers, 4 of distance and 6 of anchor: exact safe integers.
  const layoutKey = blocked * 1024 + maxMoves * 64 + anchorKey
  const cached = layoutCache.get(layoutKey)
  if (cached) return cached
  let geometry = geometryCache.get(anchorKey)
  if (!geometry) {
    geometry = enumerateRoutes(from, size)
    geometryCache.set(anchorKey, geometry)
  }
  const routes = geometry.filter(
    (route) => route.path.length <= maxMoves + 1 && !(route.sweptMask & blocked),
  )
  Object.freeze(routes)
  if (layoutCache.size >= MAX_CACHED_LAYOUTS)
    layoutCache.delete(layoutCache.keys().next().value!)
  layoutCache.set(layoutKey, routes)
  return routes
}

function enumerateRoutes(from: Position, size: "1" | "2"): MovementRoute[] {
  const directions: Position[] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
  const result: MovementRoute[] = []
  const path: Position[] = [[...from]]
  function walk(direction: Position, turned: boolean, sweptMask: number) {
    const previous = path[path.length - 1]
    const next: Position = [previous[0] + direction[0], previous[1] + direction[1]]
    if (
      next[0] < 0 ||
      next[0] >= WIDTH - (size === "2" ? 1 : 0) ||
      next[1] < (size === "2" ? 1 : 0) ||
      next[1] >= HEIGHT
    )
      return
    const destinationMask = footprintMask(next, size)
    sweptMask |= destinationMask
    path.push(next)
    const saved = path.map((position): Position => [...position])
    for (const position of saved) Object.freeze(position)
    Object.freeze(saved)
    result.push(Object.freeze({ path: saved, sweptMask, destinationMask }))
    if (path.length - 1 < MAX_ROAMING_MOVES) {
      walk(direction, turned, sweptMask)
      if (!turned)
        for (const perpendicular of directions)
          if (direction[0] * perpendicular[0] + direction[1] * perpendicular[1] === 0)
            walk(perpendicular, true, sweptMask)
    }
    path.pop()
  }
  for (const direction of directions) walk(direction, false, 0)
  Object.freeze(result)
  return result
}

/** Move every truck once independently of wins; collection paths never target symbols.
 * A cell credits only one truck per spin. Finish the full route after reaching
 * five; the caller applies unlocks after every truck finishes at the old size.
 * Repositioning disables collection and requires final footprints without H or S. */
export function moveRoamingWilds(
  board: Board,
  state: FeatureState,
  size: "1" | "2",
  rules: FeatureRules,
  rng: RandomSource,
  collect = true,
): WildMovement[] {
  const picked = new Set<number>()
  const repositioning = collect
    ? undefined
    : repositioningPaths(board, state.anchors, size, rules.maxMovesPerSpin, rng)
  if (!collect && !repositioning) throw new Error("No legal roaming-wild repositioning")
  return state.anchors.map((from, roamingWildIndex) => {
    const paths = repositioning
      ? [repositioning[roamingWildIndex]]
      : movementRoutes(
          from,
          state.anchors.filter((_, index) => index !== roamingWildIndex),
          size,
          rules.maxMovesPerSpin,
        ).map((route) => route.path)
    if (!paths.length) throw new Error("No legal roaming-wild movement")
    const path = repositioning ? paths[0] : rng.randomItem(paths)
    const counts: Partial<Record<UpgradeId, number>> = {}
    const steps = path.map(
      (anchor, stepIndex): MovementStep => ({
        ...eventPosition(anchor),
        symbols: footprint(anchor, size).map((position): MovementCell => {
          const symbol = board[position[0]][position[1]]
          const key = positionKey(position)
          const collected =
            collect && stepIndex > 0 && symbol.startsWith("H") && !picked.has(key)
          if (collected) {
            picked.add(key)
            const id = Number(symbol[1]) as UpgradeId
            counts[id] = (counts[id] ?? 0) + 1
            // Already-unlocked animals are still crossed/picked up, but cannot
            // advance their meter or unlock the same upgrade twice.
            if (!state.upgrades[id]) state.collected[id]++
          }
          return { ...eventPosition(position), symbol, collected }
        }),
      }),
    )
    state.anchors[roamingWildIndex] = [...path[path.length - 1]]
    const collectedSymbols = ([1, 2, 3, 4] as const).flatMap((upgrade) =>
      counts[upgrade]
        ? [
            {
              symbol: `H${upgrade}` as const,
              upgrade,
              count: counts[upgrade]!,
              collected: state.collected[upgrade],
            },
          ]
        : [],
    )
    return {
      roamingWildIndex,
      size,
      steps,
      collectedSymbols,
      collectedCount: collectedSymbols.reduce((sum, credit) => sum + credit.count, 0),
    }
  })
}
