#!/usr/bin/env node
import * as fs from "fs"
import * as path from "path"
import * as readline from "readline"

const TIERS = ["normal", "super", "hidden"] as const
type BonusTier = (typeof TIERS)[number]
const SAMPLE_TYPES = [...TIERS, "maxwin", "ordinary"] as const

const DEFAULT_MODES = ["base", "extraChance", "extraChance2", "featureSpin"]
const BONUS_BUY_MODES = new Set([
  "bonusFeature",
  "superBonusFeature",
  "hiddenBonusFeature",
])

interface BookEvent {
  type: string
  data?: Record<string, unknown>
}

interface Book {
  id: number
  payoutMultiplier: number
  events: BookEvent[]
}

interface Candidate {
  mode: string
  tier: (typeof SAMPLE_TYPES)[number]
  bookId: number
  bookLine: number
  payout: number
  triggerScatters: number
  publishedWeight: number
  winLevel: number
}

export interface NaturalBonusSample extends Candidate {
  targetQuantile: number | null
}

interface LookupEntry {
  weight: number
  payoutCents: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseBook(value: unknown, source: string): Book {
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.id) ||
    !Number.isSafeInteger(value.payoutMultiplier) ||
    !Array.isArray(value.events)
  )
    throw new Error(`Invalid book record in ${source}`)

  const events = value.events.map((event, index) => {
    if (!isRecord(event) || typeof event.type !== "string")
      throw new Error(`Invalid event ${index} in ${source}`)
    if (event.data !== undefined && !isRecord(event.data))
      throw new Error(`Invalid event data at event ${index} in ${source}`)
    return { type: event.type, data: event.data as Record<string, unknown> | undefined }
  })

  return {
    id: value.id as number,
    payoutMultiplier: value.payoutMultiplier as number,
    events,
  }
}

function tierFromScatterCount(count: number): BonusTier | undefined {
  if (count >= 5) return "hidden"
  if (count === 4) return "super"
  if (count === 3) return "normal"
  return undefined
}

function countInitialScatters(book: Book, source: string): number {
  const reveal = book.events.find((event) => event.type === "reveal")
  const board = reveal?.data?.board
  if (!Array.isArray(board)) throw new Error(`Missing initial reveal board in ${source}`)

  let count = 0
  for (const reel of board) {
    if (!Array.isArray(reel)) throw new Error(`Invalid initial reveal board in ${source}`)
    for (const cell of reel) {
      const symbol =
        typeof cell === "string"
          ? cell
          : isRecord(cell) && typeof cell.name === "string"
            ? cell.name
            : undefined
      if (symbol === "S") count++
    }
  }
  return count
}

function totalWinLevel(book: Book, source: string): number {
  if (book.payoutMultiplier === 0) return 0
  for (let index = book.events.length - 1; index >= 0; index--) {
    const event = book.events[index]
    if (
      (event.type === "setWin" || event.type === "freeSpinEnd") &&
      event.data?.amount === book.payoutMultiplier / 100 &&
      typeof event.data.winLevel === "number" &&
      Number.isSafeInteger(event.data.winLevel) &&
      event.data.winLevel > 0
    )
      return event.data.winLevel
  }
  throw new Error(`Missing total-payout winLevel in ${source}`)
}

async function loadLookupTable(filePath: string): Promise<{
  entries: Map<number, LookupEntry>
  minimumId: number
}> {
  const entries = new Map<number, LookupEntry>()
  const input = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  })
  let minimumId = Infinity

  for await (const line of input) {
    if (!line.trim()) continue
    const fields = line.split(",")
    const [id, weight, payoutCents] = fields.map(Number)
    if (
      fields.length !== 3 ||
      !Number.isSafeInteger(id) ||
      !Number.isSafeInteger(weight) ||
      weight < 0 ||
      !Number.isSafeInteger(payoutCents) ||
      payoutCents < 0 ||
      entries.has(id)
    )
      throw new Error(`Invalid or duplicate lookup-table row in ${filePath}: ${line}`)
    entries.set(id, { weight, payoutCents })
    minimumId = Math.min(minimumId, id)
  }

  if (!entries.size) throw new Error(`Empty lookup table: ${filePath}`)
  return { entries, minimumId }
}

