import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { MODES } from "../src/settings"

const root = path.resolve(__dirname, "../__build__")
const bytes = readFileSync(
  path.join(root, "publish_files", "lookUpTable_featureSpin_0.csv"),
)
const samples = bytes
  .toString("utf8")
  .trim()
  .split(/\r?\n/)
  .map((line) => {
    const [id, weight, cents] = line.split(",").map(Number)
    assert.ok(Number.isSafeInteger(id) && Number.isSafeInteger(weight) && weight >= 0)
    return { id, weight, payout: cents / 100 }
  })
  .filter((row) => row.weight > 0)
  .sort((a, b) => a.payout - b.payout)
const mass = samples.reduce((sum, row) => sum + row.weight, 0)
assert.ok(mass > 0)
const sum = (value: (row: (typeof samples)[number]) => number) =>
  samples.reduce((total, row) => total + row.weight * value(row), 0) / mass
const mean = sum((row) => row.payout)
function quantile(fraction: number) {
  let cumulative = 0
  for (const row of samples) {
    cumulative += row.weight
    if (cumulative >= fraction * mass) return row.payout
  }
  return samples.at(-1)!.payout
}
const cuts = [
  0,
  0.01,
  1,
  2,
  5,
  10,
  25,
  50,
  100,
  250,
  500,
  1000,
  2000,
  3000,
  5000,
  10000,
  Infinity,
]
const report = {
  units: "Base-bet multiples; Feature Spin costs 50x",
  lookupSha256: createHash("sha256").update(bytes).digest("hex"),
  price: MODES.featureSpin.cost,
  mean,
  rtp: mean / MODES.featureSpin.cost,
  hitRate: sum((row) => Number(row.payout > 0)),
  belowCost: sum((row) => Number(row.payout < MODES.featureSpin.cost)),
  standardDeviation: Math.sqrt(sum((row) => (row.payout - mean) ** 2)),
  median: quantile(0.5),
  p90: quantile(0.9),
  p95: quantile(0.95),
  p99: quantile(0.99),
  p999: quantile(0.999),
  thresholds: [100, 250, 500, 1000, 2000, 5000, 10000].map((minimum) => ({
    minimum,
    probability: sum((row) => Number(row.payout >= minimum)),
  })),
  ranges: cuts.slice(0, -1).map((lower, i) => {
    const upper = cuts[i + 1]
    const probability = sum((row) => Number(row.payout >= lower && row.payout < upper))
    return {
      range:
        upper === Infinity ? `${lower}` : lower === 0 ? "0 (loss)" : `${lower}-<${upper}`,
      probability,
      oneIn: probability ? 1 / probability : null,
      rtpContribution:
        sum((row) => (row.payout >= lower && row.payout < upper ? row.payout : 0)) /
        MODES.featureSpin.cost,
    }
  }),
}
const outputIndex = process.argv.indexOf("--output")
if (outputIndex >= 0) {
  assert.ok(process.argv[outputIndex + 1], "--output requires a file path")
  writeFileSync(
    path.resolve(process.argv[outputIndex + 1]),
    JSON.stringify(report, null, 2) + "\n",
  )
}
console.log(JSON.stringify(report, null, 2))
