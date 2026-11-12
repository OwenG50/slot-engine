import {
  CAR_COLLISION_BIAS,
  CAR_MULTIPLIER_WEIGHTS,
  FEATURE_SPIN_CAR_COUNT_WEIGHTS,
  FEATURE_SPIN_CAMERA_COUNT_WEIGHTS,
  HEAD_ON_PARTNER_SYMBOLS,
} from "./settings"
import {
  Board,
  CarState,
  CarSymbol,
  Position,
  StickyCar,
  SymbolId,
  WIDTH,
  isCarSymbol,
  positionKey,
} from "./types"

function cloneBoard(board: Board): Board {
  return board.map((reel) => [...reel])
}

function weightedValue<T>(
  values: Array<{ value: T; weight: number }>,
  randomFloat: () => number,
): T {
  const total = values.reduce((sum, item) => sum + item.weight, 0)
  let roll = randomFloat() * total
  for (const item of values) {
    roll -= item.weight
    if (roll <= 0) return item.value
  }
  return values[values.length - 1]!.value
}

export function pickCarMultiplier(symbol: CarSymbol, randomFloat: () => number) {
  return weightedValue(CAR_MULTIPLIER_WEIGHTS[symbol], randomFloat)
}

export function pickFeatureSpinCameraCount(randomFloat: () => number) {
  return weightedValue(FEATURE_SPIN_CAMERA_COUNT_WEIGHTS, randomFloat)
}

export function addFeatureSpinCars(
  board: Board, randomFloat: () => number, minimum = 2,
): Board {
  const target = Math.max(minimum, weightedValue(FEATURE_SPIN_CAR_COUNT_WEIGHTS, randomFloat))
  const result = cloneBoard(board)
  let count = extractLandedCars(result, []).length
  while (count < target) {
    const options: Position[] = []
    for (let row = 0; row < result[0].length; row++) {
      const cars = Array.from({ length: WIDTH }, (_, reel) => reel)
        .filter((reel) => isCarSymbol(result[reel][row]))
      if (cars.length >= 2) continue
      for (let reel = 0; reel < WIDTH; reel++) {
        if (result[reel][row] === "S" || isCarSymbol(result[reel][row])) continue
        // Leave room for a legal opposing partner, including the outward 1+3 pair.
        const compatible = (other: number) => {
          const left = Math.min(reel, other)
          const right = Math.max(reel, other)
          if (left === 1 && right === 3)
            return result[0][row] !== "S" && result[4][row] !== "S"
          if (right - left < HEAD_ON_MIN_GAP) return false
          for (let lane = left; lane <= right; lane++)
            if (result[lane][row] === "S") return false
          return true
        }
        if (cars.length === 1 ? !compatible(cars[0]) :
            !Array.from({ length: WIDTH }, (_, other) => other)
              .some((other) => result[other][row] !== "S" && compatible(other))) continue
        options.push([reel, row])
      }
    }
    if (!options.length) break
    const [reel, row] = options[Math.floor(randomFloat() * options.length)]!
    result[reel][row] = weightedValue(HEAD_ON_PARTNER_SYMBOLS, randomFloat)
    count++
  }
  return result
}

export function applyStickyCars(board: Board, stickyCars: StickyCar[]) {
  const applied = cloneBoard(board)
  for (const sticky of stickyCars) {
    applied[sticky.position[0]][sticky.position[1]] = sticky.symbol
  }
  return applied
}

export function cameraActivationFromScatters(board: Board, currentActive: number[]) {
  const active = new Set(currentActive)
  const newlyActivated: number[] = []
  for (let reel = 0; reel < board.length; reel++) {
    const hasScatter = board[reel].includes("S")
    if (hasScatter && !active.has(reel)) {
      active.add(reel)
      newlyActivated.push(reel)
    }
  }
  return { activeReels: [...active].sort((a, b) => a - b), newlyActivated }
}

function hasScatterInDirection(board: Board, start: Position, direction: -1 | 1) {
  const [startReel, row] = start
  for (let reel = startReel + direction; reel >= 0 && reel < WIDTH; reel += direction) {
    if (board[reel][row] === "S") return true
  }
  return false
}

