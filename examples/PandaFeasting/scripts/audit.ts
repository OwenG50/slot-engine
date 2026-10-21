import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { game } from ".."
import { Context } from "../src/onHandleGameFlow"
import { capWins, evaluateLines } from "../src/evaluations"
import { anticipation, RevealSymbol, winInfo } from "../src/events"
import { collectLowSymbols } from "../src/feature"
import { optimizationBuckets } from "../src/math"
import { FEATURE_RULES, FEATURE_SPIN_HIGH_WIN_SAMPLING, MODES } from "../src/settings"
import { PAYTABLE } from "../src/paytable"
import { BONUS_LINE_SAMPLING } from "../src/lineSampling"
import { Board, GameEvent, MAX_WIN, ModeName, Wild, cents } from "../src/types"

/** Core 0.3.2's native simulation runner, bounded here for diagnostic use. */
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
const modes = (process.env.PANDA_AUDIT_MODES ?? Object.keys(MODES).join(",")).split(
  ",",
) as ModeName[]
const runs = Number(process.env.PANDA_AUDIT_RUNS ?? 2)
// Native workers abort after 50,000 rejected attempts. Direct calls here have
// no parent worker to enforce that stop, so use a stricter budget explicitly.
const maxAttempts = Number(process.env.PANDA_AUDIT_MAX_ATTEMPTS ?? 49_999)
assert.ok(Number.isSafeInteger(runs) && runs > 0)
assert.ok(
  Number.isSafeInteger(maxAttempts) && maxAttempts > 0 && maxAttempts < 50_000,
  "PANDA_AUDIT_MAX_ATTEMPTS must be a positive integer below the worker's 50,000-attempt stop",
)
const output = path.resolve(__dirname, "../__build__")
mkdirSync(output, { recursive: true })
for (const mode of modes) {
  assert.ok(MODES[mode], `Unknown mode: ${mode}`)
  for (const reel of simulation.gameConfig.gameModes[mode].reelSets) {
    reel.associatedGameModeName = mode
    reel.generateReels(simulation.gameConfig)
    if (reel.id.startsWith("bonus_"))
      assert.ok(
        reel.reels.flat().every((symbol) => symbol.id !== "S"),
        "Scatter on bonus strip",
      )
  }
}