function resolveLookupPath(buildDir: string, mode: string): string {
  const candidates = [
    path.join(buildDir, "publish_files", `lookUpTable_${mode}_0.csv`),
    path.join(buildDir, `lookUpTable_${mode}.csv`),
  ]
  const found = candidates.find((candidate) => fs.existsSync(candidate))
  if (!found)
    throw new Error(`No published lookup table found for mode "${mode}" in ${buildDir}`)
  return found
}

function selectPayoutVariety(
  candidates: Candidate[],
  count: number,
): NaturalBonusSample[] {
  if (candidates.length < count)
    throw new Error(`Found ${candidates.length} positive-weight examples; need ${count}`)

  const ranked = [...candidates].sort(
    (a, b) => a.payout - b.payout || a.bookId - b.bookId,
  )
  const totalWeight = ranked.reduce(
    (sum, candidate) => sum + candidate.publishedWeight,
    0,
  )
  if (!(totalWeight > 0))
    throw new Error("No positive published weight for bonus samples")

  let cumulativeWeight = 0
  const withRank = ranked.map((candidate) => {
    const midpoint = cumulativeWeight + candidate.publishedWeight / 2
    cumulativeWeight += candidate.publishedWeight
    return { candidate, weightedRank: midpoint / totalWeight }
  })

  const selected: NaturalBonusSample[] = []
  const usedIds = new Set<number>()
  const usedPayouts = new Set<number>()
  for (let index = 0; index < count; index++) {
    const targetQuantile = (index + 0.5) / count
    const available = withRank.filter(
      ({ candidate }) =>
        !usedIds.has(candidate.bookId) && !usedPayouts.has(candidate.payout),
    )
    const distinctPayouts =
      available.length > 0
        ? available
        : withRank.filter(({ candidate }) => !usedIds.has(candidate.bookId))
    const nearest = distinctPayouts.reduce((best, current) =>
      Math.abs(current.weightedRank - targetQuantile) <
      Math.abs(best.weightedRank - targetQuantile)
        ? current
        : best,
    )

    selected.push({ ...nearest.candidate, targetQuantile })
    usedIds.add(nearest.candidate.bookId)
    usedPayouts.add(nearest.candidate.payout)
  }
  return selected
}

