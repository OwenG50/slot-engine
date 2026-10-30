import { describe, expect, it, vi } from "vitest"
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { calibrateBonusHitRates } from "../src/calibrateBonusHitRates"
import * as weights from "../src/bonusSpinWeights"
import { optimizationBuckets } from "../src/math"
import { BASE_GAME_EXPLOSION_ONE_IN, MODES } from "../src/settings"
import type { ModeName, GameEvent } from "../src/types"

// All bonus books deliberately have four wins in five spins. The payout
// constraints remain feasible without imposing a separate bonus hit rate.
describe("sample-limited build calibration", () => {
  it(  "keeps non-full-screen priors neutral, preserves payout constraints, and plans all modes before writing", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "panda-calibration-"))
    const build = path.join(root, "__build__")
    const publish = path.join(build, "publish_files")
    mkdirSync(publish, { recursive: true })
    const originals = new Map<string, string>()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    const payoutFit = vi.spyOn(weights, "fitBonusHitRate")
    try {
      for (const mode of Object.keys(MODES) as ModeName[]) {
        const books: object[] = [],
          rows: string[] = [],
          segmented: string[] = []
        for (const band of optimizationBuckets(mode)) {
          const low = Math.floor(band.average * 100),
            high = Math.ceil(band.average * 100)
          const ratio = high === low ? 0 : (band.average * 100 - low) / (high - low)
          for (const [cents, share] of high === low
            ? [[low, 1]]
            : [
                [low, 1 - ratio],
                [high, ratio],
              ]) {
            const id = rows.length + 1
            const events: GameEvent[] = band.tier
              ? [
                  { type: "freeSpinTrigger", data: { tier: band.tier } },
                  ...Array.from({ length: 5 }, (_, index) => [
                    {
                      type: "reveal",
                      data: {
                        board: Array.from({ length: 5 }, () =>
                          Array.from({ length: 3 }, () => ({ name: "L1" })),
                        ),
                      },
                    },
                    ...(index < 4
                      ? [
                          {
                            type: "winInfo",
                            data: { wins: [{ symbol: "H1", win: 1 }] },
                          },
                        ]
                      : []),
                  ]).flat(),
                  { type: "freeSpinEnd", data: {} },
                ]
              : []
            books.push({ id, payoutMultiplier: cents, events })
            rows.push(`${id},${Math.round(band.probability * share * 2 ** 45)},${cents}`)
            segmented.push(`${id},${band.name}`)
          }
        }
        const filename = path.join(publish, `lookUpTable_${mode}_0.csv`)
        const text = rows.join("\n") + "\n"
        originals.set(filename, text)
        writeFileSync(filename, text)
        writeFileSync(
          path.join(build, `lookUpTableSegmented_${mode}.csv`),
          segmented.join("\n"),
        )
        writeFileSync(
          path.join(build, `books_${mode}.jsonl`),
          books.map((book) => JSON.stringify(book)).join("\n"),
        )
      }
      const lastBooks = path.join(build, "books_hiddenBonusFeature.jsonl")
      const valid = readFileSync(lastBooks, "utf8")
      writeFileSync(
        lastBooks,
        valid.replace('"payoutMultiplier":', '"payoutMultiplier":123456,"unused":'),
      )
      await expect(calibrateBonusHitRates(root)).rejects.toThrow("stale lookup/book")
      for (const [file, text] of originals) expect(readFileSync(file, "utf8")).toBe(text)
      writeFileSync(lastBooks, valid)
      await calibrateBonusHitRates(root)
      const report = JSON.parse(
        readFileSync(path.join(build, "bonus-hit-rate-report.json"), "utf8"),
      )
      expect(report.hitRatePolicy).toBe("unconstrained")
      expect(report.stageReachPolicy).toBe("unconstrained")
      expect(report.stagePayoutPolicy).toBe("unconstrained")
      expect(report).not.toHaveProperty("stagePayoutCurves")
      expect(report).not.toHaveProperty("highSymbolPreference")
      expect(payoutFit).toHaveBeenCalled()
      const explosionTargets = new Set(
        Object.values(BASE_GAME_EXPLOSION_ONE_IN).map((oneIn) => 1 / oneIn),
      )
      for (const [bands, target] of payoutFit.mock.calls) {
        if (target !== undefined) expect(explosionTargets.has(target)).toBe(true)
        for (const band of bands)
          expect(band.samples.every((sample) => sample.weight === 1)).toBe(true)
      }
      expect(report).not.toHaveProperty("targets")
      expect(report).not.toHaveProperty("stageReachTargets")
      for (const result of Object.values(report.modes) as {
        tiers: {
          hitRate: number
        }[]
      }[])
        for (const tier of result.tiers) {
          expect(tier.hitRate).toBeCloseTo(0.8, 10)
          expect(tier).not.toHaveProperty("requestedHitRate")
          expect(tier).not.toHaveProperty("targetReached")
          expect(tier).not.toHaveProperty("supportedRange")
        }
      for (const file of originals.keys()) {
        const mode = path.basename(file).replace("lookUpTable_", "").replace("_0.csv", "")
        const bytes = readFileSync(file)
        const lines = bytes.toString("utf8").trimEnd().split("\n")
        const offsets = readFileSync(path.join(build, `lookUpTable_${mode}.index`))
        expect(offsets.length).toBe(lines.length * 8)
        lines.forEach((line, index) => {
          const start = Number(offsets.readBigUInt64LE(index * 8))
          const end =
            index + 1 < lines.length
              ? Number(offsets.readBigUInt64LE((index + 1) * 8))
              : bytes.length
          expect(bytes.subarray(start, end).toString("utf8").trimEnd()).toBe(line)
        })
      }
      // Fixture books contain no explosions, so only the explosion target warns.
      expect(
        [...new Set(warn.mock.calls.map(([message]) => String(message).split(":")[0]))].sort(),
      ).toEqual(
        Object.keys(BASE_GAME_EXPLOSION_ONE_IN).sort(),
      )
      for (const mode of Object.keys(BASE_GAME_EXPLOSION_ONE_IN))
        expect(report.modes[mode].baseGameExplosion.reached).toBe(false)
    } finally {
      payoutFit.mockRestore()
      warn.mockRestore()
      log.mockRestore()
      // The directory is created by this test directly under the OS temp path.
      rmSync(root, { recursive: true, force: true })
    }
  })
})