export function hasIllegalScatterPath(board: Board, stickyCars: StickyCar[]) {
  const sticky = new Set(stickyCars.map((car) => positionKey(car.position)))
  for (let reel = 0; reel < WIDTH; reel++) {
    for (let row = 0; row < board[reel].length; row++) {
      if (!isCarSymbol(board[reel][row]) || sticky.has(positionKey([reel, row]))) continue
      if (reel === 0 && hasScatterInDirection(board, [reel, row], 1)) return true
      if (reel === WIDTH - 1 && hasScatterInDirection(board, [reel, row], -1)) return true
      if (reel > 0 && reel < WIDTH - 1) {
        const leftBad = hasScatterInDirection(board, [reel, row], -1)
        const rightBad = hasScatterInDirection(board, [reel, row], 1)
        if (leftBad && rightBad) return true
      }
    }
  }
  return false
}

function chooseDirection(
  board: Board,
  position: Position,
  randomFloat: () => number,
  allowScatterCrossing: boolean,
  stickyCars: StickyCar[],
): { direction: -1 | 1; locked: boolean } {
  const [reel] = position
  if (reel === 0) return { direction: 1, locked: true }
  if (reel === WIDTH - 1) return { direction: -1, locked: true }

  const leftBlockedByScatter =
    !allowScatterCrossing && hasScatterInDirection(board, position, -1)
  const rightBlockedByScatter =
    !allowScatterCrossing && hasScatterInDirection(board, position, 1)
  if (leftBlockedByScatter && !rightBlockedByScatter)
    return { direction: 1, locked: true }
  if (!leftBlockedByScatter && rightBlockedByScatter)
    return { direction: -1, locked: true }
  const targets = stickyCars.filter((car) =>
    car.position[1] === position[1] &&
    Math.abs(car.position[0] - reel) >= 2,
  )
  const leftTarget = targets.some((car) => car.position[0] < reel)
  const rightTarget = targets.some((car) => car.position[0] > reel)
  const leftChance = leftTarget === rightTarget
    ? 0.5
    : leftTarget ? CAR_COLLISION_BIAS.towardSticky : 1 - CAR_COLLISION_BIAS.towardSticky
  return { direction: randomFloat() < leftChance ? -1 : 1, locked: false }
}

/** Two new cars need two empty cells between them to both move before meeting. */
export const HEAD_ON_MIN_GAP = 3

function partnerReels(reel: number) {
  return Array.from({ length: WIDTH }, (_, r) => r)
    .filter((r) => Math.abs(r - reel) >= HEAD_ON_MIN_GAP ||
      (Math.min(r, reel) === 1 && Math.max(r, reel) === 3))
}

function pickPairPlacement<T extends { left: number; right: number }>(
  options: T[], randomFloat: () => number,
): T {
  const inward = options.filter((option) => option.right - option.left >= HEAD_ON_MIN_GAP)
  const outward = options.filter((option) => option.right - option.left < HEAD_ON_MIN_GAP)
  const pool = inward.length && outward.length
    ? (randomFloat() < CAR_COLLISION_BIAS.newPair ? inward : outward)
    : options
  return pool[Math.floor(randomFloat() * pool.length)]!
}

/**
 * Gives some lone new cars a partner on the same row, and optionally
 * places a fresh pair on an open row. Added cars replace only
 * non-scatter, non-car symbols, and each lane must be clear of sticky cars,
 * other cars, and (on paid spins) scatters.
 */
