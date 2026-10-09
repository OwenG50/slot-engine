import type { RandomSource } from "../src/feature"
// Frozen reference of the pre-cache DFS. Keep its ordering and collision checks
// independent of production caches to detect changes to seeded route selection.
// The distance cap is updated to the current eight-cell rule.
import { HEIGHT, WIDTH, Board, Position, positionKey } from "../src/types"
import { footprint } from "../src/wilds"

function footprintsOverlap(a: Position, b: Position, size: "1" | "2"): boolean {
  const cells = new Set(footprint(a, size).map(positionKey))
  return footprint(b, size).some((cell) => cells.has(positionKey(cell)))
}

export function referenceMovementPaths(
  from: Position,
  blockers: Position[],
  size: "1" | "2",
  maxMoves = 8,
): Position[][] {
  if (!Number.isInteger(maxMoves) || maxMoves < 1 || maxMoves > 8)
    throw new Error("Roaming movement must allow between one and eight cells")
  footprint(from, size)
  const directions: Position[] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
  const result: Position[][] = []
  const path: Position[] = [[...from]]
  function walk(direction: Position, turned: boolean) {
    const previous = path[path.length - 1]
    const next: Position = [previous[0] + direction[0], previous[1] + direction[1]]
    if (
      next[0] < 0 ||
      next[0] >= WIDTH - (size === "2" ? 1 : 0) ||
      next[1] < (size === "2" ? 1 : 0) ||
      next[1] >= HEIGHT
    )
      return
    if (blockers.some((other) => footprintsOverlap(next, other, size))) return
    path.push(next)
    result.push(path.map((position) => [...position]))
    if (path.length - 1 < maxMoves) {
      walk(direction, turned)
      if (!turned)
        for (const perpendicular of directions)
          if (direction[0] * perpendicular[0] + direction[1] * perpendicular[1] === 0)
            walk(perpendicular, true)
    }
    path.pop()
  }
  for (const direction of directions) walk(direction, false)
  return result
}

export function referenceRepositioningPaths(
  board: Board,
  anchors: Position[],
  size: "1" | "2",
  maxMoves: number,
  rng?: RandomSource,
): Position[][] | undefined {
  const current = anchors.map((anchor): Position => [...anchor])
  const paths: Position[][] = []
  function search(index: number): boolean {
    if (index === current.length) return true
    const from = current[index]
    const candidates = referenceMovementPaths(
      from,
      current.filter((_, other) => other !== index),
      size,
      maxMoves,
    ).filter((path) =>
      footprint(path.at(-1)!, size).every(
        ([x, y]) => board[x][y] !== "S" && !board[x][y].startsWith("H"),
      ),
    )
    while (candidates.length) {
      const path = rng ? rng.randomItem(candidates) : candidates[0]
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
