import { describe, expect, it } from "vitest"
import {
  canRepositionWilds,
  movementPaths,
  moveRoamingWilds,
  WildMovement,
} from "../src/collection"
import { FeatureState, RandomSource } from "../src/feature"
import { FEATURE_RULES } from "../src/settings"
import { Board, Position, positionKey } from "../src/types"
import { footprint, footprintsOverlap, validAnchors } from "../src/wilds"

const board = (symbol: Board[number][number] = "L1"): Board =>
  Array.from({ length: 5 }, () => Array(5).fill(symbol))
const state = (anchors: Position[]): FeatureState => ({
  upgrades: {},
  collected: { 1: 0, 2: 0, 3: 0, 4: 0 },
  anchors: structuredClone(anchors),
})
const choosePath = (...paths: Position[][]): RandomSource => ({
  randomFloat: () => 0,
  randomItem<T>(items: T[]): T {
    const expected = paths.shift()
    const found = items.find((item) => JSON.stringify(item) === JSON.stringify(expected))
    expect(found, JSON.stringify(expected)).toBeDefined()
    return found!
  },
})
function checkPath(path: Position[], size: "1" | "2", blockers: Position[] = []) {
  expect(path.length - 1).toBeGreaterThanOrEqual(1)
  expect(path.length - 1).toBeLessThanOrEqual(8)
  const directions: string[] = []
  for (let i = 0; i < path.length; i++) {
    footprint(path[i], size)
    for (const blocker of blockers)
      expect(footprintsOverlap(path[i], blocker, size)).toBe(false)
    if (!i) continue
    const dx = path[i][0] - path[i - 1][0]
    const dy = path[i][1] - path[i - 1][1]
    expect(Math.abs(dx) + Math.abs(dy)).toBe(1)
    const direction = `${dx},${dy}`
    if (direction !== directions.at(-1)) directions.push(direction)
  }
  expect(directions.length).toBeLessThanOrEqual(2)
  if (directions.length === 2) {
    const [ax, ay] = directions[0].split(",").map(Number)
    const [bx, by] = directions[1].split(",").map(Number)
    expect(Math.abs(ax * bx + ay * by)).toBe(0)
  }
  expect(new Set(path.map(positionKey)).size).toBe(path.length)
}

