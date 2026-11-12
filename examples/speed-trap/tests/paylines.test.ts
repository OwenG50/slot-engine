import { describe, expect, it } from "vitest"
import { PAYLINES } from "../src/paylines"

describe("speed trap paylines", () => {
  it("uses the approved 14-line layout", () => {
    expect(Object.keys(PAYLINES)).toHaveLength(14)
    expect(PAYLINES[1]).toEqual([0, 0, 0, 0, 0])
    expect(PAYLINES[14]).toEqual([3, 2, 1, 2, 3])
  })
})
