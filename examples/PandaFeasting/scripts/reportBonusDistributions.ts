import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { createReadStream, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { createInterface } from "node:readline"
import { bonusSpinStats } from "../src/bonusSpinStats"
import { MODES } from "../src/settings"
import { BonusTier, GameEvent, MAX_WIN, ModeName } from "../src/types"

const root = path.resolve(__dirname, "../__build__")
const cuts = [0, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, MAX_WIN, Infinity]
interface Sample {
  payout: number
  weight: number
  stats: ReturnType<typeof bonusSpinStats>
}
async function main() {
  const results = []
  for (const mode of Object.keys(MODES) as ModeName[]) {
    if (mode === "featureSpin") continue
    const bytes = readFileSync(
      path.join(root, "publish_files", `lookUpTable_${mode}_0.csv`),
    )
    const rows = new Map(
      bytes
        .toString("utf8")
        .trim()
        .split(/\r?\n/)
        .map((line) => {
          const [id, weight, cents] = line.split(",").map(Number)
          assert.ok(Number.isSafeInteger(weight) && weight >= 0)
          return [id, { payout: cents / 100, weight }]
        }),
    )
    const totalWeight = [...rows.values()].reduce((sum, row) => sum + row.weight, 0)
    const tiers = new Map<BonusTier, Sample[]>()
    const seen = new Set<number>()
    for await (const line of createInterface({
      input: createReadStream(path.join(root, `books_${mode}.jsonl`)),
      crlfDelay: Infinity,
    })) {
      if (!line.trim()) continue
      const book = JSON.parse(line) as {
        id: number
        payoutMultiplier: number
        events: GameEvent[]
      }
      const row = rows.get(book.id)
      assert.ok(
        row && !seen.has(book.id),
        `${mode}/${book.id}: missing or duplicate lookup/book`,
      )
      seen.add(book.id)
      assert.equal(
        row.payout,
        book.payoutMultiplier / 100,
        `${mode}/${book.id}: stale lookup/book`,
      )
      if (row.weight === 0) continue
      const stats = bonusSpinStats(book.events)
      if (!stats.tier) continue
      const group = tiers.get(stats.tier) ?? []
      group.push({ ...row, stats })
      tiers.set(stats.tier, group)
    }
    assert.equal(seen.size, rows.size, `${mode}: lookup/book count mismatch`)
    for (const tier of ["normal", "super", "hidden"] as const) {
      const samples = tiers.get(tier)
      if (!samples) continue
      samples.sort((a, b) => a.payout - b.payout)
      const mass = samples.reduce((sum, row) => sum + row.weight, 0)
      const sum = (value: (sample: Sample) => number) =>
        samples.reduce((sum, sample) => sum + sample.weight * value(sample), 0)
      const mean = sum((sample) => sample.payout) / mass
      const spins = sum((sample) => sample.stats.spins)
      const quantile = (fraction: number) => {
        let cumulative = 0
        for (const sample of samples) {
          cumulative += sample.weight
          if (cumulative >= fraction * mass) return sample.payout
        }
        return samples.at(-1)!.payout
      }
      results.push({
        mode,
        tier,
        lookupSha256: createHash("sha256").update(bytes).digest("hex"),
        entryProbability: mass / totalWeight,
        modeRtpContribution: ((mass / totalWeight) * mean) / MODES[mode].cost,
        mean,
        standardDeviation: Math.sqrt(sum((sample) => (sample.payout - mean) ** 2) / mass),
        min: quantile(0),
        median: quantile(0.5),
        p90: quantile(0.9),
        p99: quantile(0.99),
        max: quantile(1),
        largestBookProbability:
          Math.max(...samples.map((sample) => sample.weight)) / mass,
        hitRate: sum((sample) => sample.stats.hits) / spins,
        meanSpins: spins / mass,
        ranges: cuts.slice(0, -1).map((lower, i) => {
          const group = samples.filter(
            (sample) => sample.payout >= lower && sample.payout < cuts[i + 1],
          )
          const probability = group.reduce((sum, sample) => sum + sample.weight, 0) / mass
          const expected =
            group.reduce((sum, sample) => sum + sample.weight * sample.payout, 0) / mass
          return {
            range: cuts[i + 1] === Infinity ? `${MAX_WIN}` : `${lower}-${cuts[i + 1]}`,
            books: group.length,
            probability,
            oneIn: probability ? 1 / probability : null,
            rtpShare: expected / mean,
            modeRtpContribution: ((mass / totalWeight) * expected) / MODES[mode].cost,
          }
        }),
        stages: [1, 2, 3, 4, 5, 6].map((stage) => {
          const group = samples.filter((sample) => sample.stats.maxStage === stage)
          const stageMass = group.reduce((sum, sample) => sum + sample.weight, 0)
          return {
            stage,
            reach: sum((sample) => Number(sample.stats.maxStage >= stage)) / mass,
            highest: stageMass / mass,
            averageRoundWin: stageMass
              ? group.reduce((sum, sample) => sum + sample.weight * sample.payout, 0) /
                stageMass
              : null,
          }
        }),
      })
    }
  }
  const report = {
    generatedAt: new Date().toISOString(),
    units: "Base-bet multiples; whole round including trigger",
    rtpUnits:
      "rtpShare is a fraction of bonus expected return; modeRtpContribution is a fraction of the entry mode's paid cost",
    results,
  }
  const outputIndex = process.argv.indexOf("--output")
  if (outputIndex >= 0) {
    assert.ok(process.argv[outputIndex + 1], "--output requires a file path")
    writeFileSync(
      path.resolve(process.argv[outputIndex + 1]),
      JSON.stringify(report, null, 2) + "\n",
    )
  }
  for (const row of results)
    console.log(
      JSON.stringify({
        mode: row.mode,
        tier: row.tier,
        min: row.min,
        mean: row.mean,
        sd: row.standardDeviation,
        median: row.median,
        p90: row.p90,
        p99: row.p99,
      }),
    )
}
void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
