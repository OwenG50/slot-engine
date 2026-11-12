import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { optimize } from "@slot-engine/optimizer"
import { describe, expect, it } from "vitest"
import {
  maxWinProbability,
  optimizationBuckets,
  optimizationTargets,
  simulationBuckets,
  bonusProbability,
} from "../src/math"
import { PAYOUT_BAND_CUTS, REFERENCE_PAYOUT_SHAPES } from "../src/payoutShape"
import { createResultSets } from "../src/resultSets"
import { BONUS_TARGETS, DESIGN, MODES } from "../src/settings"
import { MAX_WIN, ModeName } from "../src/types"

describe("Speed Trap payout shapes", () => {
  for (const mode of Object.keys(MODES) as ModeName[]) {
    it(`${mode} matches reference band hit rates and RTP shares`, () => {
      const bands = optimizationBuckets(mode)
      const reference = REFERENCE_PAYOUT_SHAPES[mode]
      const referenceMass = reference.reduce((sum, [p]) => sum + p, 0)
      const referenceEV = reference.reduce((sum, [p, avg]) => sum + p * avg, 0)
      const nonMaxMass = MODES[mode].hitRate - maxWinProbability(mode)
      const nonMaxEV = DESIGN.rtp * MODES[mode].cost - maxWinProbability(mode) * MAX_WIN
      expect(bands.reduce((sum, band) => sum + band.probability, 0)).toBeCloseTo(1, 12)
      expect(
        bands.reduce((sum, band) => sum + band.probability * band.average, 0),
      ).toBeCloseTo(DESIGN.rtp * MODES[mode].cost, 9)
      reference.forEach(([p, avg], index) => {
        if (!p) return
        const selected = bands.filter((band) =>
          band.range[0] >= PAYOUT_BAND_CUTS[index] &&
          band.range[1] < PAYOUT_BAND_CUTS[index + 1])
        expect(selected.reduce((sum, band) => sum + band.probability, 0) / nonMaxMass)
          .toBeCloseTo(p / referenceMass, 10)
        expect(selected.reduce((sum, band) => sum + band.probability * band.average, 0) / nonMaxEV).toBeCloseTo(
          (p * avg) / referenceEV,
          4,
        )
      })
    })

    it(`${mode} retains forced exact-max simulation coverage`, () => {
      const max = simulationBuckets(mode).find((bucket) => bucket.range[0] === MAX_WIN)!
      expect(max.range).toEqual([MAX_WIN, MAX_WIN])
      expect(
        createResultSets(mode).find((set) => set.criteria === max.name)?.forceMaxWin,
      ).toBe(true)
    })

    it(`${mode} optimizes every band to its probability and average`, async () => {
      const root = mkdtempSync(path.join(tmpdir(), "speed-trap-shape-"))
      try {
        const lookupTable = path.join(root, "lookup.csv")
        const lookupTableSegmented = path.join(root, "segmented.csv")
        const rows: string[] = []
        const segments: string[] = []
        let id = 0
        for (const band of optimizationBuckets(mode)) {
          for (const payout of new Set([
            Math.ceil(band.range[0] * 10) / 10,
            Math.floor(band.range[1] * 10) / 10,
          ])) {
            rows.push(`${++id},1,${Math.round(payout * 100)}`)
            segments.push(`${id},${band.name},${payout},0`)
          }
        }
        writeFileSync(lookupTable, rows.join("\n") + "\n")
        writeFileSync(lookupTableSegmented, segments.join("\n") + "\n")
        const result = await optimize({
          input: { lookupTable, lookupTableSegmented },
          output: { lookupTable: path.join(root, "optimized.csv") },
          targets: optimizationTargets(mode),
          cost: MODES[mode].cost,
          rtp: DESIGN.rtp,
          verbose: false,
        })
        expect(result.rtp).toBeCloseTo(DESIGN.rtp, 8)
        expect(result.criteria.max.avgWin).toBe(MAX_WIN)
        expect(result.criteria.max.probability / maxWinProbability(mode)).toBeCloseTo(
          1,
          7,
        )
        for (const band of optimizationBuckets(mode)) {
          expect(result.criteria[band.name].probability).toBeCloseTo(band.probability, 8)
          expect(result.criteria[band.name].avgWin).toBeCloseTo(band.average, 5)
        }
        const hit = Object.values(result.criteria)
          .filter((band) => band.minWin > 0)
          .reduce((sum, band) => sum + band.probability, 0)
        expect(hit).toBeCloseTo(MODES[mode].hitRate, 8)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })
  }

  it.each(["base", "extraChance", "extraChance2", "featureSpin"] as const)(
    "%s pins every bonus tier frequency after splitting payout bands",
    (mode) => {
      const factor = { base: 1, extraChance: 2, extraChance2: 5, featureSpin: 0.2 }[mode]
      for (const tier of ["normal", "super", "hidden"] as const) {
        const mass = optimizationBuckets(mode).filter((band) => band.tier === tier)
          .reduce((sum, band) => sum + band.probability, 0)
        expect(mass).toBeCloseTo(factor / BONUS_TARGETS[tier].oneIn, 12)
        expect(mass).toBeCloseTo(bonusProbability(mode, tier), 12)
      }
    },
  )

  it("keeps reference exact-max odds", () => {
    expect(1 / maxWinProbability("base")).toBeCloseTo(4_000_000, 6)
    expect(1 / maxWinProbability("extraChance")).toBeCloseTo(3_200_000, 6)
    expect(1 / maxWinProbability("extraChance2")).toBeCloseTo(2_800_000, 6)
    expect(1 / maxWinProbability("featureSpin")).toBeCloseTo(60_000, 6)
    expect(1 / maxWinProbability("bonusFeature")).toBeCloseTo(10525.263157894737, 6)
    expect(1 / maxWinProbability("superBonusFeature")).toBeCloseTo(3593.5251798561144, 6)
    expect(1 / maxWinProbability("hiddenBonusFeature")).toBeCloseTo(1093.4065934065934, 6)
  })
})
