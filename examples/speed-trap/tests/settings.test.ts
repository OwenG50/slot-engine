import { describe, expect, it } from "vitest"
import { pickCarMultiplier } from "../src/feature"
import { PAYTABLE } from "../src/paytable"
import { CAR_MULTIPLIER_WEIGHTS } from "../src/settings"

describe("Speed Trap revised values", () => {
  it.each([
    ["W3", [2, 3, 4, 5]],
    ["W2", [6, 7, 8, 9, 10, 12, 14, 15]],
    ["W1", [20, 25, 30, 35, 40, 50]],
  ] as const)("%s draws only its listed values with strictly decreasing weights", (
    symbol, expected,
  ) => {
    const weights = CAR_MULTIPLIER_WEIGHTS[symbol]
    expect(weights.map((item) => item.value)).toEqual(expected)
    const total = weights.reduce((sum, item) => sum + item.weight, 0)
    let offset = 0
    weights.forEach((item, index) => {
      expect(item.weight).toBeGreaterThan(0)
      if (index) expect(item.weight).toBeLessThan(weights[index - 1].weight)
      expect(pickCarMultiplier(symbol, () => (offset + item.weight / 2) / total))
        .toBe(item.value)
      offset += item.weight
    })
  })

  it("uses the requested three/four/five-symbol paytable", () => {
    expect(PAYTABLE).toEqual({
      H1: { 3: 2.5, 4: 5, 5: 10 },
      H2: { 3: 1, 4: 2, 5: 4 },
      H3: { 3: 0.8, 4: 1.5, 5: 3 },
      H4: { 3: 0.5, 4: 1, 5: 2 },
      L1: { 3: 0.2, 4: 0.6, 5: 1.2 },
      L2: { 3: 0.2, 4: 0.6, 5: 1.2 },
      L3: { 3: 0.1, 4: 0.5, 5: 1 },
      L4: { 3: 0.1, 4: 0.5, 5: 1 },
    })
  })
})
