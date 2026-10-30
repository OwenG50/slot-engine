import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { createReadStream, readFileSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { createInterface } from "node:readline"
import { FEATURE_RULES, MODES } from "../src/settings"
import { GameEvent, ModeName } from "../src/types"
import { wildLaunches } from "../src/wildLaunches"
export { wildLaunches } from "../src/wildLaunches"

type Launch = ReturnType<typeof wildLaunches>[number]
const bucket = () => ({ launchMass: 0, roundMass: 0, supportedBooks: 0 })
export function launchAccumulator() {
  let totalMass = 0
  let launchMass = 0
  const counts = Array.from({ length: 15 }, bucket)
  const multipliers = new Map<string, ReturnType<typeof bucket>>()
  const fullScreen = bucket()
  const fullScreenMultipliers = new Map<number, ReturnType<typeof bucket>>()
  function add(weight: number, launches: Launch[]) {
    assert.ok(Number.isSafeInteger(weight) && weight >= 0)
    if (!weight) return
    totalMass += weight
    launchMass += weight * launches.length
    assert.ok(Number.isSafeInteger(totalMass) && Number.isSafeInteger(launchMass))
    const seen = new Set<ReturnType<typeof bucket>>()
    function record(target: ReturnType<typeof bucket>) {
      target.launchMass += weight
      if (!seen.has(target)) {
        target.roundMass += weight
        target.supportedBooks++
        seen.add(target)
      }
    }
    for (const launch of launches) {
      record(counts[launch.count - 1])
      const key = `${launch.count}:${launch.multiplier}`
      if (!multipliers.has(key)) multipliers.set(key, bucket())
      record(multipliers.get(key)!)
      if (launch.fullScreen) {
        record(fullScreen)
        if (!fullScreenMultipliers.has(launch.multiplier))
          fullScreenMultipliers.set(launch.multiplier, bucket())
        record(fullScreenMultipliers.get(launch.multiplier)!)
      }
    }
  }
  function rates(value: ReturnType<typeof bucket>) {
    const roundProbability = totalMass ? value.roundMass / totalMass : 0
    return {
      supportedBooks: value.supportedBooks,
      probabilityPerExplosion: launchMass ? value.launchMass / launchMass : null,
      averageLaunchesPerRound: totalMass ? value.launchMass / totalMass : 0,
      roundProbability,
      roundOneIn: roundProbability ? 1 / roundProbability : null,
    }
  }
  return {
    add,
    report: () => ({
      totalRoundWeight: totalMass,
      averageExplosionsPerRound: totalMass ? launchMass / totalMass : 0,
      counts: counts.map((value, index) => ({ count: index + 1, ...rates(value) })),
      countAndMultiplier: [...multipliers].map(([key, value]) => {
        const [count, multiplier] = key.split(":").map(Number)
        return { count, multiplier, ...rates(value) }
      }),
      fullScreen: rates(fullScreen),
      fullScreenByLaunchMultiplier: [...fullScreenMultipliers]
        .sort(([a], [b]) => a - b)
        .map(([multiplier, value]) => ({
          stage: Number(
            Object.entries(FEATURE_RULES.stageMultipliers).find(
              ([, value]) => value === multiplier,
            )![0],
          ),
          multiplier,
          shareOfFullScreens: fullScreen.launchMass
            ? value.launchMass / fullScreen.launchMass
            : null,
          ...rates(value),
        })),
    }),
  }
}

async function main() {
  const root = path.resolve(__dirname, "../__build__")
  const results = []
  for (const mode of Object.keys(MODES) as ModeName[]) {
    const lookupPath = path.join(root, "publish_files", `lookUpTable_${mode}_0.csv`)
    const bytes = readFileSync(lookupPath)
    const rows = new Map<number, { weight: number; payout: number }>()
    for (const line of bytes.toString("utf8").trim().split(/\r?\n/)) {
      const fields = line.split(",")
      assert.equal(fields.length, 3)
      const [id, weight, payout] = fields.map(Number)
      assert.ok(
        [id, weight, payout].every((value) => Number.isSafeInteger(value) && value >= 0),
        `${mode}: invalid lookup row`,
      )
      assert.ok(!rows.has(id), `${mode}: duplicate lookup id ${id}`)
      rows.set(id, { weight, payout })
    }
    const groups = new Map<string, ReturnType<typeof launchAccumulator>>()
    const add = (group: string, weight: number, launches: Launch[]) => {
      if (!groups.has(group)) groups.set(group, launchAccumulator())
      groups.get(group)!.add(weight, launches)
    }
    const seen = new Set<number>()
    const bookPath = path.join(root, `books_${mode}.jsonl`)
    const bookHash = createHash("sha256")
    const input = createReadStream(bookPath)
    input.on("data", (chunk) => bookHash.update(chunk))
    for await (const line of createInterface({ input, crlfDelay: Infinity })) {
      if (!line.trim()) continue
      const book = JSON.parse(line) as {
        id: number
        payoutMultiplier: number
        events: GameEvent[]
      }
      const row = rows.get(book.id)
      assert.ok(row && !seen.has(book.id), `${mode}/${book.id}: missing/duplicate row`)
      assert.equal(row.payout, book.payoutMultiplier, `${mode}/${book.id}: stale payout`)
      seen.add(book.id)
      const launches = wildLaunches(book.events, mode)
      add("all", row.weight, launches)
      const ordinary = mode === "featureSpin" ? "featureSpin" : "base"
      add(
        ordinary,
        row.weight,
        launches.filter((launch) => launch.source === ordinary),
      )
      const trigger = book.events.find((event) => event.type === "freeSpinTrigger")
      if (trigger) {
        const source = `bonus:${trigger.data.tier}`
        add(
          source,
          row.weight,
          launches.filter((launch) => launch.source === source),
        )
      }
    }
    assert.equal(seen.size, rows.size, `${mode}: book/lookup count mismatch`)
    assert.ok(groups.get("all")!.report().totalRoundWeight > 0, `${mode}: zero mass`)
    assert.ok(
      bytes.equals(readFileSync(lookupPath)),
      `${mode}: lookup changed during report`,
    )
    const result = {
      mode,
      books: seen.size,
      lookupModifiedAt: statSync(lookupPath).mtime.toISOString(),
      booksModifiedAt: statSync(bookPath).mtime.toISOString(),
      lookupSha256: createHash("sha256").update(bytes).digest("hex"),
      booksSha256: bookHash.digest("hex"),
      groups: [...groups].map(([source, group]) => ({ source, ...group.report() })),
    }
    results.push(result)
    const all = result.groups.find((group) => group.source === "all")!
    console.log(JSON.stringify({ mode, counts: all.counts, fullScreen: all.fullScreen }))
  }
  const report = {
    generatedAt: new Date().toISOString(),
    methodology:
      "Local exported JSONL events joined by book id to final publish_files lookup weights; payout and complete id coverage checked. Zero-weight books excluded from odds. Hashes identify the analyzed build.",
    denominators:
      "all/base/featureSpin use all paid rounds in the mode; bonus:tier uses only rounds entering that tier. Per-explosion probabilities divide weighted launch counts, not round counts. A full screen means all 15 cells are wild after a launch; natural and launched wilds share that spin's stage multiplier.",
    results,
  }
  const outputIndex = process.argv.indexOf("--output")
  if (outputIndex >= 0) {
    assert.ok(process.argv[outputIndex + 1], "--output requires a path")
    writeFileSync(
      path.resolve(process.argv[outputIndex + 1]),
      JSON.stringify(report, null, 2) + "\n",
    )
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  void main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