export async function findNaturalBonusSamples(
  buildDir: string,
  mode: string,
  count = 10,
): Promise<NaturalBonusSample[]> {
  if (!Number.isSafeInteger(count) || count < 1)
    throw new Error(`Sample count must be a positive integer; got ${count}`)
  if (BONUS_BUY_MODES.has(mode))
    throw new Error(`Mode "${mode}" is a bonus-buy mode, not a natural-entry mode`)

  const booksPath = path.join(buildDir, `books_${mode}.jsonl`)
  if (!fs.existsSync(booksPath))
    throw new Error(`Missing books file for mode "${mode}": ${booksPath}`)
  const lookupPath = resolveLookupPath(buildDir, mode)
  const lookup = await loadLookupTable(lookupPath)
  const configPath = path.join(buildDir, "frontend_config.json")
  const config: unknown = JSON.parse(fs.readFileSync(configPath, "utf8"))
  if (
    !isRecord(config) ||
    typeof config.maxWin !== "number" ||
    config.maxWin <= 0 ||
    !Number.isSafeInteger(config.maxWin * 100)
  )
    throw new Error(`Missing or invalid maxWin in ${configPath}`)
  const maxWinCents = config.maxWin * 100
  const maxWins: NaturalBonusSample[] = []
  const ordinaryByLevel = new Map<number, Candidate[]>()
  const candidates: Record<BonusTier, Candidate[]> = {
    normal: [],
    super: [],
    hidden: [],
  }
  const seenBooks = new Set<number>()
  const seenLookupIds = new Set<number>()
  const input = readline.createInterface({
    input: fs.createReadStream(booksPath),
    crlfDelay: Infinity,
  })
  let bookLine = 0
  let idOffset: number | undefined

  for await (const line of input) {
    bookLine++
    if (!line.trim()) continue
    const source = `${booksPath}:${bookLine}`
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch (error) {
      throw new Error(`Invalid JSON in ${source}: ${String(error)}`)
    }
    const book = parseBook(parsed, source)
    if (seenBooks.has(book.id))
      throw new Error(`Duplicate book ID ${book.id} in ${source}`)
    seenBooks.add(book.id)

    if (idOffset === undefined) {
      const direct = lookup.entries.get(book.id)
      if (direct?.payoutCents === book.payoutMultiplier) {
        idOffset = 0
      } else {
        const offset = lookup.minimumId - book.id
        const shifted = lookup.entries.get(book.id + offset)
        if (shifted?.payoutCents !== book.payoutMultiplier)
          throw new Error(`No matching published LUT payout for ${mode} book ${book.id}`)
        idOffset = offset
      }
    }

    const lookupId = book.id + idOffset
    const entry = lookup.entries.get(lookupId)
    if (!entry) throw new Error(`Missing published LUT entry for ${mode} book ${book.id}`)
    if (entry.payoutCents !== book.payoutMultiplier)
      throw new Error(`Published payout mismatch for ${mode} book ${book.id}`)
    seenLookupIds.add(lookupId)
    if (entry.weight === 0) continue

    const winLevel = totalWinLevel(book, source)
    if (book.payoutMultiplier === maxWinCents && maxWins.length < count) {
      maxWins.push({
        mode,
        tier: "maxwin",
        bookId: book.id,
        bookLine,
        payout: book.payoutMultiplier / 100,
        triggerScatters: countInitialScatters(book, source),
        publishedWeight: entry.weight,
        winLevel,
        targetQuantile: null,
      })
    }

    const triggers = book.events.filter((event) => event.type === "freeSpinTrigger")
    if (!triggers.length) {
      if (book.payoutMultiplier < maxWinCents) {
        const levelCandidates = ordinaryByLevel.get(winLevel) ?? []
        levelCandidates.push({
          mode,
          tier: "ordinary",
          bookId: book.id,
          bookLine,
          payout: book.payoutMultiplier / 100,
          triggerScatters: countInitialScatters(book, source),
          publishedWeight: entry.weight,
          winLevel,
        })
        ordinaryByLevel.set(winLevel, levelCandidates)
      }
      continue
    }
    if (triggers.length !== 1)
      throw new Error(
        `Expected one free-spin trigger in ${source}, found ${triggers.length}`,
      )
    const tier = triggers[0].data?.tier
    if (typeof tier !== "string" || !TIERS.includes(tier as BonusTier))
      throw new Error(`Invalid free-spin trigger tier in ${source}`)

    const triggerScatters = countInitialScatters(book, source)
    if (tierFromScatterCount(triggerScatters) !== tier) continue
    candidates[tier as BonusTier].push({
      mode,
      tier: tier as BonusTier,
      bookId: book.id,
      bookLine,
      payout: book.payoutMultiplier / 100,
      triggerScatters,
      publishedWeight: entry.weight,
      winLevel,
    })
  }

  for (const [id, entry] of lookup.entries) {
    if (entry.weight > 0 && !seenLookupIds.has(id))
      throw new Error(`Positive-weight LUT entry ${id} has no book in mode "${mode}"`)
  }

  const samples: NaturalBonusSample[] = []
  for (const tier of TIERS) {
    if (mode === "featureSpin" && candidates[tier].length === 0) continue
    let selected: NaturalBonusSample[]
    try {
      selected = selectPayoutVariety(candidates[tier], count)
    } catch (error) {
      throw new Error(`${mode}/${tier}: ${String(error)}`)
    }
    samples.push(...selected)
  }
  if (maxWins.length < count)
    throw new Error(
      `${mode}/maxwin: Found ${maxWins.length} positive-weight examples at the configured ${config.maxWin}x cap; need ${count}`,
    )
  const ordinary = [...ordinaryByLevel.entries()]
    .sort(([left], [right]) => left - right)
    .flatMap(([, levelCandidates]) =>
      selectPayoutVariety(levelCandidates, Math.min(count, levelCandidates.length)),
    )
  return [...samples, ...maxWins, ...ordinary]
}

