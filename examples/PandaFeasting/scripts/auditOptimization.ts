import assert from "node:assert/strict"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { BELOW_COST_TARGETS, optimizationBuckets } from "../src/math"
import { DESIGN, FEATURE_RULES, MODES } from "../src/settings"
import { PAYTABLE } from "../src/paytable"
import { MAX_WIN, ModeName } from "../src/types"

const root = path.resolve(__dirname, "../__build__")
const close = (actual: number, expected: number, label: string, tolerance = 1e-8) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual} vs ${expected}`,
  )
const lines = (file: string) =>
  readFileSync(file, "utf8").trim().split(/\r?\n/).filter(Boolean)
const report: Record<string, unknown> = {}

for (const mode of Object.keys(MODES) as ModeName[]) {
  const buckets = optimizationBuckets(mode)
  const criteria = new Map(
    lines(path.join(root, `lookUpTableSegmented_${mode}.csv`)).map((line) => {
      const [id, name] = line.split(",")
      return [Number(id), name]
    }),
  )
  const published = new Map(
    lines(path.join(root, "publish_files", `lookUpTable_${mode}_0.csv`)).map((line) => {
      const [id, weight, payout] = line.split(",").map(Number)
      return [id, { weight, payout: payout / 100 }]
    }),
  )
  const books = lines(path.join(root, `lookUpTable_${mode}.csv`)).map((line) => {
    const [id, , cents] = line.split(",").map(Number)
    const payout = cents / 100
    const weighted = published.get(id)
    assert.ok(weighted, `${mode}: missing published book ${id}`)
    assert.equal(weighted.payout, payout, `${mode}: payout changed for book ${id}`)
    assert.ok(Number.isSafeInteger(weighted.weight) && weighted.weight >= 0)
    const matching = buckets.filter(
      (bucket) =>
        bucket.criteria.includes(criteria.get(id)!) &&
        payout >= bucket.range[0] &&
        payout <= bucket.range[1],
    )
    assert.equal(matching.length, 1, `${mode}/${id}: must match exactly one target`)
    return { id, payout, weight: weighted.weight, target: matching[0].name }
  })
  assert.equal(published.size, books.length, `${mode}: raw/published book count mismatch`)
  const totalWeight = books.reduce((sum, book) => sum + book.weight, 0)
  assert.ok(totalWeight > 0)
  const mean =
    books.reduce((sum, book) => sum + book.weight * book.payout, 0) / totalWeight
  const probability = (accept: (book: (typeof books)[number]) => boolean) =>
    books.filter(accept).reduce((sum, book) => sum + book.weight, 0) / totalWeight
  const hitRate = probability((book) => book.payout > 0)
  const belowCost = probability((book) => book.payout < MODES[mode].cost)
  close(mean / MODES[mode].cost, DESIGN.rtp, `${mode}: RTP`)
  close(hitRate, MODES[mode].hitRate, `${mode}: hit rate`)
  if (BELOW_COST_TARGETS[mode] !== undefined)
    close(belowCost, BELOW_COST_TARGETS[mode]!, `${mode}: below-cost rate`)
  const targets = buckets.map((bucket) => {
    const selected = books.filter((book) => book.target === bucket.name)
    assert.ok(selected.length > 0, `${mode}/${bucket.name}: empty simulation band`)
    const support = [...new Set(selected.map((book) => book.payout))].sort(
      (a, b) => a - b,
    )
    const min = support[0],
      max = support.at(-1)!
    if (min === max) close(bucket.average, min, `${mode}/${bucket.name}: fixed payout`)
    else
      assert.ok(
        bucket.average > min && bucket.average < max,
        `${mode}/${bucket.name}: target mean ${bucket.average} must be inside (${min}, ${max})`,
      )
    const weight = selected.reduce((sum, book) => sum + book.weight, 0)
    assert.ok(weight > 0, `${mode}/${bucket.name}: no published probability`)
    const average =
      selected.reduce((sum, book) => sum + book.weight * book.payout, 0) / weight
    close(weight / totalWeight, bucket.probability, `${mode}/${bucket.name}: probability`)
    // Per-book integer rounding is most visible in very rare, high-pay bands.
    close(average, bucket.average, `${mode}/${bucket.name}: mean`, 0.005)
    return {
      name: bucket.name,
      books: selected.length,
      available: [min, max],
      probability: weight / totalWeight,
      average,
    }
  })
  const summary = {
    mode,
    books: books.length,
    bands: targets.length,
    rtp: mean / MODES[mode].cost,
    hitRate,
    belowCost,
    maxWinProbability: probability((book) => book.payout === MAX_WIN),
  }
  report[mode] = { ...summary, targets }
  console.log(JSON.stringify(summary))
}
writeFileSync(
  path.join(root, "optimization-report.json"),
  JSON.stringify(
    {
      note: "Measured integer-weight published lookup tables, checked against the raw simulation and current targets.",
      paytable: PAYTABLE,
      stageThresholds: FEATURE_RULES.stageThresholds,
      stageMultipliers: FEATURE_RULES.stageMultipliers,
      modes: report,
    },
    null,
    2,
  ),
)