describe("ButchEm random roaming collection", () => {
  it.each([true, false])(
    "supports eight-cell corner-to-corner paths with collection=%s",
    (collect) => {
      expect(FEATURE_RULES.maxMovesPerSpin).toBe(8)
      for (const from of [
        [0, 0],
        [0, 4],
        [4, 0],
        [4, 4],
      ] as Position[]) {
        const destination: Position = [4 - from[0], 4 - from[1]]
        const path: Position[] = [[...from]]
        for (let step = 1; step <= 4; step++)
          path.push([from[0] + (from[0] === 0 ? step : -step), from[1]])
        for (let step = 1; step <= 4; step++)
          path.push([destination[0], from[1] + (from[1] === 0 ? step : -step)])
        const source = board("H3")
        source[destination[0]][destination[1]] = "L1"
        const feature = state([from])
        expect(movementPaths(from, [], "1", 7)).not.toContainEqual(path)
        expect(canRepositionWilds(source, [from], "1", 7)).toBe(false)
        expect(canRepositionWilds(source, [from], "1")).toBe(true)
        const movement = moveRoamingWilds(
          source,
          feature,
          "1",
          FEATURE_RULES,
          choosePath(path),
          collect,
        )[0]
        expect(movement.steps.map(({ reel, row }) => [reel, row])).toEqual(path)
        expect(movement.steps.map((step) => step.symbols[0].symbol)).toEqual([
          ...Array(8).fill("H3"),
          "L1",
        ])
        expect(movement.collectedCount).toBe(collect ? 7 : 0)
        expect(feature.collected[3]).toBe(collect ? 7 : 0)
        expect(feature.anchors).toEqual([destination])
        checkPath(path, "1")
      }
    },
  )

  it.each(["1", "2"] as const)(
    "enumerates bounded non-reversing paths from every %s-cell anchor",
    (size) => {
      for (const anchor of validAnchors(size)) {
        const paths = movementPaths(anchor, [], size)
        expect(paths.length).toBeGreaterThan(0)
        for (const path of paths) {
          expect(path[0]).toEqual(anchor)
          checkPath(path, size)
        }
        expect(new Set(paths.map((path) => JSON.stringify(path))).size).toBe(paths.length)
      }
    },
  )

  it.each([
    [
      [1, 3],
      [1, 2],
      [1, 1],
      [2, 1],
      [3, 1],
    ],
    [
      [4, 1],
      [4, 2],
      [3, 2],
      [2, 2],
      [1, 2],
      [0, 2],
    ],
    [
      [0, 2],
      [1, 2],
      [2, 2],
      [3, 2],
    ],
    [
      [1, 2],
      [1, 1],
      [2, 1],
    ],
  ] as Position[][])(
    "includes the requested straight and L-shaped example %#",
    (...path) => {
      expect(movementPaths(path[0], [], "1")).toContainEqual(path)
    },
  )

  it.each(["1", "2"] as const)(
    "always moves both %s-cell trucks without overlap for every initial layout and first route",
    (size) => {
      const anchors = validAnchors(size)
      for (const first of anchors)
        for (const second of anchors) {
          if (footprintsOverlap(first, second, size)) continue
          for (const path of movementPaths(first, [second], size)) {
            checkPath(path, size, [second])
            const next = movementPaths(second, [path.at(-1)!], size)
            expect(next.length).toBeGreaterThan(0)
            // Unit translation cannot cross a stationary footprint if both
            // endpoints are clear; verify each unit step, rather than just the end.
          }
        }
    },
    30000,
  )

  it("records every crossed symbol and collects nonwinning mixed H symbols", () => {
    const source = board()
    source[1][2] = "H1"
    source[2][2] = "H3"
    source[2][1] = "S"
    source[2][0] = "W"
    const feature = state([[0, 2]])
    const snapshot = structuredClone(source)
    const movements = moveRoamingWilds(
      source,
      feature,
      "1",
      FEATURE_RULES,
      choosePath([
        [0, 2],
        [1, 2],
        [2, 2],
        [2, 1],
        [2, 0],
      ]),
    )
    expect(movements[0].steps.map(({ reel, row }) => [reel, row])).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
      [2, 1],
      [2, 0],
    ])
    expect(
      movements[0].steps
        .flatMap((step) => step.symbols)
        .map((cell) => [cell.symbol, cell.collected]),
    ).toEqual([
      ["L1", false],
      ["H1", true],
      ["H3", true],
      ["S", false],
      ["W", false],
    ])
    expect(movements[0].collectedSymbols).toEqual([
      { symbol: "H1", upgrade: 1, count: 1, collected: 1 },
      { symbol: "H3", upgrade: 3, count: 1, collected: 1 },
    ])
    expect(feature.anchors).toEqual([[2, 0]])
    expect(source).toEqual(snapshot)
  })

  it("collects the full 2x2 footprint at every step and deduplicates overlapping footprints", () => {
    const source = board("H3")
    for (const [x, y] of footprint([3, 3], "2")) source[x][y] = "L1"
    const feature = state([[0, 1]])
    const movement = moveRoamingWilds(
      source,
      feature,
      "2",
      FEATURE_RULES,
      choosePath([
        [0, 1],
        [1, 1],
        [2, 1],
        [3, 1],
        [3, 2],
        [3, 3],
      ]),
    )[0]
    expect(movement.steps.every((step) => step.symbols.length === 4)).toBe(true)
    expect(
      movement.steps.map((step) => step.symbols.filter((cell) => cell.collected).length),
    ).toEqual([0, 4, 2, 2, 0, 0])
    expect(movement.collectedCount).toBe(8)
    expect(feature.collected[3]).toBe(8)
    expect(feature.upgrades).toEqual({})
    expect(movement.steps[0].symbols.every((cell) => !cell.collected)).toBe(true)
  })

  it("shares meters and never credits the same H cell twice across trucks", () => {
    const source = board("H4")
    source[2][0] = "L1"
    source[0][2] = "L1"
    const feature = state([
      [0, 2],
      [4, 2],
    ])
    feature.collected[4] = 3
    const movements = moveRoamingWilds(
      source,
      feature,
      "1",
      FEATURE_RULES,
      choosePath(
        [
          [0, 2],
          [1, 2],
          [2, 2],
          [2, 1],
          [2, 0],
        ],
        [
          [4, 2],
          [3, 2],
          [2, 2],
          [1, 2],
          [0, 2],
        ],
      ),
    )
    expect(movements.map((movement) => movement.collectedCount)).toEqual([3, 1])
    expect(movements.map((movement) => movement.collectedSymbols[0].collected)).toEqual([
      6, 7,
    ])
    const pickups = movements.flatMap((movement) =>
      movement.steps.flatMap((step) =>
        step.symbols
          .filter((cell) => cell.collected)
          .map(({ reel, row }) => positionKey([reel, row])),
      ),
    )
    expect(new Set(pickups).size).toBe(4)
    expect(feature.collected[4]).toBe(7)
  })

  it("keeps moving and reports pickups for an already unlocked upgrade without advancing its meter", () => {
    const source = board("H3")
    source[2][0] = "L1"
    const feature = state([[0, 0]])
    feature.upgrades[3] = true
    feature.collected[3] = 5
    const movement = moveRoamingWilds(
      source,
      feature,
      "1",
      FEATURE_RULES,
      choosePath([
        [0, 0],
        [1, 0],
        [2, 0],
      ]),
    )[0]
    expect(movement.collectedSymbols).toEqual([
      { symbol: "H3", upgrade: 3, count: 1, collected: 5 },
    ])
  })

  it("carries partial meters between spins and snapshots earlier results", () => {
    const source = board("H2")
    source[4][0] = "L1"
    source[4][3] = "L1"
    const feature = state([[0, 0]])
    const first = moveRoamingWilds(
      source,
      feature,
      "1",
      FEATURE_RULES,
      choosePath([
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
        [4, 0],
      ]),
    )
    const snapshot = structuredClone(first)
    moveRoamingWilds(
      source,
      feature,
      "1",
      FEATURE_RULES,
      choosePath([
        [4, 0],
        [4, 1],
        [4, 2],
        [4, 3],
      ]),
    )
    expect(feature.collected[2]).toBe(5)
    expect(first).toEqual(snapshot)
  })

  it("allows H crossings on the same legal route and moves on an empty collection board", () => {
    const source = board("H1")
    source[2][1] = "L1"
    const paths: Position[][] = [
      [
        [0, 0],
        [1, 0],
        [2, 0],
        [2, 1],
      ],
    ]
    const empty = moveRoamingWilds(
      board(),
      state([[0, 0]]),
      "1",
      FEATURE_RULES,
      choosePath(...paths),
    )
    const high = moveRoamingWilds(
      source,
      state([[0, 0]]),
      "1",
      FEATURE_RULES,
      choosePath(...paths),
    )
    const anchors = (movements: WildMovement[]) =>
      movements.map((movement) => movement.steps.map(({ reel, row }) => [reel, row]))
    expect(anchors(empty)).toEqual(anchors(high))
    expect(empty[0].collectedSymbols).toEqual([])
    expect(empty[0].collectedCount).toBe(0)
  })

  it("rejects invalid movement limits", () => {
    for (const limit of [0, 9, 1.5])
      expect(() => movementPaths([0, 0], [], "1", limit)).toThrow()
  })
})

