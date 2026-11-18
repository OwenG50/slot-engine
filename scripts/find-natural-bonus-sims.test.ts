import { afterEach, describe, expect, it } from "vitest"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { execFileSync } from "child_process"
import { findNaturalBonusSamples } from "./find-natural-bonus-sims"

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true })
})

function createBuild(ordinaryPerLevel = 11) {
  const gameDir = fs.mkdtempSync(path.join(os.tmpdir(), "natural-bonus-samples-"))
  directories.push(gameDir)
  const buildDir = path.join(gameDir, "__build__")
  fs.mkdirSync(buildDir)
  const publishDir = path.join(buildDir, "publish_files")
  fs.mkdirSync(publishDir)

  const books: Array<{
    id: number
    payoutMultiplier: number
    events: Array<Record<string, unknown>>
  }> = []
  for (const [tierIndex, tier] of (["normal", "super", "hidden"] as const).entries()) {
    const scatters = tierIndex + 3
    for (let index = 0; index < 11; index++) {
      const id = books.length + 1
      const payoutMultiplier = (10 + tierIndex * 100 + index * 10) * 100
      books.push({
        id,
        payoutMultiplier,
        events: [
          {
            type: "reveal",
            data: {
              board: Array.from({ length: 5 }, (_, reel) =>
                Array.from({ length: 3 }, (_, row) => ({
                  name: row === 0 && reel < scatters ? "S" : "L1",
                })),
              ),
            },
          },
          { type: "freeSpinTrigger", data: { tier } },
        ],
      })
    }
  }

  const mismatchedTierId = books.length + 1
  books.push({
    id: mismatchedTierId,
    payoutMultiplier: 5000,
    events: [
      {
        type: "reveal",
        data: {
          board: Array.from({ length: 5 }, (_, reel) =>
            Array.from({ length: 3 }, (_, row) => ({
              name: row === 0 && reel < 4 ? "S" : "L1",
            })),
          ),
        },
      },
      { type: "freeSpinTrigger", data: { tier: "normal" } },
    ],
  })
  const noTriggerId = books.length + 1
  books.push({
    id: noTriggerId,
    payoutMultiplier: 6000,
    events: [{ type: "reveal", data: { board: [] } }],
  })
  const zeroWeightId = books.length + 1
  books.push({
    id: zeroWeightId,
    payoutMultiplier: 7000,
    events: [
      {
        type: "reveal",
        data: {
          board: Array.from({ length: 5 }, (_, reel) =>
            Array.from({ length: 3 }, (_, row) => ({
              name: row === 0 && reel < 5 ? "S" : "L1",
            })),
          ),
        },
      },
      { type: "freeSpinTrigger", data: { tier: "hidden" } },
    ],
  })

  for (let index = 0; index < 11; index++) {
    books.push({
      id: books.length + 1,
      payoutMultiplier: 100000,
      events: [{ type: "reveal", data: { board: [] } }],
    })
  }
  const zeroWeightMaxId = books.length
  for (const payout of [0, 1, 25, 50, 100, 200, 350]) {
    for (let index = 0; index < ordinaryPerLevel; index++) {
      books.push({
        id: books.length + 1,
        payoutMultiplier: payout === 0 ? 0 : payout * 100 + index,
        events: [{ type: "reveal", data: { board: [] } }],
      })
    }
  }
  const zeroWeightOrdinaryId = books.length + 1
  books.push({
    id: zeroWeightOrdinaryId,
    payoutMultiplier: 90000,
    events: [{ type: "reveal", data: { board: [] } }],
  })
  for (const book of books) {
    const payout = book.payoutMultiplier / 100
    const thresholds = [0, 0.01, 25, 50, 100, 200, 350, 1000]
    const winLevel = thresholds.filter((threshold) => payout >= threshold).length - 1
    if (payout > 0)
      book.events.push({ type: "setWin", data: { amount: payout, winLevel } })
  }
  fs.writeFileSync(
    path.join(buildDir, "frontend_config.json"),
    JSON.stringify({ maxWin: 1000 }),
  )

  fs.writeFileSync(
    path.join(buildDir, "books_base.jsonl"),
    books.map((book) => JSON.stringify(book)).join("\n") + "\n",
  )
  fs.writeFileSync(
    path.join(publishDir, "lookUpTable_base_0.csv"),
    books
      .map(
        (book) =>
          `${book.id},${book.id === zeroWeightId || book.id === zeroWeightOrdinaryId || book.id === zeroWeightMaxId ? 0 : 1},${book.payoutMultiplier}`,
      )
      .join("\n") + "\n",
  )
  return buildDir
}

function addFeatureSpinMode(buildDir: string, withBonuses: boolean) {
  const books = fs
    .readFileSync(path.join(buildDir, "books_base.jsonl"), "utf8")
    .trim()
    .split("\n")
    .filter((line) => {
      const book: { events: Array<{ type: string }> } = JSON.parse(line)
      return withBonuses || !book.events.some((event) => event.type === "freeSpinTrigger")
    })
  const ids = new Set(books.map((line) => (JSON.parse(line) as { id: number }).id))
  const lookup = fs
    .readFileSync(path.join(buildDir, "publish_files", "lookUpTable_base_0.csv"), "utf8")
    .trim()
    .split("\n")
    .filter((line) => ids.has(Number(line.split(",")[0])))
  fs.writeFileSync(
    path.join(buildDir, "books_featureSpin.jsonl"),
    books.join("\n") + "\n",
  )
  fs.writeFileSync(
    path.join(buildDir, "publish_files", "lookUpTable_featureSpin_0.csv"),
    lookup.join("\n") + "\n",
  )
}

