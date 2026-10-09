import fs from "node:fs"
import path from "node:path"
import { MODES, DESIGN } from "../src/settings"
import {
  BELOW_COST_TARGETS,
  HIT_TARGETS,
  mathBuckets,
  validateBuckets,
} from "../src/math"
import { ModeName } from "../src/types"

console.log("ButchEm: 96% RTP; below-cost targets use the panel Payout < Bet metric")
console.table(
  (Object.keys(MODES) as ModeName[]).map((mode) => {
    const buckets = mathBuckets(mode)
    validateBuckets(mode, buckets)
    const probability = (tier: string) =>
      buckets.filter((b) => b.tier === tier).reduce((s, b) => s + b.probability, 0)
    return {
      mode,
      cost: MODES[mode].cost,
      hit: HIT_TARGETS[mode],
      belowCostTarget: BELOW_COST_TARGETS[mode] ?? "unconstrained",
      normalOneIn: probability("normal") ? Math.round(1 / probability("normal")) : "-",
      superOneIn: probability("super") ? Math.round(1 / probability("super")) : "-",
      hiddenOneIn: probability("hidden") ? Math.round(1 / probability("hidden")) : "-",
    }
  }),
)
const file = path.resolve(__dirname, "../__build__/math-report.json")
if (fs.existsSync(file)) {
  const report = JSON.parse(fs.readFileSync(file, "utf8"))
  console.log(
    "\nMeasured weighted-book results: " + report.wildCombination + " wild multipliers",
  )
  console.table(
    Object.entries(report.modes).map(([mode, value]) => {
      const stats = value as {
        books: number
        rtp: number
        hitRate: number
        breakEvenRate: number
        average: number
      }
      return {
        mode,
        books: stats.books,
        rtp: stats.rtp.toFixed(8),
        hit: stats.hitRate.toFixed(4),
        belowCost: (1 - stats.breakEvenRate).toFixed(4),
        costRecovery: stats.breakEvenRate.toFixed(4),
        mean: stats.average.toFixed(2),
      }
    }),
  )
} else {
  console.log(
    "No audit report. Run pnpm --filter butch-em build, then pnpm --filter butch-em run audit.",
  )
}
console.log("Selected wild policy: " + DESIGN.wildCombination)