export function addHeadOnPartners(params: {
  board: Board
  stickyCars: StickyCar[]
  chance: number
  pairChance?: number
  allowScatterCrossing: boolean
  randomFloat: () => number
}): Board {
  const {
    board, stickyCars, chance, pairChance = 0, allowScatterCrossing, randomFloat,
  } = params
  if (chance <= 0 && pairChance <= 0) return board
  const result = cloneBoard(board)
  const sticky = new Set(stickyCars.map((car) => positionKey(car.position)))
  for (let row = 0; row < result[0].length; row++) {
    const cars = Array.from({ length: WIDTH }, (_, reel) => reel)
      .filter((reel) => isCarSymbol(result[reel][row]))
    const newCars = cars.filter((reel) => !sticky.has(positionKey([reel, row])))
    if (newCars.length !== 1) continue
    const lone = newCars[0]
    const options = partnerReels(lone).filter((partner) => {
      const lo = Math.min(lone, partner)
      const hi = Math.max(lone, partner)
      const outward = hi - lo < HEAD_ON_MIN_GAP
      for (let reel = outward ? 0 : lo; reel <= (outward ? WIDTH - 1 : hi); reel++) {
        if (reel === lone) continue
        const symbol = result[reel][row]
        if (isCarSymbol(symbol)) return false
        if (symbol === "S" && (reel === partner || !allowScatterCrossing)) return false
      }
      return true
    })
    if (options.length === 0 || randomFloat() >= chance) continue
    const { partner } = pickPairPlacement(options.map((partner) => ({
      partner, left: Math.min(lone, partner), right: Math.max(lone, partner),
    })), randomFloat)
    result[partner][row] = weightedValue(HEAD_ON_PARTNER_SYMBOLS, randomFloat)
  }
  if (pairChance > 0 && !hasOpposingPair(result, sticky) && randomFloat() < pairChance) {
    const placements = HEAD_ON_PAIR_REELS.flatMap(([left, right]) =>
      Array.from({ length: result[0].length }, (_, row) => row)
        .filter((row) => {
          for (let reel = 0; reel < WIDTH; reel++) {
            const symbol = result[reel][row]
            if (isCarSymbol(symbol) && !sticky.has(positionKey([reel, row]))) return false
          }
          const outward = right - left < HEAD_ON_MIN_GAP
          for (let reel = outward ? 0 : left; reel <= (outward ? WIDTH - 1 : right); reel++) {
            const symbol = result[reel][row]
            if (isCarSymbol(symbol)) return false
            if (symbol === "S" && (reel === left || reel === right || !allowScatterCrossing))
              return false
          }
          return true
        })
        .map((row) => ({ left, right, row })),
    )
    if (placements.length > 0) {
      const { left, right, row } = pickPairPlacement(placements, randomFloat)
      result[left][row] = weightedValue(HEAD_ON_PARTNER_SYMBOLS, randomFloat)
      result[right][row] = weightedValue(HEAD_ON_PARTNER_SYMBOLS, randomFloat)
    }
  }
  return result
}

const HEAD_ON_PAIR_REELS: ReadonlyArray<readonly [number, number]> = [[0, 3], [0, 4], [1, 4], [1, 3]]

function hasOpposingPair(board: Board, sticky: Set<string>) {
  for (let row = 0; row < board[0].length; row++) {
    const reels = Array.from({ length: WIDTH }, (_, reel) => reel).filter((reel) =>
      isCarSymbol(board[reel][row]) && !sticky.has(positionKey([reel, row])),
    )
    if (reels.length === 2 &&
        (reels[1] - reels[0] >= HEAD_ON_MIN_GAP || (reels[0] === 1 && reels[1] === 3)))
      return true
  }
  return false
}

function sameCell(a: Position, b: Position) {
  return a[0] === b[0] && a[1] === b[1]
}

export function hasLegalCarLandings(board: Board, stickyCars: StickyCar[]) {
  const counts = new Map<number, number>()
  for (const car of extractLandedCars(board, stickyCars)) {
    const row = car.position[1]
    const count = (counts.get(row) ?? 0) + 1
    if (count > 2) return false
    counts.set(row, count)
  }
  return true
}

export function hasLegalCarMovement(cars: CarState[]) {
  const directionsByRow = new Map<number, Set<number>>()
  for (const car of cars) {
    if (!car.spawnedThisSpin) continue
    if (car.path.length < 1) return false
    const directions = directionsByRow.get(car.start[1]) ?? new Set<number>()
    if (directions.has(car.direction)) return false
    directions.add(car.direction)
    directionsByRow.set(car.start[1], directions)
    if (car.collision?.kind === "newNew") {
      const partner = cars.find((other) => other.id === car.collision?.withId)
      if (partner?.collision?.kind !== "newNew" || partner.collision.withId !== car.id)
        return false
    }
  }
  return true
}

