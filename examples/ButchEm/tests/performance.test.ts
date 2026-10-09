import { describe, expect, it } from "vitest"
import { canRepositionWilds, movementPaths } from "../src/collection"
import { Board, PAYING_SYMBOLS, Position, SymbolId, positionKey } from "../src/types"
import { footprint, footprintMask, footprintsOverlap, validAnchors } from "../src/wilds"
import { BoardProfile, reelWeights } from "../src/reels"
import { referenceMovementPaths, referenceRepositioningPaths } from "./referenceMovement"

describe("ButchEm cached movement equivalence", () => {
  it.each(["1", "2"] as const)(
    "preserves every ordered size-%s route at every anchor, blocker and distance limit",
    (size) => {
      const anchors = validAnchors(size)
      for (const from of anchors) {
        const layouts: Position[][] = [
          [],
          ...anchors.map((anchor) => [anchor]),
          [anchors[0], anchors.at(-1)!],
        ]
        for (const blockers of layouts)
          for (let maxMoves = 1; maxMoves <= 8; maxMoves++)
            expect(movementPaths(from, blockers, size, maxMoves)).toEqual(
              referenceMovementPaths(from, blockers, size, maxMoves),
            )
      }
    },
    30000,
  )

  it("returns independent mutable public paths without poisoning cached geometry", () => {
    const from: Position = [1, 2]
    const blockers: Position[] = [[3, 4]]
    const expected = referenceMovementPaths(from, blockers, "2")
    const first = movementPaths(from, blockers, "2")
    first[0][0][0] = 99
    first[0].pop()
    first.pop()
    expect(movementPaths(from, blockers, "2")).toEqual(expected)
    expect(from).toEqual([1, 2])
    expect(blockers).toEqual([[3, 4]])
  })

  it.each(["1", "2"] as const)(
    "preserves joint size-%s reveal feasibility on mixed boards",
    (size) => {
      let seed = 246813579
      const next = () => (seed = (seed * 1664525 + 1013904223) >>> 0)
      const symbols: SymbolId[] = [
        "L1",
        "L2",
        "L3",
        "L4",
        "W",
        "H1",
        "H2",
        "H3",
        "H4",
        "S",
      ]
      const valid = validAnchors(size)
      for (let sample = 0; sample < 160; sample++) {
        const board: Board = Array.from({ length: 5 }, () =>
          Array.from({ length: 5 }, () => symbols[next() % symbols.length]),
        )
        const first = valid[next() % valid.length]
        const available = valid.filter((other) => !footprintsOverlap(first, other, size))
        const anchors =
          sample % 2 ? [first, available[next() % available.length]] : [first]
        const before = structuredClone(anchors)
        const maxMoves = 1 + (sample % 8)
        expect(canRepositionWilds(board, anchors, size, maxMoves)).toBe(
          referenceRepositioningPaths(board, anchors, size, maxMoves) !== undefined,
        )
        expect(anchors).toEqual(before)
      }
    },
  )

  it("preserves reel weights and returns independent weight maps", () => {
    for (const profile of ["standard", "dense", "tail", "maxwin"] as BoardProfile[])
      for (const inFeature of [false, true]) {
        const prefix = inFeature ? "bonus" : "base"
        const expected =
          profile === "standard"
            ? { [prefix + "_standard"]: 1 }
            : Object.fromEntries(
                PAYING_SYMBOLS.map((id) => [
                  `${prefix}_${profile === "maxwin" ? "maxwin_mixed" : profile}_${id}`,
                  1,
                ]),
              )
        const first = reelWeights(profile, inFeature)
        expect(first).toEqual(expected)
        first[Object.keys(first)[0]] = 999
        first.extra = 123
        expect(reelWeights(profile, inFeature)).toEqual(expected)
      }
  })

  it.each(["1", "2"] as const)(
    "matches every size-%s footprint with a cell mask",
    (size) => {
      for (const anchor of validAnchors(size))
        expect(footprintMask(anchor, size)).toBe(
          footprint(anchor, size).reduce(
            (mask, cell) => mask | (1 << positionKey(cell)),
            0,
          ),
        )
      for (const anchor of [
        [-1, 1],
        [5, 1],
        [1, -1],
        [1, 5],
        [0.5, 1],
        [1, NaN],
      ] as Position[])
        expect(() => footprintMask(anchor, size)).toThrow("Invalid")
      if (size === "2") {
        expect(() => footprintMask([4, 1], size)).toThrow("Invalid")
        expect(() => footprintMask([1, 0], size)).toThrow("Invalid")
      }
    },
  )
})
