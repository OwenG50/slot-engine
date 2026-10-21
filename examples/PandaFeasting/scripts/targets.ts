import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { MODES, DESIGN } from "../src/settings"
import { BELOW_COST_TARGETS, optimizationBuckets, validateBuckets } from "../src/math"
import { ModeName } from "../src/types"

const distributions = Object.fromEntries(
  (Object.keys(MODES) as ModeName[]).map((mode) => {
    const buckets = optimizationBuckets(mode)
    validateBuckets(mode, buckets)
    return [
      mode,
      {
        cost: MODES[mode].cost,
        rtp: DESIGN.rtp,
        hitRate: MODES[mode].hitRate,
        belowCostTarget: BELOW_COST_TARGETS[mode] ?? null,
        average: MODES[mode].cost * DESIGN.rtp,
        buckets,
      },
    ]
  }),
)
console.log("PandaFeasting optimizer targets (not measured production probabilities)")
console.table(
  Object.entries(distributions).map(([mode, { buckets, ...settings }]) => ({
    mode,
    ...settings,
    bands: buckets.length,
  })),
)
if (process.argv.includes("--bands"))
  for (const [mode, distribution] of Object.entries(distributions)) {
    console.log(mode)
    console.table(
      distribution.buckets.map(({ name, probability, average, range }) => ({
        name,
        probability,
        average,
        min: range[0],
        max: range[1],
      })),
    )
  }
const output = path.resolve(__dirname, "../__build__")
mkdirSync(output, { recursive: true })
writeFileSync(path.join(output, "targets.json"), JSON.stringify(distributions, null, 2))
const coverageFile = path.join(output, "coverage-report.json")
if (existsSync(coverageFile)) {
  const coverage = JSON.parse(readFileSync(coverageFile, "utf8"))
  console.log(
    `Native candidate coverage: ${coverage.passed} bands passed, ${coverage.failed} failed, ${coverage.runsPerBand} rounds per band.`,
  )
}
console.log("Full distributions: examples/PandaFeasting/__build__/targets.json")
