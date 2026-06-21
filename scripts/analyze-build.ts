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
 * and prints a comprehensive report covering:
 *   – Overall RTP
 *   – Per-result-set RTP contribution, hit rate, and average win
 *   – Bonus entry odds (each FS tier, any bonus)
 *   – Win distribution across logarithmic buckets
 *   – Free-spin tier breakdown (win avg, hit rate per tier)
 */

import * as fs from "fs"
import * as path from "path"
import * as readline from "readline"

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

function bold(s: string) { return C.bold + s + C.reset }
function cyan(s: string) { return C.cyan + s + C.reset }
function yellow(s: string) { return C.yellow + s + C.reset }
function green(s: string) { return C.green + s + C.reset }
function dim(s: string) { return C.dim + s + C.reset }
function magenta(s: string) { return C.magenta + s + C.reset }
function red(s: string) { return C.red + s + C.reset }

// ─── Win-distribution buckets ────────────────────────────────────────────────

const WIN_BUCKETS: Array<{ label: string; min: number; max: number }> = [
  { label: "0 (null)",      min: 0,      max: 0 },
  { label: "0.01 – 0.5x",  min: 0.001,  max: 0.5 },
  { label: "0.5x – 1x",    min: 0.5,    max: 1 },
  { label: "1x – 2x",      min: 1,      max: 2 },
  { label: "2x – 5x",      min: 2,      max: 5 },
  { label: "5x – 10x",     min: 5,      max: 10 },
  { label: "10x – 25x",    min: 10,     max: 25 },
  { label: "25x – 50x",    min: 25,     max: 50 },
  { label: "50x – 100x",   min: 50,     max: 100 },
  { label: "100x – 250x",  min: 100,    max: 250 },
  { label: "250x – 500x",  min: 250,    max: 500 },
  { label: "500x – 1000x", min: 500,    max: 1000 },
  { label: "1000x – 5000x",min: 1000,   max: 5000 },
  { label: "5000x – 10000x",min:5000,   max: 10000 },
  { label: "10000x – maxwin",min:10000,  max: 24999.99 },
  { label: "Max Win (exact)",min:24999.99,max: Infinity },
]

