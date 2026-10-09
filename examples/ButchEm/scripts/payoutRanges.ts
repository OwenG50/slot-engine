import fs from "node:fs"
import path from "node:path"
import { MODES } from "../src/settings"
import { ModeName } from "../src/types"

interface Range {
  label: string
  min: number
  max: number
  includeMin?: boolean
}

const ranges: Range[] = [
  { label: "0x", min: 0, max: 0, includeMin: true },
  { label: ">0x - <0.25x", min: 0, max: 0.25 },
  { label: "0.25x - <0.5x", min: 0.25, max: 0.5, includeMin: true },
  { label: "0.5x - <1x", min: 0.5, max: 1, includeMin: true },
  { label: "1x - <2x", min: 1, max: 2, includeMin: true },
  { label: "2x - <5x", min: 2, max: 5, includeMin: true },
  { label: "5x - <10x", min: 5, max: 10, includeMin: true },
  { label: "10x - <25x", min: 10, max: 25, includeMin: true },
  { label: "25x - <50x", min: 25, max: 50, includeMin: true },
  { label: "50x - <100x", min: 50, max: 100, includeMin: true },
  { label: "100x - <250x", min: 100, max: 250, includeMin: true },
  { label: "250x - <500x", min: 250, max: 500, includeMin: true },
  { label: "500x - <1Kx", min: 500, max: 1000, includeMin: true },
  { label: "1Kx - <3Kx", min: 1000, max: 3000, includeMin: true },
  { label: "3Kx - <5Kx", min: 3000, max: 5000, includeMin: true },
  { label: "5Kx - <10Kx", min: 5000, max: 10000, includeMin: true },
  { label: "10Kx+", min: 10000, max: Infinity, includeMin: true },
]

const args = process.argv.slice(2)
const raw = args.includes("--raw")
const mode = (args.find((arg) => !arg.startsWith("--")) ?? "base") as ModeName
if (!(mode in MODES)) {
  throw new Error(
    `Unknown mode "${mode}". Choose one of: ${Object.keys(MODES).join(", ")}`,
  )
}

const root = path.resolve(__dirname, "..")
const input = path.join(root, "__build__", "publish_files", `lookUpTable_${mode}_0.csv`)
if (!fs.existsSync(input)) {
  throw new Error(`Missing ${input}. Run pnpm --filter butch-em build first.`)
}

const cost = MODES[mode].cost
const rows = fs
  .readFileSync(input, "utf8")
  .trim()
  .split(/\r?\n/)
  .map((line) => {
    const [id, weight, payoutCents] = line.split(",").map(Number)
    const rawPayout = payoutCents / 100
    return { id, weight, rawPayout, payout: raw ? rawPayout : rawPayout / cost }
  })
const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0)

const report = ranges.map((range) => {
  const matching = rows.filter(
    (row) =>
      (range.includeMin ? row.payout >= range.min : row.payout > range.min) &&
      row.payout < range.max + (range.max === 0 ? Number.EPSILON : 0),
  )
  const weight = matching.reduce((sum, row) => sum + row.weight, 0)
  const probability = weight / totalWeight
  return {
    range: range.label,
    probability,
    odds: probability ? 1 / probability : Infinity,
    rtp:
      matching.reduce((sum, row) => sum + row.weight * row.rawPayout, 0) /
      totalWeight /
      cost,
    candidates: matching.length,
    payoutValues: new Set(matching.map((row) => row.payout)).size,
  }
})

const percent = (value: number) => (value * 100).toFixed(value >= 0.001 ? 4 : 6) + "%"
const odds = (value: number) => {
  if (!Number.isFinite(value)) return "-"
  if (value >= 1_000_000) return "1 in " + (value / 1_000_000).toFixed(2) + "M"
  if (value >= 10_000) return "1 in " + (value / 1000).toFixed(1) + "K"
  return "1 in " + value.toFixed(value < 10 ? 2 : value < 100 ? 1 : 0)
}

const units = raw
  ? "base-stake multiples, matching Panel"
  : `multiples of the ${cost}x mode cost`
console.log(`\n${mode} payout ranges (${units})\n`)
console.table(
  report.map((row) => ({
    Range: row.range,
    Probability: percent(row.probability),
    Odds: odds(row.odds),
    "RTP share": percent(row.rtp),
    Candidates: row.candidates,
    "Payout values": row.payoutValues,
  })),
)

const markdown = [
  `# ${mode} payout ranges`,
  "",
  raw
    ? `Payouts use base-stake multiples, matching Panel. The mode costs ${cost}x.`
    : `Payouts are normalized by the ${cost}x mode cost.`,
  "Probabilities use optimized player weights.",
  "",
  "| Range | Probability | Odds | RTP share | Candidate books | Distinct payouts |",
  "| --- | ---: | ---: | ---: | ---: | ---: |",
  ...report.map(
    (row) =>
      `| ${row.range} | ${percent(row.probability)} | ${odds(row.odds)} | ${percent(row.rtp)} | ${row.candidates.toLocaleString("en-US")} | ${row.payoutValues.toLocaleString("en-US")} |`,
  ),
  "",
].join("\n")

const csv = [
  "range,probability,one_in,rtp_share,candidate_books,distinct_payouts",
  ...report.map((row) =>
    [
      row.range,
      row.probability,
      Number.isFinite(row.odds) ? row.odds : "",
      row.rtp,
      row.candidates,
      row.payoutValues,
    ]
      .map((value) => `"${value}"`)
      .join(","),
  ),
  "",
].join("\n")

const suffix = raw ? "-raw" : ""
const markdownPath = path.join(root, "__build__", `payout-ranges-${mode}${suffix}.md`)
const csvPath = path.join(root, "__build__", `payout-ranges-${mode}${suffix}.csv`)
fs.writeFileSync(markdownPath, markdown)
fs.writeFileSync(csvPath, csv)
console.log(`Wrote ${markdownPath}`)
console.log(`Wrote ${csvPath}`)
