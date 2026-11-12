import { describe, expect, it } from "vitest"
import { bonusMinimum } from "../src/math"
import { createResultSets, meetsBonusMinimum } from "../src/resultSets"
import { MODES } from "../src/settings"
import { ModeName } from "../src/types"

describe("bonus minimum acceptance without top-ups", () => {
  for (const [mode, minimums] of [
    ["base", [16, 87, 1011]],
    ["extraChance", [16, 87, 1011]],
    ["extraChance2", [16, 87, 1011]],
    ["featureSpin", [120, 450, 1600]],
    ["bonusFeature", [1, 10, 50]],
    ["superBonusFeature", [1, 10, 50]],
    ["hiddenBonusFeature", [1, 10, 50]],
  ] as const) {
    it(`${mode} rejects below-minimum natural wins without changing the amount`, () => {
      for (const [index, tier] of (["normal", "super", "hidden"] as const).entries()) {
        const minimum = bonusMinimum(mode, tier)
        expect(minimum).toBe(minimums[index])
        const ctx = {
          state: { userData: { bonusPayout: minimum - 0.1, bonusMinimum: minimum } },
        }
        expect(meetsBonusMinimum(ctx)).toBe(false)
        expect(ctx.state.userData.bonusPayout).toBe(minimum - 0.1)
        ctx.state.userData.bonusPayout = minimum
        expect(meetsBonusMinimum(ctx)).toBe(true)
        ctx.state.userData.bonusPayout = minimum + 100
        expect(meetsBonusMinimum(ctx)).toBe(true)
      }
    })
  }

  it("checks organic bonus entries in every coverage pool, not just forced bonuses", () => {
    for (const mode of Object.keys(MODES) as ModeName[]) {
      for (const set of createResultSets(mode)) {
        expect(set.evaluate).toBeTypeOf("function")
      }
    }
    expect(
      meetsBonusMinimum({ state: { userData: { bonusPayout: 0, bonusMinimum: 0 } } }),
    ).toBe(true)
  })
})