describe("ButchEm non-collecting repositioning", () => {
  it.each(["1", "2"] as const)(
    "uses identical steps while preserving meters and symbols at size %s",
    (size) => {
      const source = board("H3")
      // Both destinations are low; intermediate steps still cross real H
      // symbols, collecting only during the second phase.
      for (const [x, y] of footprint([2, 2], size)) source[x][y] = "L1"
      for (const [x, y] of footprint([0, 1], size)) source[x][y] = "L1"
      const feature = state([[0, 1]])
      feature.collected[3] = 4
      const original = structuredClone(source)
      const movements = moveRoamingWilds(
        source,
        feature,
        size,
        FEATURE_RULES,
        choosePath([
          [0, 1],
          [1, 1],
          [2, 1],
          [2, 2],
        ]),
        false,
      )
      const movement = movements[0]
      checkPath(
        movement.steps.map(({ reel, row }): Position => [reel, row]),
        size,
      )
      expect(movement.collectedSymbols).toEqual([])
      expect(movement.collectedCount).toBe(0)
      expect(
        movement.steps.every(
          (step) =>
            step.symbols.length === Number(size) ** 2 &&
            step.symbols.every((cell) => !cell.collected),
        ),
      ).toBe(true)
      expect(
        movement.steps
          .slice(0, -1)
          .some((step) => step.symbols.some((cell) => cell.symbol === "H3")),
      ).toBe(true)
      expect(movement.steps.at(-1)!.symbols.every((cell) => cell.symbol === "L1")).toBe(
        true,
      )
      expect(feature.collected).toEqual({ 1: 0, 2: 0, 3: 4, 4: 0 })
      expect(feature.upgrades).toEqual({})
      expect(feature.anchors).toEqual([[2, 2]])
      expect(source).toEqual(original)
      const snapshot = structuredClone(movements)
      const collecting = moveRoamingWilds(
        source,
        feature,
        size,
        FEATURE_RULES,
        choosePath([
          [2, 2],
          [1, 2],
          [0, 2],
          [0, 1],
        ]),
      )
      expect(collecting[0].steps[0]).toMatchObject({ reel: 2, row: 2 })
      expect(collecting[0].collectedCount).toBe(2)
      expect(feature.collected[3]).toBe(6)
      expect(movements).toEqual(snapshot)
    },
  )

  it.each(["1", "2"] as const)(
    "keeps both size-%s repositioning endpoints clear of H symbols/scatters and every step clear of the other truck",
    (size) => {
      const source = board("L1")
      source[2][2] = "S"
      source[1][3] = "H1"
      source[4][4] = "H4"
      const firstPick: RandomSource = {
        randomFloat: () => 0,
        randomItem: (items) => items[0],
      }
      const anchors = validAnchors(size)
      for (const first of anchors)
        for (const second of anchors) {
          if (footprintsOverlap(first, second, size)) continue
          const feature = state([first, second])
          const before = structuredClone(feature)
          expect(canRepositionWilds(source, feature.anchors, size)).toBe(true)
          expect(feature).toEqual(before)
          const movements = moveRoamingWilds(
            source,
            feature,
            size,
            FEATURE_RULES,
            firstPick,
            false,
          )
          const current = structuredClone([first, second])
          for (const movement of movements) {
            const path = movement.steps.map(({ reel, row }): Position => [reel, row])
            checkPath(
              path,
              size,
              current.filter((_, other) => other !== movement.roamingWildIndex),
            )
            expect(
              footprint(path.at(-1)!, size).every(
                ([x, y]) => source[x][y] !== "S" && !source[x][y].startsWith("H"),
              ),
            ).toBe(true)
            current[movement.roamingWildIndex] = path.at(-1)!
          }
          expect(feature.collected).toEqual(before.collected)
          const collecting = moveRoamingWilds(
            source,
            feature,
            size,
            FEATURE_RULES,
            firstPick,
          )
          for (const movement of collecting) {
            const path = movement.steps.map(({ reel, row }): Position => [reel, row])
            expect(path[0]).toEqual(current[movement.roamingWildIndex])
            checkPath(
              path,
              size,
              current.filter((_, other) => other !== movement.roamingWildIndex),
            )
            current[movement.roamingWildIndex] = path.at(-1)!
          }
        }
    },
  )

  it("does not move or change meters when no scatter-free repositioning exists", () => {
    const source = board("S")
    const feature = state([[0, 1]])
    const original = structuredClone(feature)
    const rng: RandomSource = { randomFloat: () => 0, randomItem: (items) => items[0] }
    expect(canRepositionWilds(source, feature.anchors, "2")).toBe(false)
    expect(() =>
      moveRoamingWilds(source, feature, "2", FEATURE_RULES, rng, false),
    ).toThrow("No legal")
    expect(feature).toEqual(original)
  })
})

