import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { bonusAverage, bonusMinimum } from "../src/math"
import { BONUS_TARGETS, DESIGN, MODES } from "../src/settings"
import { BonusTier, ModeName } from "../src/types"

// These are reporting bands, independent of the optimizer's internal groups.
// Frequencies here are conditional on entering the named bonus tier.
const bands = [
  [0, 25],
  [25, 50],
  [50, 100],
  [100, 200],
  [200, 250],
  [250, 500],
  [500, 1000],
  [1000, 2000],
  [2000, 3000],
  [3000, 5000],
  [5000, 10000],
  [10000, Infinity],
] as const
const buys: Record<BonusTier, ModeName> = {
  normal: "bonusFeature",
  super: "superBonusFeature",
  hidden: "hiddenBonusFeature",
}
const root = path.resolve(__dirname, "../__build__")
const baselineArg = process.argv.indexOf("--weights-dir")
const weightsDir =
  baselineArg < 0
    ? path.join(root, "publish_files")
    : path.resolve(process.argv[baselineArg + 1])
const check = process.argv.includes("--check")
type Row = { x: number; bonus: number; weight: number; criteria: string }
const byMode = new Map<ModeName, Row[]>()
for (const mode of Object.keys(MODES) as ModeName[]) {
  if (mode === "featureSpin") continue
  const segmented = new Map(
    fs
      .readFileSync(path.join(root, `lookUpTableSegmented_${mode}.csv`), "utf8")
      .trim()
      .split(/\r?\n/)
      .map((line) => {
        const [id, criteria, , bonus] = line.split(",")
        return [+id, { criteria, bonus: +bonus }] as const
      }),
  )
  const rows = fs
    .readFileSync(path.join(weightsDir, `lookUpTable_${mode}_0.csv`), "utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const [id, weight, cents] = line.split(",").map(Number)
      const segment = segmented.get(id)
      assert.ok(segment, `${mode}: missing book ${id}`)
      return { x: cents / 100, weight, ...segment }
    })
  byMode.set(mode, rows)
}
const sumWeight = (rows: Row[]) => rows.reduce((sum, row) => sum + row.weight, 0)
const stats = (mode: ModeName, tier: BonusTier) => {
  const all = byMode.get(mode)!
  const rows = all
    .filter((row) => row.criteria.startsWith(tier + "_") && row.weight > 0)
    .sort((a, b) => a.x - b.x)
  const mass = sumWeight(rows)
  let cumulative = 0
  const median = rows.find((row) => (cumulative += row.weight) >= mass / 2)!.x
  return {
    mean: rows.reduce((sum, row) => sum + row.weight * row.x, 0) / mass,
    median,
    // The existing guarantee and freeSpinEnd amount include the trigger win.
    // Native segmented.bonus excludes it and is not the guaranteed round total.
    minimumBonus: Math.min(...rows.map((row) => row.x)),
    entryOneIn: sumWeight(all) / mass,
    bands: bands.map(([min, max]) => {
      const probability =
        sumWeight(rows.filter((row) => row.x >= min && row.x < max)) / mass
      return {
        min,
        max: Number.isFinite(max) ? max : null,
        probability,
        oneIn: probability > 0 ? 1 / probability : null,
      }
    }),
  }
}
const report = {} as Record<BonusTier, Record<string, ReturnType<typeof stats>>>
for (const tier of ["normal", "super", "hidden"] as const) {
  const modes = [buys[tier], "base", "extraChance", "extraChance2"] as const
  const values = Object.fromEntries(modes.map((mode) => [mode, stats(mode, tier)]))
  report[tier] = values
  console.log(`\n${tier}: mean / median / minimum bonus; entries are per mode play`)
  console.table(
    modes.map((mode) => ({
      mode,
      mean: values[mode].mean.toFixed(4),
      median: values[mode].median,
      minimum: values[mode].minimumBonus,
      entryOneIn: values[mode].entryOneIn.toFixed(2),
    })),
  )
  console.log("Payout bands: conditional probability and 1-in-N bonus entries")
  console.table(
    bands.map(([min, max], index) => ({
      band: max === Infinity ? `${min}x+` : `${min}-<${max}x`,
      ...Object.fromEntries(
        modes.map((mode) => {
          const band = values[mode].bands[index]
          return [
            mode,
            `${(100 * band.probability).toFixed(5)}% / ${band.oneIn?.toFixed(2) ?? "never"}`,
          ]
        }),
      ),
    })),
  )
  if (check)
    for (const mode of modes) {
      const actual = values[mode]
      const expectedMean = MODES[mode].boughtTier
        ? MODES[mode].cost * DESIGN.rtp
        : bonusAverage(mode, tier)
      assert.ok(Math.abs(actual.mean - expectedMean) < 0.001, `${mode}/${tier}: mean`)
      assert.ok(
        actual.minimumBonus >= bonusMinimum(mode, tier),
        `${mode}/${tier}: minimum`,
      )
      const entry = MODES[mode].boughtTier
        ? 1
        : BONUS_TARGETS[tier].oneIn / MODES[mode].bonusFrequencyMultiplier
      assert.ok(
        Math.abs(actual.entryOneIn / entry - 1) < 1e-6,
        `${mode}/${tier}: entry rate`,
      )
      actual.bands.forEach((band, index) =>
        assert.ok(
          Math.abs(band.probability - values[buys[tier]].bands[index].probability) < 1e-7,
          `${mode}/${tier}/${band.min}x: probability differs from buy`,
        ),
      )
    }
}
const filename = check ? "bonus-comparison.json" : "bonus-comparison-preview.json"
fs.writeFileSync(path.join(root, filename), JSON.stringify(report, null, 2) + "\n")
if (check) {
  const lines = [
    "ButchEm conditional bonus comparison",
    "",
    "Payouts are base-bet multiples and include the triggering spin.",
    "Entry odds are per paid mode play. Payout-band odds are conditional on entering that bonus tier.",
    "Each band includes its lower bound and excludes its upper bound.",
    "Extra Chance means remain slightly below base/buys; reporting-band probabilities are shared.",
    "",
  ]
  for (const tier of ["normal", "super", "hidden"] as const) {
    const modes = [buys[tier], "base", "extraChance", "extraChance2"]
    lines.push(
      tier.toUpperCase(),
      "",
      "Mode | Weighted mean | Median | Minimum round | Entry 1 in",
      "--- | ---: | ---: | ---: | ---:",
    )
    for (const mode of modes) {
      const s = report[tier][mode]
      lines.push(
        `${mode} | ${s.mean.toFixed(4)} | ${s.median.toFixed(2)} | ${s.minimumBonus.toFixed(2)} | ${s.entryOneIn.toFixed(2)}`,
      )
    }
    lines.push("", "Band | " + modes.join(" | "), "--- | ---: | ---: | ---: | ---:")
    bands.forEach(([min, max], index) =>
      lines.push(
        (max === Infinity ? `${min}x+ | ` : `${min}-<${max}x | `) +
          modes
            .map((mode) => {
              const band = report[tier][mode].bands[index]
              return `${(100 * band.probability).toFixed(5)}% (${band.oneIn === null ? "never" : "1 in " + band.oneIn.toFixed(2)})`
            })
            .join(" | "),
      ),
    )
    lines.push("")
  }
  lines.push(
    "PASS: target means, minimums, entry rates and all reporting-band probabilities checked.",
    "",
  )
  const reportPath = path.resolve(
    __dirname,
    "../../../Math Mode Analysis/ButchEm - bonus comparison.txt",
  )
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, lines.join("\n"))
}
console.log(
  check
    ? "PASS: means, minimums, entry rates and every reporting band aligned."
    : "Comparison only; use --check to enforce alignment.",
)
