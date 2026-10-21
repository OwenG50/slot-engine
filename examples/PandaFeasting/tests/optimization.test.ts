import { describe, expect, it } from "vitest"
import { optimize } from "@slot-engine/optimizer"
import { existsSync, mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  BELOW_COST_TARGETS,
  mathBuckets,
  optimizationBuckets,
  optimizationTargets,
} from "../src/math"
import { DESIGN, MODES } from "../src/settings"
import { createResultSets } from "../src/resultSets"
import { ModeName } from "../src/types"

function support(mode: ModeName, name: string, range: [number, number]): number[] {
  if (name.endsWith("_under_025")) return [0.1, 0.2]
  if (mode === "base" && name === "baseWin_200_plus") return [209, 292]
  if (mode === "extraChance" && name === "baseWin_05_1") return [0.5, 0.7]
  if (mode === "extraChance" && name === "baseWin_15_2") return [1.5, 1.8]
  if (mode === "extraChance2" && name === "super_250_median") return [251.3, 252]
  if (mode === "featureSpin" && name === "feature_4_3K_5K") return [3293, 4990]
  return [...new Set(range)]
}

describe("native optimizer with discrete and sparse payout supports", () => {
  for (const mode of Object.keys(MODES) as ModeName[]) {
    it.each(["legacy", "band"] as const)(
      `${mode} optimizes %s criteria at 96% RTP`,
      async (format) => {
        const root = mkdtempSync(path.join(tmpdir(), "panda-optimization-"))
        const lookupTable = path.join(root, "lookup.csv")
        const lookupTableSegmented = path.join(root, "segmented.csv")
        const output = path.join(root, "optimized.csv")
        const buckets = optimizationBuckets(mode)
        const lookup: string[] = []
        const segmented: string[] = []
        for (const bucket of buckets)
          for (const payout of support(mode, bucket.name, bucket.range)) {
            const id = lookup.length + 1
            lookup.push(`${id},1,${Math.round(payout * 100)}`)
            segmented.push(
              `${id},${format === "band" ? bucket.name : bucket.criteria[0]},${payout},0`,
            )
          }
        try {
          writeFileSync(lookupTable, lookup.join("\n"))
          writeFileSync(lookupTableSegmented, segmented.join("\n"))
          const result = await optimize({
            input: { lookupTable, lookupTableSegmented },
            output: { lookupTable: output },
            targets: optimizationTargets(mode),
            cost: MODES[mode].cost,
            rtp: DESIGN.rtp,
            verbose: false,
          })
          expect(result.rtp).toBeCloseTo(0.96, 8)
          const groups = Object.values(result.criteria)
          expect(
            groups
              .filter((group) => group.minWin > 0)
              .reduce((sum, group) => sum + group.probability, 0),
          ).toBeCloseTo(MODES[mode].hitRate, 8)
          const below = BELOW_COST_TARGETS[mode]
          if (below !== undefined)
            expect(
              groups
                .filter((group) => group.maxWin < MODES[mode].cost)
                .reduce((sum, group) => sum + group.probability, 0),
            ).toBeCloseTo(below, 8)
          for (const bucket of buckets) {
            expect(result.criteria[bucket.name].probability).toBeCloseTo(
              bucket.probability,
              8,
            )
            // Integer book weights introduce small rounding errors in rare
            // high-payout groups; keep the tolerance well below one cent.
            expect(result.criteria[bucket.name].avgWin).toBeCloseTo(bucket.average, 3)
          }
          if (mode === "featureSpin")
            for (const family of [1, 2, 3, 4]) {
              const actual = Object.entries(result.criteria).filter(([name]) =>
                name.startsWith(`feature_${family}_`),
              )
              const expected = mathBuckets(mode).filter(
                (bucket) => bucket.coverageBand === family,
              )
              expect(
                actual.reduce(
                  (sum, [, group]) => sum + group.probability * group.avgWin,
                  0,
                ),
              ).toBeCloseTo(
                expected.reduce(
                  (sum, bucket) => sum + bucket.probability * bucket.average,
                  0,
                ),
                8,
              )
            }
        } finally {
          for (const file of [lookupTable, lookupTableSegmented, output])
            if (existsSync(file)) unlinkSync(file)
          rmdirSync(root)
        }
      },
    )
    it(`${mode} allocates simulation coverage to every final payout band`, () => {
      const buckets = optimizationBuckets(mode)
      const sets = createResultSets(mode)
      expect(sets).toHaveLength(buckets.length)
      expect(sets.reduce((sum, set) => sum + set.quota, 0)).toBeCloseTo(1, 12)
      for (const bucket of buckets) {
        const set = sets.find((set) => set.criteria === bucket.name)!
        expect(set.multiplier).toEqual(bucket.range)
        expect(bucket.criteria).toContain(set.criteria)
        expect(set.quota).toBeGreaterThan(0)
      }
    })
  }
})
