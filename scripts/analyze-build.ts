#!/usr/bin/env node
/**
 * analyze-build.ts  —  Slot Engine publish-file analyser
 *
 * Usage:
 *   npx tsx scripts/analyze-build.ts --build-dir <path-to-__build__>
 *   npx tsx scripts/analyze-build.ts --build-dir examples/clusterGameOG/__build__
 *
 * For each game mode found in the __build__ directory it reads:
 *   • publish_files/lookUpTable_<mode>_0.csv  (id, weight, win)
 *   • books_<mode>.jsonl                       (book events)
 *
 * Reports whole-mode payout distributions, non-bonus base-play payouts,
 * and per-tier bonus-play totals (including trigger wins), individual-spin, and
 * spin-count distributions. All probabilities use published LUT weights.
 * Payouts are base-bet multipliers; RTP is normalized by mode cost.
 */

import * as fs from "fs"
import * as path from "path"
import * as readline from "readline"
import * as zlib from "zlib"

// ─── ANSI helpers ────────────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
  white: "\x1b[37m",
}

const OUTPUT_DIR = path.resolve(path.dirname(__filename), "..", "Math Mode Analysis")

function bold(s: string) {
  return C.bold + s + C.reset
}
function cyan(s: string) {
  return C.cyan + s + C.reset
}
function yellow(s: string) {
  return C.yellow + s + C.reset
}
function green(s: string) {
  return C.green + s + C.reset
}
function dim(s: string) {
  return C.dim + s + C.reset
}
function magenta(s: string) {
  return C.magenta + s + C.reset
}
function red(s: string) {
  return C.red + s + C.reset
}

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, "")
}

function sanitizeFileName(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*[-_]+\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim()
}

function deriveGameName(buildDir: string): string {
  const base = path.basename(buildDir)
  if (base === "__build__") {
    return path.basename(path.dirname(buildDir)) || "game"
  }
  return base || "game"
}