/** Reconstruct wins solely from the reveal and subsequent wild overlays. */
function replay(events: GameEvent[], payout: number, mode: ModeName) {
  const trigger = events.findIndex((event) => event.type === "freeSpinTrigger")
  if (trigger !== -1) {
    assert.ok(
      !events.some((event) => event.type === "triggerExplode"),
      "Explosion animation in a bonus-triggering round",
    )
    assert.ok(
      !events.slice(0, trigger).some((event) => event.type === "spawnNewStageWilds"),
      "Wild explosion on the bonus-triggering reveal",
    )
  }
  let board: Board | undefined
  let wilds: Wild[] = []
  let total = 0
  let expected: ReturnType<typeof winInfo> | undefined
  let stage = 1
  let progress = 0
  let inBonus = false
  let pendingSpawn = false
  let spinsPlayed = 0
  let spinsTotal = 0
  let hadWins = false
  const finish = () => {
    if (board && !hadWins)
      assert.equal(
        winInfo(capWins(evaluateLines(board, wilds), MAX_WIN - total)).totalWin,
        0,
      )
  }
  for (const event of events) {
    const data = event.data
    if (event.type === "freeSpinTrigger") {
      inBonus = true
      spinsTotal = 5
      assert.equal(data.totalFs, 5)
    } else if (event.type === "updateFreeSpin") {
      spinsPlayed++
      assert.deepEqual(data, { amount: spinsPlayed, total: spinsTotal })
    } else if (event.type === "reveal") {
      finish()
      const revealed = data.board as RevealSymbol[][]
      assert.equal(revealed.length, 5)
      assert.ok(revealed.every((reel) => reel.length === 3))
      board = revealed.map((reel) => reel.map((cell) => cell.name))
      const stripId =
        inBonus || mode === "featureSpin" ? "bonus_lines_v1" : "base_lines_v1"
      const strips = simulation.gameConfig.gameModes[mode].reelSets.find(
        (set) => set.id === stripId,
      )!.reels
      for (const [reel, window] of board.entries()) {
        const strip = strips[reel]
        assert.ok(
          strip.some((_, stop) =>
            window.every(
              (symbol, row) => strip[(stop + row) % strip.length].id === symbol,
            ),
          ),
          `Reveal reel ${reel} is not a physical window from ${stripId}`,
        )
      }
      wilds = revealed.flatMap((reel, x) =>
        reel.flatMap((cell, y) =>
          cell.name === "W"
            ? [{ position: [x, y] as [number, number], multiplier: cell.multiplier! }]
            : [],
        ),
      )
      assert.deepEqual(data.anticipation, anticipation(board))
      if (inBonus) {
        assert.ok(board.flat().every((symbol) => symbol !== "S"))
        assert.ok(
          wilds.every(
            (wild) =>
              wild.multiplier ===
              FEATURE_RULES.stageMultipliers[stage as 1 | 2 | 3 | 4 | 5],
          ),
        )
      }
      hadWins = false
      expected = undefined
    } else if (event.type === "spawnNewStageWilds") {
      assert.ok(board)
      const added = data.wilds as { reel: number; row: number; multiplier: number }[]
      assert.ok(added.length >= 3 && added.length <= 10)
      if (inBonus) {
        assert.ok(pendingSpawn)
        pendingSpawn = false
      }
      for (const cell of added) {
        assert.notEqual(board[cell.reel][cell.row], "S")
        assert.notEqual(board[cell.reel][cell.row], "W")
        assert.ok(Object.values(FEATURE_RULES.stageMultipliers).includes(cell.multiplier))
        if (inBonus)
          assert.equal(
            cell.multiplier,
            FEATURE_RULES.stageMultipliers[stage as 1 | 2 | 3 | 4 | 5],
          )
        board[cell.reel][cell.row] = "W"
        wilds.push({ position: [cell.reel, cell.row], multiplier: cell.multiplier })
      }
    } else if (event.type === "winInfo") {
      assert.ok(board)
      expected = winInfo(capWins(evaluateLines(board, wilds), MAX_WIN - total))
      assert.deepEqual(data, expected)
      total = cents(total + expected.totalWin)
      hadWins = true
    } else if (event.type === "setWin") {
      assert.equal(data.amount, expected!.totalWin)
    } else if (
      event.type === "setTotalWin" ||
      event.type === "finalWin" ||
      event.type === "freeSpinEnd"
    ) {
      assert.equal(data.amount, total)
    } else if (event.type === "collectSymbols") {
      assert.ok(board && inBonus && stage < 5)
      assert.equal(data.initialProgress, progress)
      const collected = collectLowSymbols(board, evaluateLines(board, wilds))
      assert.deepEqual(data.symbols, collected)
      progress += collected.length
      assert.equal(data.finalProgress, progress)
    } else if (event.type === "newStageUnlocked") {
      stage++
      assert.deepEqual(data, { stage })
      progress = 0
      pendingSpawn = true
    } else if (event.type === "addAdditionalFreeSpins") {
      const added = 5 - (spinsTotal - spinsPlayed)
      spinsTotal += added
      assert.deepEqual(data, {
        additionalFs: added,
        remainingFs: 5,
        totalFs: spinsTotal,
        positions: [],
      })
    }
  }
  finish()
  assert.equal(total, payout)
  assert.ok(total <= MAX_WIN)
  assert.ok(spinsPlayed <= 25)
}