export interface CarMoveResolution {
  boardAfterMove: Board
  carsAfterMove: CarState[]
  multipliers: Map<string, number>
  event: {
    cars: Array<{
      start: { reel: number; row: number }
      end: { reel: number; row: number }
      direction: "left" | "right"
      initialMultiplier: number
      multiplierAfterMove: number
      multiplier: number
      collision:
        | { kind: "edge" }
        | {
            kind: "newNew" | "newSticky"
            withStart: { reel: number; row: number }
            withPosition: { reel: number; row: number }
          }
    }>
    cameraFlashes?: Array<{
      reel: number
      triggeringCar: {
        start: { reel: number; row: number }
        before: number
        after: number
      }
      doubledCars: Array<{
        position: { reel: number; row: number }
        before: number
        after: number
      }>
    }>
  }
}

export function resolveCarMove(params: {
  board: Board
  stickyCars: StickyCar[]
  activeCameraReels: number[]
  allowScatterCrossing?: boolean
  randomFloat: () => number
}): CarMoveResolution {
  const {
    board,
    stickyCars,
    activeCameraReels,
    randomFloat,
    allowScatterCrossing = false,
  } = params
  const stickyByPosition = new Map(
    stickyCars.map((car) => [positionKey(car.position), car]),
  )
  const occupiedById = new Map<string, CarState>()

  let idCounter = 0
  const nextId = () => `car-${++idCounter}`

  const cars: CarState[] = []
  for (const sticky of stickyCars) {
    const existing: CarState = {
      id: nextId(),
      symbol: sticky.symbol,
      start: sticky.position,
      position: sticky.position,
      multiplier: sticky.multiplier,
      direction: 1,
      path: [],
      spawnedThisSpin: false,
      settled: true,
    }
    cars.push(existing)
    occupiedById.set(existing.id, existing)
  }

  const movingCars: CarState[] = []
  const initialMultipliers = new Map<string, number>()
  const locked = new Map<string, boolean>()
  for (let reel = 0; reel < WIDTH; reel++) {
    for (let row = 0; row < board[reel].length; row++) {
      const symbol = board[reel][row]
      if (!isCarSymbol(symbol) || stickyByPosition.has(positionKey([reel, row]))) continue
      const pick = chooseDirection(
        board, [reel, row], randomFloat, allowScatterCrossing, stickyCars,
      )
      const car: CarState = {
        id: nextId(),
        symbol,
        start: [reel, row],
        position: [reel, row],
        multiplier: pickCarMultiplier(symbol, randomFloat),
        direction: pick.direction,
        path: [],
        spawnedThisSpin: true,
        settled: false,
      }
      cars.push(car)
      movingCars.push(car)
      initialMultipliers.set(car.id, car.multiplier)
      occupiedById.set(car.id, car)
      locked.set(car.id, pick.locked)
    }
  }

  const byRow = new Map<number, CarState[]>()
  for (const car of movingCars) {
    const row = car.position[1]
    byRow.set(row, [...(byRow.get(row) ?? []), car])
  }
  for (const [_, rowCars] of byRow) {
    const ordered = rowCars.slice().sort((a, b) => a.position[0] - b.position[0])
    for (let i = 0; i < ordered.length - 1; i++) {
      const left = ordered[i]
      const right = ordered[i + 1]
      // Closer pairs cannot both move before meeting, and sticky cars would intercept.
      if (right.position[0] - left.position[0] < HEAD_ON_MIN_GAP) continue
      if (stickyCars.some((car) =>
        car.position[1] === left.position[1] &&
        car.position[0] > left.position[0] &&
        car.position[0] < right.position[0],
      )) continue
      if (locked.get(left.id) && locked.get(right.id)) continue
      if (randomFloat() < CAR_COLLISION_BIAS.newPair) {
        if (!locked.get(left.id)) left.direction = 1
        if (!locked.get(right.id)) right.direction = -1
      }
    }
    if (ordered.length !== 2) continue
    const [left, right] = ordered
    const tooClose = right.position[0] - left.position[0] < HEAD_ON_MIN_GAP
    if (!locked.get(left.id) && !locked.get(right.id) &&
        (left.direction === right.direction || tooClose)) {
      left.direction = -1
      right.direction = 1
    } else if (left.direction === right.direction) {
      // Conflicting locked directions are rejected by the movement legality check.
      if (!locked.get(right.id)) right.direction = left.direction === 1 ? -1 : 1
      else if (!locked.get(left.id)) left.direction = right.direction === 1 ? -1 : 1
    }
  }

  const active = new Set(movingCars.map((car) => car.id))
  for (let tick = 0; tick < WIDTH; tick++) {
    if (active.size === 0) break

    const moves = new Map<string, Position>()
    for (const car of movingCars) {
      if (!active.has(car.id)) continue
      const nextReel = car.position[0] + car.direction
      if (nextReel < 0 || nextReel >= WIDTH) {
        active.delete(car.id)
        car.settled = true
        continue
      }
      moves.set(car.id, [nextReel, car.position[1]])
    }

    const handled = new Set<string>()
    for (const car of movingCars) {
      if (!moves.has(car.id) || handled.has(car.id)) continue
      const next = moves.get(car.id)!
      let stopped = false

      for (const other of movingCars) {
        if (other.id === car.id || !moves.has(other.id)) continue
        const otherNext = moves.get(other.id)!
        if (sameCell(next, other.position) && sameCell(otherNext, car.position)) {
          car.collision = {
            kind: "newNew",
            withId: other.id,
            withPosition: other.position,
          }
          other.collision = {
            kind: "newNew",
            withId: car.id,
            withPosition: car.position,
          }
          car.settled = true
          other.settled = true
          active.delete(car.id)
          active.delete(other.id)
          handled.add(car.id)
          handled.add(other.id)
          stopped = true
          break
        }
      }
      if (stopped) continue

      const occupant = cars.find(
        (other) => other.id !== car.id && sameCell(other.position, next),
      )
      if (occupant) {
        car.collision = {
          kind: occupant.spawnedThisSpin ? "newNew" : "newSticky",
          withId: occupant.id,
          withPosition: occupant.position,
        }
        car.settled = true
        active.delete(car.id)
        handled.add(car.id)
        continue
      }

      car.position = next
      car.path.push(next)
      handled.add(car.id)
    }
  }

  movingCars.sort((a, b) => a.start[1] - b.start[1] || a.start[0] - b.start[0])
  const activeCameras = new Set(activeCameraReels)
  const multipliersAfterMove = new Map<string, number>()
  const flashPayload: NonNullable<CarMoveResolution["event"]["cameraFlashes"]> = []
  // Paths are independent across rows; resolve camera effects and crashes row by row.
  for (const row of [...byRow.keys()].sort((a, b) => a - b)) {
    const rowCars = movingCars.filter((car) => car.start[1] === row)
    // A camera on the landing reel flashes as its car pulls away.
    const flashes = rowCars.flatMap((car) =>
      [car.start, ...car.path]
        .filter(([reel]) => activeCameras.has(reel))
        .map(([reel]) => ({ reel, car })),
    )
    for (const { reel, car: triggeringCar } of flashes) {
      const before = triggeringCar.multiplier
      triggeringCar.multiplier *= 2
      const doubledCars: Array<{
        position: { reel: number; row: number }
        before: number
        after: number
      }> = []
      for (const car of cars) {
        if (car.spawnedThisSpin && car.start[1] === row) continue
        // Paths are precomputed, but lower-row cars are still waiting at their starts.
        const position = car.spawnedThisSpin && car.start[1] > row
          ? car.start : car.position
        if (position[0] !== reel || !car.settled) continue
        const before = car.multiplier
        car.multiplier *= 2
        doubledCars.push({
          position: { reel: position[0], row: position[1] },
          before,
          after: car.multiplier,
        })
      }
      flashPayload.push({
        reel,
        triggeringCar: {
          start: { reel: triggeringCar.start[0], row: triggeringCar.start[1] },
          before,
          after: triggeringCar.multiplier,
        },
        doubledCars,
      })
    }

    const combinedPairs = new Set<string>()
    for (const car of rowCars) {
      if (car.collision?.kind !== "newNew") continue
      const other = occupiedById.get(car.collision.withId)
      if (!other || !other.spawnedThisSpin) continue
      const pair = [car.id, other.id].sort().join(":")
      if (combinedPairs.has(pair)) continue
      combinedPairs.add(pair)
      const combined = car.multiplier + other.multiplier
      car.multiplier = combined
      other.multiplier = combined
    }
    for (const car of rowCars) multipliersAfterMove.set(car.id, car.multiplier)
  }

  const boardAfterMove = cloneBoard(board)
  for (const car of movingCars) {
    for (const [reel, row] of [car.start, ...car.path])
      boardAfterMove[reel][row] = "W"
  }
  for (const car of cars) {
    boardAfterMove[car.position[0]][car.position[1]] = car.symbol
  }

  const multipliers = new Map<string, number>()
  for (const car of cars) multipliers.set(positionKey(car.position), car.multiplier)

  const payloadCars: CarMoveResolution["event"]["cars"] = movingCars.map((car) => {
    let collision: CarMoveResolution["event"]["cars"][number]["collision"] = {
      kind: "edge",
    }
    if (car.collision) {
      const other = occupiedById.get(car.collision.withId)
      if (!other)
        throw new Error(`Missing Speed Trap collision partner ${car.collision.withId}`)
      collision = {
        kind: car.collision.kind,
        withStart: { reel: other.start[0], row: other.start[1] },
        withPosition: { reel: other.position[0], row: other.position[1] },
      }
    }
    return {
      start: { reel: car.start[0], row: car.start[1] },
      end: { reel: car.position[0], row: car.position[1] },
      direction: car.direction === -1 ? "left" : "right",
      initialMultiplier: initialMultipliers.get(car.id)!,
      multiplierAfterMove: multipliersAfterMove.get(car.id)!,
      multiplier: car.multiplier,
      collision,
    }
  })

  return {
    boardAfterMove,
    carsAfterMove: cars,
    multipliers,
    event: {
      cars: payloadCars,
      ...(flashPayload.length > 0 ? { cameraFlashes: flashPayload } : {}),
    },
  }
}