function formatTimestamp(date = new Date()): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  const hh = String(date.getHours()).padStart(2, "0")
  const mi = String(date.getMinutes()).padStart(2, "0")
  const ss = String(date.getSeconds()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}_${hh}-${mi}-${ss}`
}

let reportStream: fs.WriteStream | null = null
let reportFilePath = ""

function createReportWriter(
  filePath: string,
  gameName: string,
  buildDir: string,
  timestamp: string,
) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  reportFilePath = filePath
  reportStream = fs.createWriteStream(filePath, { flags: "w" })
  reportStream.write(`Slot Engine Build Analysis\n`)
  reportStream.write(`Game: ${gameName}\n`)
  reportStream.write(`Timestamp: ${timestamp}\n`)
  reportStream.write(`Build Dir: ${buildDir}\n\n`)

  const originalConsoleLog = console.log.bind(console)
  const originalConsoleWarn = console.warn.bind(console)
  const originalConsoleError = console.error.bind(console)

  const formatArgs = (args: unknown[]) => args.map((arg) => String(arg)).join(" ")

  console.log = (...args: unknown[]) => {
    const text = formatArgs(args)
    reportStream?.write(stripAnsi(text) + "\n")
  }

  console.warn = (...args: unknown[]) => {
    const text = `[warn] ${formatArgs(args)}`
    reportStream?.write(stripAnsi(text) + "\n")
  }

  console.error = (...args: unknown[]) => {
    const text = `[error] ${formatArgs(args)}`
    reportStream?.write(stripAnsi(text) + "\n")
    // Also echo to the real stderr - the report stream may not have
    // finished opening yet if the process exits right after an error.
    originalConsoleError(text)
  }

  return () => {
    if (reportStream) {
      reportStream.end()
      reportStream = null
    }
    console.log = originalConsoleLog
    console.warn = originalConsoleWarn
    console.error = originalConsoleError
  }
}

interface MathConfig {
  bet_modes?: Array<{ bet_mode: string; cost: number; rtp: number; max_win?: number }>
}

interface PublishIndex {
  modes?: Array<{ name: string; cost: number; events: string; weights: string }>
}

function loadMathConfig(
  buildDir: string,
): Map<string, { cost: number; rtp: number | null }> {
  const out = new Map<string, { cost: number; rtp: number | null }>()

  // core 0.3.x: costs are published in publish_files/index.json.
  const indexPath = path.join(buildDir, "publish_files", "index.json")
  if (fs.existsSync(indexPath)) {
    try {
      const idx: PublishIndex = JSON.parse(fs.readFileSync(indexPath, "utf8"))
      for (const m of idx.modes ?? []) {
        out.set(m.name, { cost: m.cost, rtp: null })
      }
    } catch (error) {
      throw new Error(`Invalid build metadata: ${String(error)}`)
    }
  }

  // core 0.1.x: math_config.json (also carries per-mode rtp).
  const p = path.join(buildDir, "math_config.json")
  if (fs.existsSync(p)) {
    try {
      const cfg: MathConfig = JSON.parse(fs.readFileSync(p, "utf8"))
      for (const m of cfg.bet_modes ?? []) {
        out.set(m.bet_mode, { cost: m.cost, rtp: m.rtp })
      }
    } catch (error) {
      throw new Error(`Invalid build metadata: ${String(error)}`)
    }
  }

  return out
}

interface Distribution {
  weight: number
  sum: number
  count: number
  values: Map<number, number>
}
interface TierStats {
  rounds: Distribution
  spins: Distribution
  lengths: Distribution
  retriggerWeight: number
}
interface ModeAnalysis {
  name: string
  cost: number
  targetRtp: number | null
  total: Distribution
  base: Distribution
  tiers: Record<string, TierStats>
}
type BookEvent = { type: string; data?: Record<string, unknown> }
function distribution(): Distribution {
  return { weight: 0, sum: 0, count: 0, values: new Map() }
}
function add(d: Distribution, value: number, weight: number) {
  // Events use base-bet units; normalize floating-point addition to cents.
  value = Math.round(value * 100) / 100
  d.weight += weight
  d.sum += value * weight
  d.count++
  d.values.set(value, (d.values.get(value) ?? 0) + weight)
}
async function loadLut(csvPath: string) {
  const lut = new Map<number, { weight: number; win: number }>()
  const rl = readline.createInterface({
    input: fs.createReadStream(csvPath),
    crlfDelay: Infinity,
  })
  for await (const line of rl) {
    if (!line.trim()) continue
    const fields = line.split(",").map(Number)
    const [id, weight, win] = fields
    if (
      fields.length !== 3 ||
      !Number.isSafeInteger(id) ||
      !Number.isSafeInteger(weight) ||
      weight < 0 ||
      !Number.isSafeInteger(win) ||
      win < 0 ||
      lut.has(id)
    ) {
      throw new Error(`Invalid or duplicate LUT row in ${csvPath}: ${line}`)
    }
    lut.set(id, { weight, win: win / 100 })
  }
  if (!lut.size) throw new Error(`Empty LUT: ${csvPath}`)
  return lut
}
async function* readBooksLines(booksPaths: string[]): AsyncGenerator<string> {
  for (const booksPath of booksPaths) {
    if (booksPath.endsWith(".zst")) {
      if (!zlib.zstdDecompressSync)
        throw new Error("Zstandard books require Node >= 23.8 or plain .jsonl books.")
      const decompressed = zlib.zstdDecompressSync(fs.readFileSync(booksPath))
      yield* decompressed.toString("utf8").split("\n")
    } else {
      const rl = readline.createInterface({
        input: fs.createReadStream(booksPath),
        crlfDelay: Infinity,
      })
      for await (const line of rl) yield line
    }
  }
}
export async function analyseMode(
  name: string,
  cost: number,
  targetRtp: number | null,
  booksPaths: string[],
  lutPath: string,
): Promise<ModeAnalysis> {
  if (!Number.isFinite(cost) || cost <= 0) throw new Error(`Invalid cost for ${name}`)
  const lut = await loadLut(lutPath)
  const a: ModeAnalysis = {
    name,
    cost,
    targetRtp,
    total: distribution(),
    base: distribution(),
    tiers: {},
  }
  let minBook = Infinity
  for await (const line of readBooksLines(booksPaths)) {
    if (!line.trim()) continue
    const book = JSON.parse(line)
    if (!Number.isSafeInteger(book.id)) throw new Error(`Invalid book ID in ${name}`)
    minBook = Math.min(minBook, book.id)
  }
  let minLut = Infinity
  for (const id of lut.keys()) minLut = Math.min(minLut, id)
  const offset = minLut - minBook
  if (offset) console.warn(`Mode "${name}": correcting book/LUT ID offset ${offset}.`)
  const seen = new Set<number>()
  for await (const line of readBooksLines(booksPaths)) {
    if (!line.trim()) continue
    const book: { id: number; payoutMultiplier: number; events: BookEvent[] } =
      JSON.parse(line)
    const id = book.id + offset
    const entry = lut.get(id)
    if (!entry || seen.has(id))
      throw new Error(`Missing LUT entry or duplicate book ${book.id} in ${name}`)
    seen.add(id)
    if (Math.abs(book.payoutMultiplier / 100 - entry.win) > 0.00001)
      throw new Error(`Book/LUT payout mismatch for ${name} book ${book.id}`)
    if (entry.weight === 0) continue
    const { weight, win } = entry
    add(a.total, win, weight)
    const trigger = book.events.find((e) => e.type === "freeSpinTrigger")
    const fsWins: number[] = []
    let baseWin = 0
    let spinWin = 0
    let inFs = false
    let hasBase = false
    let hasSetWin = false
    let fallbackWin = 0
    // A spin may have several reveals/cascades. updateFreeSpin marks actual
    // free spins; setWin amounts are individual payouts, not cumulative totals.
    const flushSpin = () => {
      const value = hasSetWin ? spinWin : fallbackWin
      if (inFs) fsWins.push(value)
      else baseWin += value
      spinWin = 0
      fallbackWin = 0
      hasSetWin = false
    }
    for (const event of book.events) {
      if (event.type === "updateFreeSpin") {
        flushSpin()
        inFs = true
      } else if (event.type === "reveal" && !inFs) {
        hasBase = true
      } else if (event.type === "setWin" || event.type === "winInfo") {
        const amount = Number(
          event.data?.[event.type === "setWin" ? "amount" : "totalWin"],
        )
        if (!Number.isFinite(amount) || amount < 0)
          throw new Error(`Invalid win event in ${name} book ${book.id}`)
        if (event.type === "setWin") {
          spinWin += amount
          hasSetWin = true
        } else fallbackWin += amount
      }
    }
    flushSpin()
    const fsWin = fsWins.reduce((sum, value) => sum + value, 0)
    if (Math.abs(baseWin + fsWin - win) > 0.011)
      throw new Error(
        `Event payouts do not reconcile with LUT in ${name} book ${book.id}: ${baseWin} + ${fsWin} != ${win}`,
      )
    if (hasBase && !trigger) add(a.base, win, weight)
    if (trigger) {
      const tier = String(trigger.data?.tier ?? "normal")
      const t = (a.tiers[tier] ??= {
        rounds: distribution(),
        spins: distribution(),
        lengths: distribution(),
        retriggerWeight: 0,
      })
      // A bonus play includes the triggering spin and all free spins.
      add(t.rounds, win, weight)
      add(t.lengths, fsWins.length, weight)
      for (const value of fsWins) add(t.spins, value, weight)
      if (book.events.some((e) => e.type === "addAdditionalFreeSpins"))
        t.retriggerWeight += weight
    } else if (fsWins.length)
      throw new Error(`Free spins without a trigger in ${name} book ${book.id}`)
  }
  for (const [id, entry] of lut) {
    if (entry.weight > 0 && !seen.has(id))
      throw new Error(`Positive-weight LUT outcome ${id} has no book in ${name}`)
  }
  if (!a.total.weight) throw new Error(`No positive-weight outcomes in ${name}`)
  return a
}
function pct(value: number, total: number, decimals = 4): string {
  if (!total) return "N/A"
  const p = (value / total) * 100
  if (p > 0 && p < 10 ** -decimals) return p.toExponential(3) + "%"
  return p.toFixed(decimals) + "%"
}
function hitRate(prob: number): string {
  if (prob <= 0) return "never"
  const odds = 1 / prob
  return "1 in " + (odds >= 1e6 ? (odds / 1e6).toFixed(3) + "M" : odds.toFixed(2))
}
function weightedQuantile(d: Distribution, q: number): number {
  let weight = 0
  const points = [...d.values].sort((a, b) => a[0] - b[0])
  for (const [value, w] of points) {
    weight += w
    if (weight >= d.weight * q) return value
  }
  return 0
}
function maximum(d: Distribution): number {
  let max = 0
  for (const value of d.values.keys()) max = Math.max(max, value)
  return max
}
function printDistribution(
  title: string,
  d: Distribution,
  a: ModeAnalysis,
  spinCounts = false,
) {
  console.log(`\n  ${title}`)
  if (!d.weight) {
    console.log("  No observed outcomes.")
    return
  }
  const nullWeight = d.values.get(0) ?? 0
  console.log(
    `  Weighted mean: ${(d.sum / d.weight).toFixed(4)}${spinCounts ? " spins" : "x base bet"} | Median: ${weightedQuantile(d, 0.5).toFixed(2)} | P90: ${weightedQuantile(d, 0.9).toFixed(2)} | P95: ${weightedQuantile(d, 0.95).toFixed(2)} | Max: ${maximum(d).toFixed(2)}`,
  )
  if (!spinCounts) {
    console.log(
      `  Non-zero: ${pct(d.weight - nullWeight, d.weight)} (${hitRate((d.weight - nullWeight) / d.weight)}) | Null (0 payouts): ${pct(nullWeight, d.weight)} (${hitRate(nullWeight / d.weight)})`,
    )
    console.log(
      `  RTP contribution: ${pct(d.sum, a.total.weight * a.cost)} of mode spend`,
    )
  }
  console.log(
    "  " +
      "Range".padEnd(23) +
      "Probability".padStart(15) +
      "Frequency".padStart(20) +
      (spinCounts ? "Share of spins" : "Share of payout").padStart(19) +
      (spinCounts ? "" : "RTP points".padStart(16)),
  )
  const edges = spinCounts
    ? [1, 4, 7, 11, 16, 21, 31, Infinity]
    : [
        0,
        0.25,
        0.5,
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
        3000,
        5000,
        10000,
        Infinity,
      ]
  const buckets = edges
    .slice(0, -1)
    .map((min, i) => ({ min, max: edges[i + 1], weight: 0, sum: 0 }))
  let zeroWeight = 0
  for (const [value, w] of d.values) {
    if (!value) {
      zeroWeight += w
      continue
    }
    const b = buckets.find((b) => value >= b.min && value < b.max)!
    b.weight += w
    b.sum += value * w
  }
  const rangeValue = (value: number) =>
    value >= 1000 ? `${value / 1000}k` : String(value)
  const rows = [
    { label: spinCounts ? "0 spins" : "0x", weight: zeroWeight, sum: 0 },
    ...buckets.map((b) => ({
      label: spinCounts
        ? b.max === Infinity
          ? `${b.min}+ spins`
          : `${Math.max(1, b.min)}-${b.max - 1} spins`
        : b.min === 0
          ? ">0x - <0.25x"
          : b.max === Infinity
            ? `${rangeValue(b.min)}x+`
            : `${rangeValue(b.min)}x - <${rangeValue(b.max)}x`,
      weight: b.weight,
      sum: b.sum,
    })),
  ]
  // Show empty buckets too, making gaps in the distribution visible.
  for (const row of rows)
    console.log(
      "  " +
        row.label.padEnd(23) +
        pct(row.weight, d.weight).padStart(15) +
        hitRate(row.weight / d.weight).padStart(20) +
        pct(row.sum, d.sum).padStart(19) +
        (spinCounts ? "" : pct(row.sum, a.total.weight * a.cost).padStart(16)),
    )
}
export function printMode(a: ModeAnalysis) {
  const tw = a.total.weight
  const nullWeight = a.total.values.get(0) ?? 0
  const bonusWeight = Object.values(a.tiers).reduce((sum, t) => sum + t.rounds.weight, 0)
  console.log("\n" + "=".repeat(100))
  console.log(`  MODE: ${a.name} (cost=${a.cost}x base bet)`)
  console.log(
    `  Overall RTP: ${pct(a.total.sum, tw * a.cost)}${a.targetRtp === null ? " | Target RTP: unavailable in build metadata" : ` | Target RTP: ${pct(a.targetRtp, 1)}`}`,
  )
  console.log(
    `  Non-Zero Hit Rate: ${pct(tw - nullWeight, tw)} (${hitRate((tw - nullWeight) / tw)} mode plays)`,
  )
  console.log(
    `  Null Hit Rate: ${pct(nullWeight, tw)} (${hitRate(nullWeight / tw)} mode plays)`,
  )
  const max = maximum(a.total)
  console.log(
    `  Highest Published Payout: ${max.toFixed(2)}x base bet | Frequency: ${hitRate((a.total.values.get(max) ?? 0) / tw)}`,
  )
  console.log(
    `  Any Bonus Entry: ${pct(bonusWeight, tw)} (${hitRate(bonusWeight / tw)} mode plays)`,
  )
  console.log(
    "  All probabilities use published LUT weights. A mode play includes its triggering spin and all free spins.",
  )
  console.log(
    "  Win ranges are in base-bet multiples; RTP divides by mode cost. Frequency is conditional on the population in each section.",
  )
  printDistribution(
    "Entire Mode - Total Payout Distribution (all mode plays)",
    a.total,
    a,
  )
  printDistribution(
    "Base Game - Payout Distribution (non-bonus plays only; includes single feature spins)",
    a.base,
    a,
  )
  for (const tier of [
    ...new Set(["normal", "super", "hidden", ...Object.keys(a.tiers)]),
  ]) {
    const label =
      (
        { normal: "Bonus", super: "Super Bonus", hidden: "Hidden Bonus" } as Record<
          string,
          string
        >
      )[tier] ?? tier
    const t = a.tiers[tier]
    console.log(`\n  ${label} Free Spins`)
    if (!t) {
      console.log("  Entry: 0% (never) | No observed free-spin rounds in this mode.")
      continue
    }
    console.log(
      `  Entry: ${pct(t.rounds.weight, tw)} (${hitRate(t.rounds.weight / tw)} mode plays) | Share of bonus entries: ${pct(t.rounds.weight, bonusWeight)}`,
    )
    console.log(`  Retriggered rounds: ${pct(t.retriggerWeight, t.rounds.weight)}`)
    console.log(
      "  Bonus-play totals include the triggering spin and all free spins. Individual free-spin payouts exclude the triggering spin. All positive-weight outcomes are included.",
    )
    printDistribution(
      `${label} - Total Bonus Play Payout Distribution (includes triggering spin; conditional on this tier)`,
      t.rounds,
      a,
    )
    printDistribution(
      `${label} - Individual Free-Spin Payout Distribution (weighted across actual spins played)`,
      t.spins,
      a,
    )
    printDistribution(
      `${label} - Spins Played per Round (includes retriggers; may stop at win cap)`,
      t.lengths,
      a,
      true,
    )
  }
  const componentSum =
    a.base.sum + Object.values(a.tiers).reduce((sum, t) => sum + t.rounds.sum, 0)
  console.log(
    `\n  Reconciliation: non-bonus base-play payouts + total bonus-play payouts = ${pct(componentSum, tw * a.cost)} RTP (mode total ${pct(a.total.sum, tw * a.cost)}).`,
  )
}

interface ModeDescriptor {
  name: string
  booksPaths: string[]
  lutPath: string
  cost: number
  rtp: number | null
}

function discoverModes(buildDir: string): ModeDescriptor[] {
  const mathConfig = loadMathConfig(buildDir)
  const publishDir = path.join(buildDir, "publish_files")
  const chunksDir = path.join(buildDir, "books_chunks")
  const modes: ModeDescriptor[] = []
  const seen = new Set<string>()

  const addMode = (name: string, booksPaths: string[]) => {
    if (seen.has(name) || booksPaths.length === 0) return

    // Prefer published LUT from publish_files/
    let lutPath = path.join(publishDir, `lookUpTable_${name}_0.csv`)
    if (!fs.existsSync(lutPath)) {
      // Fall back to the __build__-level LUT (uniform weights — log a warning)
      lutPath = path.join(buildDir, `lookUpTable_${name}.csv`)
    }
    if (!fs.existsSync(lutPath)) {
      console.warn(`No LUT found for mode "${name}", skipping.`)
      return
    }

    const cfg = mathConfig.get(name)
    if (!cfg)
      throw new Error(
        `No mode cost metadata for "${name}"; cannot calculate RTP reliably.`,
      )
    modes.push({ name, booksPaths, lutPath, cost: cfg.cost, rtp: cfg.rtp })
    seen.add(name)
  }

  // core 0.1.x/0.2.x: plain uncompressed books live at the __build__ root.
  for (const entry of fs.readdirSync(buildDir)) {
    const m = entry.match(/^books_(.+)\.jsonl$/)
    if (!m) continue
    addMode(m[1], [path.join(buildDir, entry)])
  }

  // core 0.3.x: per-worker, per-chunk Zstandard-compressed books live in
  // books_chunks/. Reading these small files individually (instead of the
  // merged publish_files/books_<mode>.jsonl.zst) avoids decompressing many
  // GB into memory and a Node zstd streaming bug with concatenated frames.
  if (fs.existsSync(chunksDir)) {
    const chunksByMode = new Map<string, string[]>()
    for (const entry of fs.readdirSync(chunksDir)) {
      const m = entry.match(/^books_(.+)_chunk_\d+-\d+\.jsonl\.zst$/)
      if (!m) continue
      const name = m[1]
      if (!chunksByMode.has(name)) chunksByMode.set(name, [])
      chunksByMode.get(name)!.push(path.join(chunksDir, entry))
    }
    for (const [name, paths] of chunksByMode) addMode(name, paths)
  }

  // Sort to give a consistent order matching math_config ordering
  const cfgOrder = [...mathConfig.keys()]
  modes.sort((a, b) => {
    const ai = cfgOrder.indexOf(a.name)
    const bi = cfgOrder.indexOf(b.name)
    return (ai >= 0 ? ai : 999) - (bi >= 0 ? bi : 999)
  })

  return modes
}

function parseArgs(): { buildDir: string; modes?: string[] } {
  const args = process.argv.slice(2)
  let buildDir = "./__build__"
  // No default filter - analyze every discovered mode unless --mode is given.
  let modeFilter: string[] | undefined

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--build-dir" && args[i + 1]) {
      buildDir = args[++i]
    } else if (args[i] === "--mode" && args[i + 1]) {
      modeFilter = args[++i].split(",").map((s) => s.trim())
    } else if (!args[i].startsWith("--")) {
      // Positional: treat as build dir
      buildDir = args[i]
    }
  }

  return { buildDir: path.resolve(buildDir), modes: modeFilter }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  const { buildDir, modes: modeFilter } = parseArgs()

  if (!fs.existsSync(buildDir)) {
    console.error(`Error: build directory not found: ${buildDir}`)
    process.exit(1)
  }

  const gameName = deriveGameName(buildDir)
  const timestamp = formatTimestamp()
  const outputFile = path.join(
    OUTPUT_DIR,
    `${sanitizeFileName(gameName)} - ${timestamp}.txt`,
  )
  const restoreConsole = createReportWriter(outputFile, gameName, buildDir, timestamp)

  console.log(bold("\n  Slot Engine Build Analyser"))
  console.log(dim("  " + buildDir))

  const allModes = discoverModes(buildDir)
  const modesForAnalysis = modeFilter
    ? allModes.filter((m) => modeFilter!.includes(m.name))
    : allModes

  if (modesForAnalysis.length === 0) {
    console.error("\n  No modes found to analyse.")
    process.exit(1)
  }

  console.log(
    dim(
      `\n  Found ${modesForAnalysis.length} mode(s): ` +
        modesForAnalysis.map((m) => m.name).join(", "),
    ),
  )
  console.log(dim("  Analysing (this may take a moment for large files)...\n"))

  for (const md of modesForAnalysis) {
    const isPublished = md.lutPath.includes("publish_files")
    if (!isPublished) {
      console.warn(
        yellow(
          `  [warn] Mode "${md.name}" using uniform LUT — run optimization first for accurate weights.`,
        ),
      )
    }

    process.stdout.write(dim(`  Loading ${md.name}...`))
    const analysis = await analyseMode(
      md.name,
      md.cost,
      md.rtp,
      md.booksPaths,
      md.lutPath,
    )
    process.stdout.write("\r" + " ".repeat(40) + "\r")

    printMode(analysis)
  }

  console.log(bold(cyan("\n  Analysis complete.\n")))
  restoreConsole()
  process.stdout.write(`\nReport saved to ${outputFile}\n`)
}

if (require.main === module)
  main().catch((err) => {
    console.error(red("Fatal: ") + String(err))
    process.exit(1)
  })
