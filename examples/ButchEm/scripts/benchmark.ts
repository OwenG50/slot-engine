import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { performance } from "node:perf_hooks"
import { game } from ".."
import type { Context } from "../src/onHandleGameFlow"
import { MODES } from "../src/settings"
import type { ModeName } from "../src/types"

// Core 0.3.2 exposes its worker runner only on the configured Simulation.
// Keep this version-specific access confined to the diagnostic script.
interface NativeSimulation {
  gameConfig: ReturnType<typeof game.getConfig>
  actualSims: number
  workerCtx?: Context
  runSingleSimulation(opts: {
    simId: number
    mode: string
    criteria: string
    index: number
  }): void
}
const simulation = (game as unknown as { simulation: NativeSimulation }).simulation
const root = path.resolve(__dirname, "..")
const runs = Number(process.env.BUTCH_BENCH_RUNS ?? 3)
if (!Number.isSafeInteger(runs) || runs < 1)
  throw new Error("BUTCH_BENCH_RUNS must be positive")
const selected = (
  process.env.BUTCH_BENCH_MODES ?? "base,bonusFeature,hiddenBonusFeature,featureSpin"
).split(",") as ModeName[]
const criteriaFilter = process.env.BUTCH_BENCH_CRITERIA?.split(",")
type Measurement = {
  mode: string
  criteria: string
  accepted: number
  attempts: number
  flowRuns: number
  ms: number
  digest: string
}
const rows: Measurement[] = []
// Load existing physical strips only. Never regenerate or replace player artifacts.
for (const mode of selected) {
  if (!MODES[mode]) throw new Error(`Unknown mode: ${mode}`)
  for (const reel of simulation.gameConfig.gameModes[mode].reelSets) {
    const file = path.join(root, "__build__", `reels_${mode}-${reel.id}.csv`)
    if (!existsSync(file)) throw new Error(`Build the reel strips first: ${file}`)
    reel.associatedGameModeName = mode
    reel.generateReels(simulation.gameConfig)
  }
}
let flowRuns = 0
const original = simulation.gameConfig.hooks.onHandleGameFlow
simulation.gameConfig.hooks.onHandleGameFlow = (ctx) => {
  flowRuns++
  original(ctx)
}
let serial = 100000
for (const mode of selected) {
  for (const resultSet of simulation.gameConfig.gameModes[mode].resultSets) {
    if (criteriaFilter && !criteriaFilter.includes(resultSet.criteria)) continue
    const attemptsBefore = simulation.actualSims
    const flowsBefore = flowRuns
    const hash = createHash("sha256")
    const start = performance.now()
    for (let round = 0; round < runs; round++) {
      simulation.runSingleSimulation({
        simId: ++serial,
        mode,
        criteria: resultSet.criteria,
        index: 0,
      })
      hash.update(JSON.stringify(simulation.workerCtx!.services.data._getBook()))
    }
    const row = {
      mode,
      criteria: resultSet.criteria,
      accepted: runs,
      attempts: simulation.actualSims - attemptsBefore,
      flowRuns: flowRuns - flowsBefore,
      ms: Math.round((performance.now() - start) * 100) / 100,
      digest: hash.digest("hex"),
    }
    rows.push(row)
    console.log(JSON.stringify(row))
  }
}
const output = path.join(root, "__build__", "performance")
mkdirSync(output, { recursive: true })
const label = process.env.BUTCH_BENCH_LABEL ?? "latest"
if (!/^[a-zA-Z0-9_-]+$/.test(label)) throw new Error("Invalid benchmark label")
const summary = {
  accepted: rows.reduce((sum, row) => sum + row.accepted, 0),
  attempts: rows.reduce((sum, row) => sum + row.attempts, 0),
  ms: rows.reduce((sum, row) => sum + row.ms, 0),
}
let comparison:
  | {
      label: string
      speedup: number
      identicalBooks: boolean
      identicalAttempts: boolean
    }
  | undefined
const compareLabel = process.env.BUTCH_BENCH_COMPARE
if (compareLabel) {
  if (!/^[a-zA-Z0-9_-]+$/.test(compareLabel) || compareLabel === label)
    throw new Error("Use a distinct benchmark comparison label")
  const before = JSON.parse(
    readFileSync(path.join(output, `${compareLabel}.json`), "utf8"),
  ) as { rows: Measurement[] }
  if (
    before.rows.length !== rows.length ||
    before.rows.some(
      (row, i) =>
        row.mode !== rows[i].mode ||
        row.criteria !== rows[i].criteria ||
        row.accepted !== rows[i].accepted,
    )
  )
    throw new Error("Benchmark modes, criteria and run counts must match")
  comparison = {
    label: compareLabel,
    speedup: before.rows.reduce((sum, row) => sum + row.ms, 0) / summary.ms,
    identicalBooks: before.rows.every((row, i) => row.digest === rows[i].digest),
    identicalAttempts: before.rows.every(
      (row, i) => row.attempts === rows[i].attempts && row.flowRuns === rows[i].flowRuns,
    ),
  }
}
writeFileSync(
  path.join(output, `${label}.json`),
  JSON.stringify({ node: process.version, runs, rows, summary, comparison }, null, 2),
)
console.log(JSON.stringify({ summary, comparison }))
if (comparison && (!comparison.identicalBooks || !comparison.identicalAttempts))
  throw new Error("Seeded simulation behavior differs from the comparison benchmark")