function getBucket(win: number): number {
  if (win === 0) return 0
  for (let i = WIN_BUCKETS.length - 1; i >= 0; i--) {
    if (win > WIN_BUCKETS[i].min) return i
  }
  return 0
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface CriteriaStats {
  weightSum: number         // total weight for this criteria
  weightedWin: number       // sum(weight * payoutMultiplier)
  count: number             // raw book count
  maxWin: number
}

interface TierStats {
  weightSum: number
  weightedFsWin: number     // sum(weight * freeSpinEnd.amount)
  weightedFsSpins: number   // sum(weight * totalFs)
  count: number
}

interface BucketStats {
  weightSum: number
  weightedWin: number
}

interface ModeAnalysis {
  name: string
  cost: number
  targetRtp: number
  totalWeight: number
  weightedWinSum: number
  criteria: Record<string, CriteriaStats>
  tiers: Record<string, TierStats>       // "normal" | "super" | "hidden"
  buckets: BucketStats[]
  maxWin: number
}

// ─── Math-config + publish index ─────────────────────────────────────────────

interface MathConfig {
  bet_modes?: Array<{ bet_mode: string; cost: number; rtp: number; max_win?: number }>
}

interface PublishIndex {
  modes?: Array<{ name: string; cost: number; events: string; weights: string }>
}

function loadMathConfig(buildDir: string): Map<string, { cost: number; rtp: number }> {
  const out = new Map<string, { cost: number; rtp: number }>()
  const p = path.join(buildDir, "math_config.json")
  if (!fs.existsSync(p)) return out
  try {
    const cfg: MathConfig = JSON.parse(fs.readFileSync(p, "utf8"))
    for (const m of cfg.bet_modes ?? []) {
      out.set(m.bet_mode, { cost: m.cost, rtp: m.rtp })
    }
  } catch { /* ignore parse errors */ }
  return out
}

// ─── LUT loading ─────────────────────────────────────────────────────────────

/**
 * Loads id→{weight,win} from a CSV with format: id,weight,win (no header).
 * win is in "centi-bet" units (payoutMultiplier × 100).
 */
async function loadLut(csvPath: string): Promise<Map<number, { weight: number; win: number }>> {
  const lut = new Map<number, { weight: number; win: number }>()
  const rl = readline.createInterface({
    input: fs.createReadStream(csvPath),
    crlfDelay: Infinity,
  })
  for await (const line of rl) {
    if (!line.trim()) continue
    const parts = line.split(",")
    if (parts.length < 3) continue
    const id = parseInt(parts[0], 10)
    const weight = parseFloat(parts[1])
    const win = parseFloat(parts[2])
    lut.set(id, { weight, win })
  }
  return lut
}

// ─── Book streaming + stat accumulation ──────────────────────────────────────

async function analyseMode(
  name: string,
  cost: number,
  targetRtp: number,
  booksPath: string,
  lutPath: string,
): Promise<ModeAnalysis> {
  const lut = await loadLut(lutPath)

  const analysis: ModeAnalysis = {
    name,
    cost,
    targetRtp,
    totalWeight: 0,
    weightedWinSum: 0,
    criteria: {},
    tiers: {},
    buckets: WIN_BUCKETS.map(() => ({ weightSum: 0, weightedWin: 0 })),
    maxWin: 0,
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(booksPath),
    crlfDelay: Infinity,
  })

  for await (const line of rl) {
    if (!line.trim()) continue

    let book: { id: number; payoutMultiplier: number; events: Array<{ type: string; data: Record<string, unknown> }> }
    try {
      book = JSON.parse(line)
    } catch {
      continue
    }

    // Look up published weight for this book
    const lutEntry = lut.get(book.id)
    const weight = lutEntry?.weight ?? 0
    if (weight === 0) continue

    // Books store payoutMultiplier as centi-bets (×100), e.g. 60 = 0.6× bet.
    // Divide by 100 to get the actual bet multiplier used everywhere below.
    const payout = (book.payoutMultiplier ?? 0) / 100

    // Track max win
    if (payout > analysis.maxWin) analysis.maxWin = payout

    analysis.totalWeight += weight
    analysis.weightedWinSum += weight * payout

    // ── Extract criteria from first reveal event ──────────────────────────
    const firstReveal = book.events.find((e) => e.type === "reveal")
    const criteria = (firstReveal?.data?.gameType as string | undefined) ?? "unknown"

    // ── Accumulate criteria stats ─────────────────────────────────────────
    if (!analysis.criteria[criteria]) {
      analysis.criteria[criteria] = { weightSum: 0, weightedWin: 0, count: 0, maxWin: 0 }
    }
    const cs = analysis.criteria[criteria]
    cs.weightSum += weight
    cs.weightedWin += weight * payout
    cs.count++
    if (payout > cs.maxWin) cs.maxWin = payout

    // ── FS tier stats ─────────────────────────────────────────────────────
    const triggerEvt = book.events.find((e) => e.type === "freeSpinTrigger")
    if (triggerEvt) {
      const tier = (triggerEvt.data?.tier as string | undefined) ?? "normal"
      if (!analysis.tiers[tier]) {
        analysis.tiers[tier] = { weightSum: 0, weightedFsWin: 0, weightedFsSpins: 0, count: 0 }
      }
      const ts = analysis.tiers[tier]
      ts.weightSum += weight
      ts.count++
      const fsEndEvt = book.events.find((e) => e.type === "freeSpinEnd")
      if (fsEndEvt) {
        ts.weightedFsWin += weight * ((fsEndEvt.data?.amount as number) ?? 0)
        ts.weightedFsSpins += weight * ((triggerEvt.data?.totalFs as number) ?? 0)
      }
    }

    // ── Win bucket ───────────────────────────────────────────────────────
    const bi = getBucket(payout)
    analysis.buckets[bi].weightSum += weight
    analysis.buckets[bi].weightedWin += weight * payout
  }

  return analysis
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function pct(value: number, total: number, decimals = 3): string {
  if (total === 0) return "N/A"
  return ((value / total) * 100).toFixed(decimals) + "%"
}

function hitRate(prob: number): string {
  if (prob <= 0) return "never"
  const hr = 1 / prob
  if (hr >= 1_000_000) return "1 in " + (hr / 1_000_000).toFixed(2) + "M"
  if (hr >= 100_000) return "1 in " + Math.round(hr / 1000) + "k"
  if (hr >= 10_000) return "1 in " + (hr / 1000).toFixed(1) + "k"
  if (hr >= 1000) return "1 in " + Math.round(hr)
  if (hr >= 10) return "1 in " + hr.toFixed(1)
  return "1 in " + hr.toFixed(2)
}

function pad(s: string, len: number, right = false): string {
  const plain = s.replace(/\x1b\[[0-9;]*m/g, "")
  const padding = Math.max(0, len - plain.length)
  return right
    ? " ".repeat(padding) + s
    : s + " ".repeat(padding)
}

function rpad(s: string, len: number): string { return pad(s, len, true) }
function lpad(s: string, len: number): string { return pad(s, len, false) }

function bar(fraction: number, width = 20): string {
  const filled = Math.round(fraction * width)
  return "█".repeat(filled) + "░".repeat(width - filled)
}

// ─── Report printer ────────────────────────────────────────────────────────

function printMode(a: ModeAnalysis) {
  const tw = a.totalWeight
  const rtp = tw > 0 ? a.weightedWinSum / tw / a.cost : 0

  const LINE = "═".repeat(72)
  const line = "─".repeat(72)

  console.log("\n" + bold(cyan(LINE)))
  console.log(bold(cyan(`  MODE: ${a.name}`)) + dim(`  (cost=${a.cost}x, target RTP=${(a.targetRtp * 100).toFixed(1)}%)`))
  console.log(bold(cyan(LINE)))

  // ── Overview ─────────────────────────────────────────────────────────────
  const nullCrit = a.criteria["0"]
  const nullProb = nullCrit ? nullCrit.weightSum / tw : 0
  const nonZeroProb = 1 - nullProb
  const maxwinCrit = a.criteria["maxwin"]
  const maxwinProb = maxwinCrit ? maxwinCrit.weightSum / tw : 0

  const rtpColor = Math.abs(rtp - a.targetRtp) < 0.001 ? green : yellow

  console.log("")
  console.log(`  ${bold("Overall RTP:")}        ${rtpColor(bold((rtp * 100).toFixed(4) + "%"))}  ` +
    dim(`(target ${(a.targetRtp * 100).toFixed(1)}%)`) )
  console.log(`  ${bold("Max Win Seen:")}       ${(a.maxWin).toFixed(1)}x bet`)
  console.log(`  ${bold("Non-Zero Hit Rate:")}  ${(nonZeroProb * 100).toFixed(3)}%  (${hitRate(nonZeroProb)} spins)`)
  console.log(`  ${bold("Null Hit Rate:")}      ${(nullProb * 100).toFixed(3)}%  (${hitRate(nullProb)} spins)`)
  if (maxwinProb > 0) {
    console.log(`  ${bold("Max Win Hit Rate:")}   ${hitRate(maxwinProb)}  (${(maxwinProb * 100).toFixed(6)}%)`)
  }

  // ── Bonus entry odds ─────────────────────────────────────────────────────
  const bonusCriteria = Object.entries(a.criteria).filter(
    ([k]) => k !== "0" && k !== "basegame" && k !== "unknown",
  )
  const bonusWeight = bonusCriteria.reduce((s, [, cs]) => s + cs.weightSum, 0)
  const bonusProb = bonusWeight / tw

  const fsNormal = a.criteria["freespins"]
  const fsSuper  = a.criteria["superfreespins"]
  const fsHidden = a.criteria["hiddenfreespins"]

  if (bonusProb > 0) {
    console.log("")
    console.log("  " + bold(yellow("── Bonus Entry Odds " + "─".repeat(51))))
    if (bonusWeight > 0) {
      console.log(`  ${lpad(bold("Any Bonus:"), 28)} ${hitRate(bonusProb)}`)
    }
    if (fsNormal) {
      const p = fsNormal.weightSum / tw
      console.log(`  ${lpad("Normal FS (3 scatters):", 28)} ${hitRate(p)}`)
    }
    if (fsSuper) {
      const p = fsSuper.weightSum / tw
      console.log(`  ${lpad("Super FS  (4 scatters):", 28)} ${hitRate(p)}`)
    }
    if (fsHidden) {
      const p = fsHidden.weightSum / tw
      console.log(`  ${lpad("Hidden FS (5 scatters):", 28)} ${hitRate(p)}`)
    }
  }

  // ── Result-set distribution table ────────────────────────────────────────
  console.log("")
  console.log("  " + bold(yellow("── Result Set Distribution " + "─".repeat(44))))
  console.log("")

  const hdr = [
    lpad(bold("Criteria"),         22),
    rpad(bold("Probability"),      14),
    rpad(bold("Hit Rate"),         16),
    rpad(bold("RTP Contrib"),      13),
    rpad(bold("Avg Win"),          11),
    rpad(bold("Max Win"),          10),
  ].join("  ")
  console.log("  " + hdr)
  console.log("  " + dim("─".repeat(90)))

  // Sort criteria: "0" first, then "basegame", then freespins variants, then maxwin
  const ORDER = ["0", "basegame", "freespins", "superfreespins", "hiddenfreespins", "maxwin"]
  const sortedCriteria = Object.keys(a.criteria).sort((a, b) => {
    const ai = ORDER.indexOf(a); const bi = ORDER.indexOf(b)
    if (ai >= 0 && bi >= 0) return ai - bi
    if (ai >= 0) return -1
    if (bi >= 0) return 1
    return a.localeCompare(b)
  })

  for (const crit of sortedCriteria) {
    const cs = a.criteria[crit]
    const prob    = cs.weightSum / tw
    const rtpC    = cs.weightedWin / tw / a.cost
    const avgWin  = cs.weightSum > 0 ? cs.weightedWin / cs.weightSum : 0
    const isBonus = crit !== "0" && crit !== "basegame" && crit !== "unknown"
    const critLabel = isBonus ? magenta(crit) : (crit === "0" ? dim(crit) : crit)
    const row = [
      lpad(critLabel,                    22),
      rpad((prob * 100).toFixed(4) + "%", 14),
      rpad(hitRate(prob),                 16),
      rpad((rtpC * 100).toFixed(4) + "%", 13),
      rpad(avgWin.toFixed(2) + "x",       11),
      rpad(cs.maxWin.toFixed(1) + "x",    10),
    ].join("  ")
    console.log("  " + row)
  }

  // ── FS tier breakdown ─────────────────────────────────────────────────────
  if (Object.keys(a.tiers).length > 0) {
    console.log("")
    console.log("  " + bold(yellow("── Free Spin Tier Breakdown " + "─".repeat(43))))
    console.log("")

    const tierHdr = [
      lpad(bold("Tier"),      12),
      rpad(bold("Hit Rate"),  16),
      rpad(bold("% of Bonus"),14),
      rpad(bold("Avg FS Win"),12),
      rpad(bold("Avg Spins"), 11),
    ].join("  ")
    console.log("  " + tierHdr)
    console.log("  " + dim("─".repeat(68)))

    const tierOrder = ["normal", "super", "hidden"]
    const sortedTiers = Object.keys(a.tiers).sort((a, b) => {
      const ai = tierOrder.indexOf(a); const bi = tierOrder.indexOf(b)
      return (ai >= 0 ? ai : 99) - (bi >= 0 ? bi : 99)
    })

    for (const tier of sortedTiers) {
      const ts = a.tiers[tier]
      const prob      = ts.weightSum / tw
      const bonusPct  = bonusProb > 0 ? (ts.weightSum / bonusWeight) * 100 : 0
      const avgFsWin  = ts.weightSum > 0 ? ts.weightedFsWin / ts.weightSum : 0
      const avgSpins  = ts.weightSum > 0 ? ts.weightedFsSpins / ts.weightSum : 0
      const tierLabel = tier === "hidden" ? red(tier) : tier === "super" ? yellow(tier) : green(tier)
      const row = [
        lpad(tierLabel,               12),
        rpad(hitRate(prob),           16),
        rpad(bonusPct.toFixed(2)+"%", 14),
        rpad(avgFsWin.toFixed(2)+"x", 12),
        rpad(avgSpins.toFixed(1)+" spins", 11),
      ].join("  ")
      console.log("  " + row)
    }
  }

  // ── Win distribution ─────────────────────────────────────────────────────
  console.log("")
  console.log("  " + bold(yellow("── Win Distribution " + "─".repeat(51))))
  console.log("")

  const bucketHdr = [
    lpad(bold("Win Range"),  22),
    rpad(bold("% of Spins"), 12),
    rpad(bold("% of RTP"),   12),
    rpad(bold("Visual"),     22),
  ].join("  ")
  console.log("  " + bucketHdr)
  console.log("  " + dim("─".repeat(72)))

  for (let i = 0; i < WIN_BUCKETS.length; i++) {
    const b = a.buckets[i]
    if (b.weightSum === 0) continue
    const spinPct = b.weightSum / tw
    const rtpPct  = a.weightedWinSum > 0 ? b.weightedWin / a.weightedWinSum : 0
    const isNull  = i === 0
    const rangeLabel = isNull ? dim(WIN_BUCKETS[i].label) : WIN_BUCKETS[i].label
    const row = [
      lpad(rangeLabel,                    22),
      rpad((spinPct * 100).toFixed(3)+"%", 12),
      rpad((rtpPct  * 100).toFixed(3)+"%", 12),
      dim(bar(Math.min(spinPct / 0.35, 1), 22)),
    ].join("  ")
    console.log("  " + row)
  }

  console.log("")
}

// ─── Mode discovery ───────────────────────────────────────────────────────────

interface ModeDescriptor {
  name: string
  booksPath: string
  lutPath: string
  cost: number
  rtp: number
}

function discoverModes(buildDir: string): ModeDescriptor[] {
  const mathConfig = loadMathConfig(buildDir)
  const publishDir = path.join(buildDir, "publish_files")
  const modes: ModeDescriptor[] = []
  const seen = new Set<string>()

  // Scan for all books_*.jsonl files
  const entries = fs.readdirSync(buildDir)
  for (const entry of entries) {
    const m = entry.match(/^books_(.+)\.jsonl$/)
    if (!m) continue
    const name = m[1]
    if (seen.has(name)) continue

    const booksPath = path.join(buildDir, entry)

    // Prefer published LUT from publish_files/
    let lutPath = path.join(publishDir, `lookUpTable_${name}_0.csv`)
    if (!fs.existsSync(lutPath)) {
      // Fall back to the __build__-level LUT (uniform weights — log a warning)
      lutPath = path.join(buildDir, `lookUpTable_${name}.csv`)
    }
    if (!fs.existsSync(lutPath)) {
      process.stderr.write(`  [warn] No LUT found for mode "${name}", skipping.\n`)
      continue
    }

    const cfg = mathConfig.get(name) ?? { cost: 1, rtp: 0.96 }
    modes.push({ name, booksPath, lutPath, cost: cfg.cost, rtp: cfg.rtp })
    seen.add(name)
  }

  // Sort to give a consistent order matching math_config ordering
  const cfgOrder = [...mathConfig.keys()]
  modes.sort((a, b) => {
    const ai = cfgOrder.indexOf(a.name); const bi = cfgOrder.indexOf(b.name)
    return (ai >= 0 ? ai : 999) - (bi >= 0 ? bi : 999)
  })

  return modes
}

// ─── CLI argument parsing ─────────────────────────────────────────────────────

function parseArgs(): { buildDir: string; modes?: string[] } {
  const args = process.argv.slice(2)
  let buildDir = "./__build__"
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

  console.log(dim(`\n  Found ${modesForAnalysis.length} mode(s): ` + modesForAnalysis.map((m) => m.name).join(", ")))
  console.log(dim("  Analysing (this may take a moment for large files)...\n"))

  for (const md of modesForAnalysis) {
    const isPublished = md.lutPath.includes("publish_files")
    if (!isPublished) {
      console.warn(yellow(`  [warn] Mode "${md.name}" using uniform LUT — run optimization first for accurate weights.`))
    }

    process.stdout.write(dim(`  Loading ${md.name}...`))
    const analysis = await analyseMode(md.name, md.cost, md.rtp, md.booksPath, md.lutPath)
    process.stdout.write("\r" + " ".repeat(40) + "\r")

    printMode(analysis)
  }

  console.log(bold(cyan("\n  Analysis complete.\n")))
}

main().catch((err) => {
  console.error(red("Fatal: ") + String(err))
  process.exit(1)
})