let attempts = 0
const originalFlow = simulation.gameConfig.hooks.onHandleGameFlow
simulation.gameConfig.hooks.onHandleGameFlow = (ctx) => {
  if (++attempts > maxAttempts) throw new Error(`Exceeded ${maxAttempts} flow attempts`)
  originalFlow(ctx)
}
const coverage: {
  mode: string
  band: string
  range: number[]
  payouts: number[]
  attempts: number
  maxAttempts: number
  ms: number
}[] = []
const failures: { mode: string; band: string; error: string }[] = []
const winningSymbolsByMode: Partial<Record<ModeName, string[]>> = {}
let id = 40_000
try {
  for (const mode of modes) {
    const winningSymbols = new Set<string>()
    const sets = simulation.gameConfig.gameModes[mode].resultSets
    for (const band of optimizationBuckets(mode)) {
      const source = sets.find((set) => {
        const range = set.multiplier as [number, number]
        return (
          band.criteria.includes(set.criteria) &&
          range[0] <= band.range[1] &&
          range[1] >= band.range[0]
        )
      })!
      assert.ok(source, `${mode}/${band.name} has no candidate source`)
      const previousRange = source.multiplier
      // Narrow an existing candidate criterion for the audit only; production
      // quotas and optimizer weights remain unchanged.
      source.multiplier = band.range
      const payouts: number[] = []
      const start = performance.now()
      let totalAttempts = 0
      let largestAttemptCount = 0
      try {
        for (let round = 0; round < runs; round++) {
          attempts = 0
          simulation.runSingleSimulation({
            simId: ++id,
            mode,
            criteria: source.criteria,
            index: 0,
          })
          totalAttempts += attempts
          largestAttemptCount = Math.max(largestAttemptCount, attempts)
          const book = simulation.workerCtx!.services.data._getBook()
          const payout = book.payout / 100
          replay(book.events, payout, mode)
          for (const event of book.events)
            if (event.type === "winInfo")
              for (const win of event.data.wins as { symbol: string }[])
                winningSymbols.add(win.symbol)
          assert.ok(payout >= band.range[0] && payout <= band.range[1])
          payouts.push(payout)
          if (
            round === 0 &&
            (band.range[0] === MAX_WIN ||
              band.name === "loss" ||
              band.name === "normal_low")
          )
            writeFileSync(
              path.join(output, `sample_${mode}_${band.name}.json`),
              JSON.stringify(book, null, 2),
            )
        }
        const row = {
          mode,
          band: band.name,
          range: band.range,
          payouts,
          attempts: totalAttempts,
          maxAttempts: largestAttemptCount,
          ms: Math.round(performance.now() - start),
        }
        coverage.push(row)
        console.log(JSON.stringify(row))
      } catch (error) {
        const failure = { mode, band: band.name, error: String(error) }
        failures.push(failure)
        console.error(JSON.stringify(failure))
      } finally {
        source.multiplier = previousRange
      }
    }
    winningSymbolsByMode[mode] = [...winningSymbols].sort()
  }
} finally {
  simulation.gameConfig.hooks.onHandleGameFlow = originalFlow
}
const report = {
  note: "Real-reel candidate coverage and event replay, not optimized player probabilities.",
  paytable: PAYTABLE,
  stageThresholds: FEATURE_RULES.stageThresholds,
  featureSpinHighWinSampling: FEATURE_SPIN_HIGH_WIN_SAMPLING,
  bonusLineSampling: BONUS_LINE_SAMPLING,
  attemptBudget: maxAttempts,
  stageMultipliers: FEATURE_RULES.stageMultipliers,
  baseExplosionProbability: FEATURE_RULES.baseExplosionProbability,
  runsPerBand: runs,
  passed: coverage.length,
  failed: failures.length,
  winningSymbolsByMode,
  coverage,
  failures,
}
writeFileSync(path.join(output, "coverage-report.json"), JSON.stringify(report, null, 2))
console.log(JSON.stringify({ passed: coverage.length, failed: failures.length }))
if (failures.length) process.exitCode = 1
