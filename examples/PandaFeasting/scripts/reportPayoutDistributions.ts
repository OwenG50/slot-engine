import assert from "node:assert/strict"
import { createReadStream, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { createInterface } from "node:readline"
import { MODES } from "../src/settings"
import { BonusTier, MAX_WIN, ModeName } from "../src/types"

/** Published payout distributions per mode, split into ordinary rounds (no bonus
 * triggered) and each bonus tier, using the final integer lookup weights. */

const root = path.resolve(__dirname, "../__build__")
export const PAYOUT_CUTS = [
  0, 0.01, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, MAX_WIN, Infinity,
]
export type Group = "all" | "baseGame" | BonusTier

export interface Row {
  payout: number
  weight: number
}

export function rangeLabel(lower: number, upper: number) {
  if (lower === 0) return "0 (loss)"
  if (upper === Infinity) return `${MAX_WIN} (max)`
  if (lower === 0.01) return "0-1"
  return `${lower}-${upper}`
}

export function summarize(rows: Row[], totalWeight: number, cost: number) {
  const sorted = [...rows].sort((a, b) => a.payout - b.payout)
  const mass = sorted.reduce((sum, row) => sum + row.weight, 0)
  if (!mass) return undefined
  const ev = sorted.reduce((sum, row) => sum + row.weight * row.payout, 0)
  const mean = ev / mass
  const quantile = (fraction: number) => {
    let cumulative = 0
    for (const row of sorted) {
      cumulative += row.weight
      if (cumulative >= fraction * mass) return row.payout
    }
    return sorted.at(-1)!.payout
  }
  const entry = mass / totalWeight
  return {
    entryProbability: entry,
    entryOneIn: 1 / entry,
    mean,
    meanInCosts: mean / cost,
    modeRtpContribution: (entry * mean) / cost,
    hitRate: sorted.filter((r) => r.payout > 0).reduce((s, r) => s + r.weight, 0) / mass,
    atLeastCost: sorted.filter((r) => r.payout >= cost).reduce((s, r) => s + r.weight, 0) / mass,
    median: quantile(0.5),
    p90: quantile(0.9),
    p99: quantile(0.99),
    p999: quantile(0.999),
    ranges: PAYOUT_CUTS.slice(0, -1).map((lower, i) => {
      const upper = PAYOUT_CUTS[i + 1]
      const group = sorted.filter((row) =>
        lower === 0 ? row.payout === 0 : row.payout >= lower && row.payout < upper,
      )
      const weight = group.reduce((sum, row) => sum + row.weight, 0)
      const probability = weight / mass
      return {
        range: rangeLabel(lower, upper),
        probability,
        oneIn: probability ? 1 / probability : null,
        perPaidRoundOneIn: weight ? totalWeight / weight : null,
        rtpShare: ev ? group.reduce((s, r) => s + r.weight * r.payout, 0) / ev : 0,
      }
    }),
  }
}

const TIER = /"type":"freeSpinTrigger","data":\{"tier":"(normal|super|hidden)"/

async function modeGroups(mode: ModeName) {
  const rows = new Map(
    readFileSync(path.join(root, "publish_files", `lookUpTable_${mode}_0.csv`), "utf8")
      .trim()
      .split(/\r?\n/)
      .map((line) => {
        const [id, weight, cents] = line.split(",").map(Number)
        assert.ok(Number.isSafeInteger(weight) && weight >= 0)
        return [id, { payout: cents / 100, weight }] as const
      }),
  )
  const groups = new Map<Group, Row[]>([["all", [...rows.values()]]])
  let seen = 0
  for await (const line of createInterface({
    input: createReadStream(path.join(root, `books_${mode}.jsonl`)),
    crlfDelay: Infinity,
  })) {
    if (!line.trim()) continue
    const head = /^\{"id":(\d+),"payoutMultiplier":(\d+)/.exec(line)
    assert.ok(head, `${mode}: unexpected book line`)
    const row = rows.get(Number(head[1]))
    assert.ok(row, `${mode}/${head[1]}: missing lookup row`)
    assert.equal(row.payout, Number(head[2]) / 100, `${mode}/${head[1]}: stale lookup/book`)
    seen++
    const group: Group = (TIER.exec(line)?.[1] as BonusTier | undefined) ?? "baseGame"
    const list = groups.get(group) ?? []
    list.push(row)
    groups.set(group, list)
  }
  assert.equal(seen, rows.size, `${mode}: lookup/book count mismatch`)
  return groups
}

function markdown(results: Awaited<ReturnType<typeof build>>) {
  const pct = (v: number) => (v * 100).toFixed(v >= 0.001 || v === 0 ? 2 : 4) + "%"
  const oneIn = (v: number | null) =>
    v === null ? "-" : v < 100 ? v.toFixed(1) : Math.round(v).toLocaleString("en-US")
  const lines: string[] = ["# Panda Feasting published payout distributions", ""]
  lines.push(
    "Payouts are base-bet multiples for the whole round (including any bonus).",
    "`% of group` is conditional on that group; `1 in (paid)` is per paid round of the mode.",
    "`baseGame` = rounds that trigger no bonus; `all` = whole mode. Groups not listed never occur in that mode.",
    "",
  )
  for (const { mode, cost, groups: all } of results) {
    const groups = all
      .filter((g) => g.group !== "all" || all.length > 2)
      .map((g) => ({
        ...g,
        group: mode === "featureSpin" && g.group === "baseGame" ? "featureSpin" : g.group,
      }))
    lines.push(`## ${mode} (cost ${cost}x)`, "")
    lines.push(
      "| Group | Enter 1 in | Mean | RTP contrib | Hit | >= cost | Median | P90 | P99 | P99.9 |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    )
    for (const g of groups)
      lines.push(
        `| ${g.group} | ${oneIn(g.entryOneIn)} | ${g.mean.toFixed(2)}x | ${pct(g.modeRtpContribution)} | ${pct(g.hitRate)} | ${pct(g.atLeastCost)} | ${g.median} | ${g.p90} | ${g.p99} | ${g.p999} |`,
      )
    lines.push("")
    const shown = groups.filter((g) => g.group !== "all")
    lines.push(
      "| Payout x | " + shown.map((g) => `${g.group} % / 1 in (paid) / RTP share`).join(" | ") + " |",
      "| --- | " + shown.map(() => "---:").join(" | ") + " |",
    )
    PAYOUT_CUTS.slice(0, -1).forEach((_, i) => {
      const cells = shown.map((g) => {
        const r = g.ranges[i]
        return r.probability
          ? `${pct(r.probability)} / ${oneIn(r.perPaidRoundOneIn)} / ${pct(r.rtpShare)}`
          : "-"
      })
      lines.push(`| ${shown[0].ranges[i].range} | ${cells.join(" | ")} |`)
    })
    lines.push("")
  }
  return lines.join("\n")
}

async function build() {
  const results = []
  for (const mode of Object.keys(MODES) as ModeName[]) {
    const { cost } = MODES[mode]
    const groups = await modeGroups(mode)
    const total = groups.get("all")!.reduce((sum, row) => sum + row.weight, 0)
    results.push({
      mode,
      cost,
      groups: (["all", "baseGame", "normal", "super", "hidden"] as const).flatMap((group) => {
        const summary = groups.has(group)
          ? summarize(groups.get(group)!, total, cost)
          : undefined
        return summary ? [{ group, ...summary }] : []
      }),
    })
  }
  return results
}

async function main() {
  const results = await build()
  const option = (name: string) => {
    const index = process.argv.indexOf(name)
    if (index < 0) return undefined
    assert.ok(process.argv[index + 1], `${name} requires a file path`)
    return path.resolve(process.argv[index + 1])
  }
  const json = option("--output")
  if (json)
    writeFileSync(
      json,
      JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2) + "\n",
    )
  const md = markdown(results)
  const mdPath = option("--markdown")
  if (mdPath) writeFileSync(mdPath, md + "\n")
  if (!json && !mdPath) console.log(md)
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename)
  void main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