describe("ButchEm reveal landing underlays", () => {
  it.each(["H1", "H2", "H3", "H4"] as const)(
    "excludes %s in every cell of a 2x2 destination",
    (symbol) => {
      for (const cell of footprint([2, 2], "2")) {
        const source = board("L1")
        source[cell[0]][cell[1]] = symbol
        const feature = state([[0, 1]])
        const rng: RandomSource = {
          randomFloat: () => 0,
          randomItem<T>(items: T[]): T {
            for (const path of items as Position[][])
              expect(
                footprint(path.at(-1)!, "2").some(([x, y]) => source[x][y] === symbol),
              ).toBe(false)
            return items[0]
          },
        }
        expect(canRepositionWilds(source, feature.anchors, "2")).toBe(true)
        moveRoamingWilds(source, feature, "2", FEATURE_RULES, rng, false)
        expect(feature.collected).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0 })
      }
    },
  )

  it.each(["1", "2"] as const)(
    "rejects an all-H board at size %s without moving or collecting",
    (size) => {
      const source = board("H2")
      const feature = state([[0, 1]])
      const before = structuredClone(feature)
      const rng: RandomSource = {
        randomFloat: () => 0,
        randomItem: (items) => items[0],
      }
      expect(canRepositionWilds(source, feature.anchors, size)).toBe(false)
      expect(() =>
        moveRoamingWilds(source, feature, size, FEATURE_RULES, rng, false),
      ).toThrow("No legal")
      expect(feature).toEqual(before)
    },
  )
})