describe("natural bonus sample finder", () => {
  it.each([false, true])(
    "writes CLI samples to the game sample_sims folder or a custom output (custom: %s)",
    (customOutput) => {
      const buildDir = createBuild()
      const outputPath = path.join(
        path.dirname(buildDir),
        customOutput ? "custom" : "sample_sims",
        "natural-bonus-samples.csv",
      )
      execFileSync(process.execPath, [
        require.resolve("tsx/cli"),
        path.join(__dirname, "find-natural-bonus-sims.ts"),
        "--build-dir",
        buildDir,
        "--mode",
        "base",
        ...(customOutput ? ["--output", outputPath] : []),
      ])

      const lines = fs.readFileSync(outputPath, "utf8").trim().split("\n")
      expect(lines).toHaveLength(111)
      expect(lines.filter((line) => line.startsWith("base,maxwin,,"))).toHaveLength(10)
      expect(fs.existsSync(path.join(buildDir, "natural-bonus-samples.csv"))).toBe(false)
    },
  )

  it("selects payout-varied natural triggers and ignores mismatched or zero-weight books", async () => {
    const samples = await findNaturalBonusSamples(createBuild(), "base")
    expect(samples).toHaveLength(110)
    const maxWins = samples.filter((sample) => sample.tier === "maxwin")
    expect(maxWins).toHaveLength(10)
    expect(new Set(maxWins.map((sample) => sample.bookId)).size).toBe(10)
    expect(maxWins.every((sample) => sample.payout === 1000)).toBe(true)
    expect(maxWins.every((sample) => sample.publishedWeight > 0)).toBe(true)

    for (const tier of ["normal", "super", "hidden"] as const) {
      const tierSamples = samples.filter((sample) => sample.tier === tier)
      expect(tierSamples).toHaveLength(10)
      expect(new Set(tierSamples.map((sample) => sample.bookId)).size).toBe(10)
      expect(new Set(tierSamples.map((sample) => sample.payout)).size).toBe(10)
      expect(
        tierSamples.every(
          (sample) =>
            sample.triggerScatters === (tier === "normal" ? 3 : tier === "super" ? 4 : 5),
        ),
      ).toBe(true)
    }
  })

  it("covers every ordinary win level without mixing in bonus outcomes or zero-weight books", async () => {
    const samples = await findNaturalBonusSamples(createBuild(), "base")
    const ordinary = samples.filter((sample) => sample.tier === "ordinary")
    expect(ordinary).toHaveLength(70)
    expect(new Set(ordinary.map((sample) => sample.bookId)).size).toBe(70)
    expect(ordinary.every((sample) => sample.publishedWeight > 0)).toBe(true)
    expect(ordinary.some((sample) => sample.payout === 900)).toBe(false)
    for (let level = 0; level <= 6; level++) {
      const levelSamples = ordinary.filter((sample) => sample.winLevel === level)
      expect(levelSamples).toHaveLength(10)
      expect(new Set(levelSamples.map((sample) => sample.payout)).size).toBe(
        level ? 10 : 1,
      )
      expect(levelSamples.every((sample) => sample.triggerScatters === 0)).toBe(true)
    }
  })

  it.each([false, true])(
    "supports FeatureSpin ordinary levels with optional natural bonuses (bonuses: %s)",
    async (withBonuses) => {
      const buildDir = createBuild()
      addFeatureSpinMode(buildDir, withBonuses)
      const samples = await findNaturalBonusSamples(buildDir, "featureSpin")
      expect(samples.every((sample) => sample.mode === "featureSpin")).toBe(true)
      expect(samples.filter((sample) => sample.tier === "ordinary")).toHaveLength(70)
      expect(samples.filter((sample) => sample.tier === "maxwin")).toHaveLength(10)
      for (const tier of ["normal", "super", "hidden"])
        expect(samples.filter((sample) => sample.tier === tier)).toHaveLength(
          withBonuses ? 10 : 0,
        )
    },
  )

  it("includes FeatureSpin by default and labels win levels in the CSV", () => {
    const buildDir = createBuild()
    addFeatureSpinMode(buildDir, false)
    execFileSync(process.execPath, [
      require.resolve("tsx/cli"),
      path.join(__dirname, "find-natural-bonus-sims.ts"),
      "--build-dir",
      buildDir,
    ])
    const csv = fs
      .readFileSync(
        path.join(path.dirname(buildDir), "sample_sims", "natural-bonus-samples.csv"),
        "utf8",
      )
      .trim()
      .split("\n")
    expect(csv[0].split(",").at(-1)).toBe("winLevel")
    expect(csv.filter((line) => line.startsWith("featureSpin,"))).toHaveLength(80)
  })

  it("includes all available examples when an ordinary win level has fewer than requested", async () => {
    const actual = await findNaturalBonusSamples(createBuild(1), "base")
    const remaining = actual.filter(
      (sample) => sample.tier === "ordinary" && sample.winLevel === 3,
    )
    expect(remaining.map((sample) => sample.payout).sort((a, b) => a - b)).toEqual([
      50, 60,
    ])
  })

  it("fails rather than substituting near-max payouts when too few cap wins exist", async () => {
    await expect(findNaturalBonusSamples(createBuild(), "base", 11)).rejects.toThrow(
      "maxwin: Found 10 positive-weight examples at the configured 1000x cap; need 11",
    )
  })

  it("requires a valid configured win cap", async () => {
    const buildDir = createBuild()
    fs.writeFileSync(path.join(buildDir, "frontend_config.json"), "{}")
    await expect(findNaturalBonusSamples(buildDir, "base")).rejects.toThrow(
      "Missing or invalid maxWin",
    )
  })

  it("rejects purchased bonus modes", async () => {
    await expect(findNaturalBonusSamples(createBuild(), "bonusFeature")).rejects.toThrow(
      "not a natural-entry mode",
    )
  })
})