export function stickyFromCars(cars: CarState[]): StickyCar[] {
  return cars
    .filter((car) => car.settled)
    .map((car) => ({
      symbol: car.symbol,
      position: car.position,
      multiplier: car.multiplier,
    }))
}

export function activeCameraStatus(activeReels: number[]) {
  return new Set(activeReels)
}

export function drawRandomDistinctReels(
  amount: number,
  randomFloat: () => number,
  width = WIDTH,
) {
  const picks = new Set<number>()
  let attempts = 0
  const maxAttempts = Math.max(32, width * 16)
  while (picks.size < amount && picks.size < width && attempts < maxAttempts) {
    attempts++
    picks.add(Math.floor(randomFloat() * width))
  }
  if (picks.size < amount && picks.size < width) {
    for (let reel = 0; reel < width && picks.size < amount; reel++) {
      picks.add(reel)
    }
  }
  return [...picks].sort((a, b) => a - b)
}

export function countScatters(board: Board) {
  return board.reduce(
    (sum, reel) => sum + reel.filter((symbol) => symbol === "S").length,
    0,
  )
}

export function extractLandedCars(board: Board, stickyCars: StickyCar[]) {
  const sticky = new Set(stickyCars.map((car) => positionKey(car.position)))
  const landed: Array<{ symbol: CarSymbol; position: Position }> = []
  for (let reel = 0; reel < board.length; reel++) {
    for (let row = 0; row < board[reel].length; row++) {
      const symbol = board[reel][row]
      if (!isCarSymbol(symbol)) continue
      if (sticky.has(positionKey([reel, row]))) continue
      landed.push({ symbol, position: [reel, row] })
    }
  }
  return landed
}

export function boardToSymbols(board: Board, getSymbol: (id: SymbolId) => unknown) {
  return board.map((reel) => reel.map((id) => getSymbol(id)))
}
