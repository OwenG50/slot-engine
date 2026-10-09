import { Board, HEIGHT, Position, RoamingWild, WIDTH } from "./types"

/** A 2x2 anchor is the bottom-left cell, so its upper cells have y - 1. */
export function footprint(anchor: Position, size: "1" | "2"): Position[] {
  const [x, y] = anchor
  const positions: Position[] =
    size === "1"
      ? [[x, y]]
      : [
          [x, y],
          [x + 1, y],
          [x, y - 1],
          [x + 1, y - 1],
        ]
  if (
    positions.some(
      ([px, py]) =>
        !Number.isInteger(px) ||
        !Number.isInteger(py) ||
        px < 0 ||
        px >= WIDTH ||
        py < 0 ||
        py >= HEIGHT,
    )
  ) {
    throw new Error(`Invalid ${size}x${size} wild anchor: [${x}, ${y}]`)
  }
  return positions
}

export function validAnchors(size: "1" | "2"): Position[] {
  const result: Position[] = []
  for (let x = 0; x < WIDTH - (size === "2" ? 1 : 0); x++) {
    for (let y = size === "2" ? 1 : 0; y < HEIGHT; y++) result.push([x, y])
  }
  return result
}

export function footprintsOverlap(a: Position, b: Position, size: "1" | "2"): boolean {
  return (footprintMask(a, size) & footprintMask(b, size)) !== 0
}

/** The fixed 25-cell board fits in a positive 32-bit mask. Keep validation
 * equivalent to footprint(), without allocating cells during collision checks. */
export function footprintMask([x, y]: Position, size: "1" | "2"): number {
  const expanded = size === "1" ? 0 : 1
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    x >= WIDTH - expanded ||
    y < expanded ||
    y >= HEIGHT
  )
    throw new Error(`Invalid ${size}x${size} wild anchor: [${x}, ${y}]`)
  const cell = 1 << (x * HEIGHT + y)
  return expanded
    ? cell | (cell << HEIGHT) | (cell >>> 1) | ((cell << HEIGHT) >>> 1)
    : cell
}

/** Re-anchor at the nearest legal position after a size upgrade. */
export function resizeAnchor([x, y]: Position, size: "1" | "2"): Position {
  return [Math.min(x, WIDTH - (size === "2" ? 2 : 1)), Math.max(y, size === "2" ? 1 : 0)]
}

export function applyWilds(
  board: Board,
  wilds: RoamingWild[],
  leaveTrail: boolean,
): Board {
  const result = board.map((column) => [...column])
  for (const wild of wilds) {
    if (!wild.positions.length) throw new Error("A roaming wild requires a position")
    // Validate the complete animation path even when only the final stop pays.
    for (const position of wild.positions) footprint(position, wild.size)
    const anchors = leaveTrail ? wild.positions : wild.positions.slice(-1)
    for (const anchor of anchors)
      for (const [x, y] of footprint(anchor, wild.size)) result[x][y] = "W"
  }
  return result
}