function csvCell(value: string | number): string {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function parseArgs(args: string[]) {
  let buildDir = "__build__"
  let modes: string[] | undefined
  let count = 10
  let outputPath: string | undefined

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === "--build-dir" && args[index + 1]) {
      buildDir = args[++index]
    } else if (arg === "--mode" && args[index + 1]) {
      modes = args[++index]
        .split(",")
        .map((mode) => mode.trim())
        .filter(Boolean)
    } else if (arg === "--count" && args[index + 1]) {
      count = Number(args[++index])
    } else if (arg === "--output" && args[index + 1]) {
      outputPath = args[++index]
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`)
    }
  }

  const resolvedBuildDir = path.resolve(buildDir)
  if (!fs.existsSync(resolvedBuildDir))
    throw new Error(`Build directory does not exist: ${resolvedBuildDir}`)
  const selectedModes =
    modes ??
    DEFAULT_MODES.filter((mode) =>
      fs.existsSync(path.join(resolvedBuildDir, `books_${mode}.jsonl`)),
    )
  if (!selectedModes.length)
    throw new Error("No natural modes found; pass one or more modes with --mode")
  if (new Set(selectedModes).size !== selectedModes.length)
    throw new Error("Mode list contains duplicates")
  for (const mode of selectedModes) {
    if (BONUS_BUY_MODES.has(mode))
      throw new Error(
        `Mode "${mode}" is a bonus-buy mode and cannot be sampled naturally`,
      )
  }

  return {
    buildDir: resolvedBuildDir,
    modes: selectedModes,
    count,
    outputPath: path.resolve(
      outputPath ??
        path.join(resolvedBuildDir, "..", "sample_sims", "natural-bonus-samples.csv"),
    ),
  }
}

function usage() {
  return [
    "Find natural bonuses, max wins, and ordinary wins across win levels.",
    "",
    "Usage:",
    "  pnpm exec tsx scripts/find-natural-bonus-sims.ts --build-dir <__build__> [options]",
    "",
    "Options:",
    "  --mode <name[,name...]>  Modes to scan (default: base,extraChance,extraChance2,featureSpin)",
    "  --count <n>               Samples per bonus tier, max wins, and ordinary win level (default: 10)",
    "  --output <path>           CSV output path (default: <build-dir>/../sample_sims/natural-bonus-samples.csv)",
    "",
  ].join("\n")
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage())
    return
  }
  const options = parseArgs(args)
  const rows: NaturalBonusSample[] = []

  console.log(`Build: ${options.buildDir}`)
  console.log(`Modes: ${options.modes.join(", ")}`)
  for (const mode of options.modes) {
    console.log(`Scanning ${mode}...`)
    rows.push(...(await findNaturalBonusSamples(options.buildDir, mode, options.count)))
  }

  const columns = [
    "mode",
    "tier",
    "targetQuantilePercent",
    "bookId",
    "bookLine",
    "payoutX",
    "triggerScatters",
    "publishedWeight",
    "winLevel",
  ] as const
  const csv =
    [
      columns.join(","),
      ...rows.map((row) =>
        [
          row.mode,
          row.tier,
          row.targetQuantile === null ? "" : (row.targetQuantile * 100).toFixed(1),
          row.bookId,
          row.bookLine,
          row.payout.toFixed(2),
          row.triggerScatters,
          row.publishedWeight,
          row.winLevel,
        ]
          .map(csvCell)
          .join(","),
      ),
    ].join("\n") + "\n"

  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true })
  fs.writeFileSync(options.outputPath, csv)
  console.log(`\nSimulation examples (payouts include the trigger spin):`)
  console.log(csv)
  for (const mode of options.modes) {
    for (const tier of SAMPLE_TYPES) {
      const selected = rows.filter((row) => row.mode === mode && row.tier === tier)
      if (tier === "ordinary") {
        const levels = [...new Set(selected.map((row) => row.winLevel))].sort(
          (left, right) => left - right,
        )
        const maxWinLevel = rows.find(
          (row) => row.mode === mode && row.tier === "maxwin",
        )!.winLevel
        const missing = Array.from({ length: maxWinLevel }, (_, level) => level).filter(
          (level) => !levels.includes(level),
        )
        if (missing.length)
          console.log(
            `${mode}/ordinary: no positive-weight non-max examples for win levels ${missing.join(", ")}`,
          )
        for (const level of levels) {
          const levelSamples = selected.filter((row) => row.winLevel === level)
          const payouts = new Set(levelSamples.map((row) => row.payout)).size
          console.log(
            `${mode}/ordinary/level ${level}: ${levelSamples.length} examples, ${payouts} distinct payouts` +
              (levelSamples.length < options.count
                ? " (all available positive-weight examples)"
                : ""),
          )
        }
        continue
      }
      if (selected.length === 0) {
        console.log(`${mode}/${tier}: no positive-weight natural bonus examples`)
        continue
      }
      const distinctPayouts = new Set(selected.map((row) => row.payout)).size
      console.log(
        `${mode}/${tier}: ${selected.length} examples, ${distinctPayouts} distinct payouts`,
      )
    }
  }
  console.log(`Saved: ${options.outputPath}`)
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