describe("ButchEm unrestricted collection endpoints", () => {
  const rng: RandomSource = { randomFloat: () => 0, randomItem: (items) => items[0] }

  it.each(["1", "2"] as const)(
    "accepts a reveal with no clear collection exit at size %s",
    (size) => {
      const source = board("H1")
      // Only one clear reveal destination exists. Collection must be able to
      // end over H instead of forcing another strip draw.
      for (const [x, y] of footprint([2, 2], size)) source[x][y] = "L1"
      const feature = state([[0, 1]])
      expect(canRepositionWilds(source, feature.anchors, size)).toBe(true)
      const reveal = moveRoamingWilds(source, feature, size, FEATURE_RULES, rng, false)
      expect(reveal[0].steps.at(-1)!.symbols.every((cell) => cell.symbol === "L1")).toBe(
        true,
      )
      const collecting = moveRoamingWilds(source, feature, size, FEATURE_RULES, rng)
      expect(
        collecting[0].steps.at(-1)!.symbols.some((cell) => cell.symbol === "H1"),
      ).toBe(true)
      expect(collecting[0].collectedCount).toBeGreaterThan(0)
    },
  )

  it("moves both 2x2 trucks without requiring H-free collection endpoints", () => {
    const source = board("H1")
    for (let x = 0; x < 5; x++) for (let y = 0; y < 2; y++) source[x][y] = "L1"
    const feature = state([
      [0, 2],
      [3, 2],
    ])
    expect(canRepositionWilds(source, feature.anchors, "2")).toBe(true)
    moveRoamingWilds(source, feature, "2", FEATURE_RULES, rng, false)
    const collecting = moveRoamingWilds(source, feature, "2", FEATURE_RULES, rng)
    for (const movement of collecting) {
      checkPath(
        movement.steps.map(({ reel, row }): Position => [reel, row]),
        "2",
      )
    }
  })

  it.each(["H1", "H2", "H3", "H4"] as const)(
    "collects %s in the final footprint at either truck size",
    (symbol) => {
      for (const size of ["1", "2"] as const) {
        const feature = state([[0, 1]])
        const movement = moveRoamingWilds(
          board(symbol),
          feature,
          size,
          FEATURE_RULES,
          choosePath([
            [0, 1],
            [1, 1],
          ]),
        )[0]
        expect(
          movement.steps
            .at(-1)!
            .symbols.every((cell) => cell.symbol === symbol && cell.collected),
        ).toBe(true)
        expect(movement.collectedCount).toBe(Number(size) ** 2)
        expect(feature.anchors).toEqual([[1, 1]])
      }
    },
  )
})
