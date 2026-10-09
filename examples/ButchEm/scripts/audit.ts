import fs from "node:fs"
import { analyze, Weighted } from "./statistics"
import path from "node:path"
import { createHash } from "node:crypto"
import { zstdDecompressSync } from "node:zlib"
import assert from "node:assert/strict"
import { DESIGN, FEATURE_RULES, MODES } from "../src/settings"
import { BELOW_COST_TARGETS, bonusMinimum, HIT_TARGETS, mathBuckets } from "../src/math"
import { capWins, evaluateClusters } from "../src/evaluations"
import { EVENT, RevealSymbol, WinInfoWin, calculateWinLevel } from "../src/events"
import { clusterMultiplier } from "../src/feature"
import type { RevealedWild, WildMovement } from "../src/collection"
import { applyWilds, footprint, footprintsOverlap, resizeAnchor } from "../src/wilds"
import {
  Board,
  BonusTier,
  ClusterWin,
  MAX_WIN,
  PAYING_SYMBOLS,
  Position,
  ModeName,
  RoamingWild,
  UpgradeId,
  SymbolId,
} from "../src/types"

const root = path.resolve(__dirname, "..")
const output = path.join(root, "__build__")
const publish = path.join(output, "publish_files")
const report = {
  wildCombination: DESIGN.wildCombination,
  generatedAt: new Date().toISOString(),
  modes: {} as Record<string, ReturnType<typeof analyze> & { lookupSha256: string }>,
}
const close = (a: number, b: number, message: string, tolerance = 1e-8) =>
  assert.ok(Math.abs(a - b) < tolerance, message + ": " + a + " vs " + b)

/** Core concatenates Zstandard frames. Decode each indexed chunk separately:
 * Node 22's Zstandard reader stops at the first frame. Check publish bytes too. */
async function* readNativeBooks(mode: ModeName) {
  const metadata: { worker: number; chunks: number }[] = JSON.parse(
    fs.readFileSync(path.join(output, "books_" + mode + ".index.meta.json"), "utf8"),
  )
  const published = await fs.promises.open(
    path.join(publish, "books_" + mode + ".jsonl.zst"),
    "r",
  )
  let offset = 0
  try {
    for (const { worker, chunks } of metadata)
      for (let chunk = 0; chunk < chunks; chunk++) {
        const file = path.join(
          output,
          "books_chunks",
          "books_" + mode + "_chunk_" + worker + "-" + chunk + ".jsonl.zst",
        )
        // Core 0.3.2 includes spare chunk numbers in metadata; its merger skips them.
        if (!fs.existsSync(file)) continue
        const compressed = fs.readFileSync(file)
        const bytes = Buffer.alloc(compressed.length)
        const { bytesRead } = await published.read(bytes, 0, bytes.length, offset)
        assert.equal(bytesRead, bytes.length)
        assert.ok(bytes.equals(compressed), "Published frame differs from native chunk")
        offset += bytes.length
        for (const line of zstdDecompressSync(bytes).toString("utf8").trim().split("\n"))
          yield JSON.parse(line)
      }
    assert.equal(offset, (await published.stat()).size, "Unexpected published bytes")
  } finally {
    await published.close()
  }
}

async function main() {
  let totalAudited = 0
  for (const mode of Object.keys(MODES) as ModeName[]) {
    const weighted: Weighted[] = []
    const criteria = new Map(
      fs
        .readFileSync(path.join(output, "lookUpTableSegmented_" + mode + ".csv"), "utf8")
        .trim()
        .split(/\r?\n/)
        .map((line) => {
          const [id, bucket, base, bonus] = line.split(",")
          return [Number(id), { bucket, base: Number(base), bonus: Number(bonus) }]
        }),
    )
    const lutPath = path.join(publish, "lookUpTable_" + mode + "_0.csv")
    const csv = fs.readFileSync(lutPath, "utf8")

    const lut = new Map(
      csv
        .trim()
        .split(/\r?\n/)
        .map((line) => {
          const [id, weight, payout] = line.split(",").map(Number)
          assert.ok(Number.isSafeInteger(weight) && weight >= 0)
          return [id, { weight, payout }] as const
        }),
    )
    const seen = new Set<number>()
    let totalWeight = 0,
      totalPaid = 0,
      hits = 0,
      breakEvens = 0
    for await (const book of readNativeBooks(mode)) {
      assert.ok(!seen.has(book.id) && lut.has(book.id), "Duplicate or missing book ID")
      seen.add(book.id)
      const lookup = lut.get(book.id)!
      assert.equal(book.payoutMultiplier, lookup.payout)
      let totalCents = 0,
        spinCents = 0,
        bonusCents = 0,
        triggerCents = 0,
        expectedTotalFs = 0,
        freeSpinNumber = 0
      let inBonus = false
      let awaitingSetWin = false,
        awaitingSetTotal = false
      let lastBoard: Board | undefined
      let expectedWins: ClusterWin[] = []
      let settled = true
      let pendingFeatureStartWilds: RevealedWild[] | undefined
      const collected: Record<UpgradeId, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
      let lastWilds: RoamingWild[] = []
      let currentAnchors: Position[] = []
      let movementOccurred = false
      let activeUpgrades: Partial<Record<UpgradeId, true>> = {}
      const bucketDef = mathBuckets(mode).find(
        (b) => b.name === criteria.get(book.id)!.bucket,
      )
      for (const [eventIndex, event] of book.events.entries()) {
        assert.equal(
          event.index,
          eventIndex + 1,
          "Native event indices must be contiguous",
        )
        assert.ok(
          Object.values(EVENT).includes(event.type),
          "Unknown event name: " + event.type,
        )
        if (awaitingSetWin) assert.equal(event.type, "setWin")
        if (awaitingSetTotal) assert.equal(event.type, "setTotalWin")
        if (!["reveal", "winInfo", "setWin", "setTotalWin"].includes(event.type))
          assert.ok(settled, "Feature/final event preceded win settlement")
        if (event.type === "featureStart") {
          const expectedUpgradeCount =
            mode === "featureSpin"
              ? bucketDef?.startingUpgradeCount
              : FEATURE_RULES.startingUpgradeCount[event.data.bonusTier as BonusTier]
          assert.equal(Object.keys(event.data.upgrades).length, expectedUpgradeCount)
          pendingFeatureStartWilds = event.data.roamingWilds as RevealedWild[]
          activeUpgrades = { ...event.data.upgrades }
          currentAnchors = pendingFeatureStartWilds.map((wild) => [
            wild.steps[0].reel,
            wild.steps[0].row,
          ])
        }
        if (event.type === "moveRoamingWild") {
          assert.ok(
            lastBoard && lastWilds.length > 0,
            "Movement outside a feature reveal",
          )
          assert.ok(!movementOccurred, "Multiple movement events on one spin")
          assert.ok(
            mode !== "featureSpin" &&
              totalCents < MAX_WIN * 100 &&
              (expectedTotalFs > freeSpinNumber || lastBoard!.flat().includes("S")),
            "Collection movement on a terminal feature spin",
          )
          movementOccurred = true
          const movements = event.data.movements as WildMovement[]
          assert.equal(movements.length, lastWilds.length)
          const picked = new Set<number>()
          for (const [index, movement] of movements.entries()) {
            assert.equal(movement.roamingWildIndex, index, "Truck playback order changed")
            assert.equal(movement.size, lastWilds[index].size)
            assert.ok(
              movement.steps.length >= 2 &&
                movement.steps.length <= FEATURE_RULES.maxMovesPerSpin + 1,
            )
            const counts: Partial<Record<UpgradeId, number>> = {}
            const directions: Position[] = []
            let previous = currentAnchors[index]
            for (const [stepIndex, step] of movement.steps.entries()) {
              const anchor: Position = [step.reel, step.row]
              if (!stepIndex) assert.deepEqual(anchor, previous)
              else {
                const direction: Position = [
                  anchor[0] - previous[0],
                  anchor[1] - previous[1],
                ]
                assert.equal(
                  Math.abs(direction[0]) + Math.abs(direction[1]),
                  1,
                  "Skipped movement cell",
                )
                if (
                  !directions.length ||
                  direction.some((value, axis) => value !== directions.at(-1)![axis])
                )
                  directions.push(direction)
                assert.ok(directions.length <= 2, "Truck turned more than once")
                if (directions.length === 2)
                  assert.ok(
                    directions[0][0] * directions[1][0] +
                      directions[0][1] * directions[1][1] ===
                      0,
                    "Truck reversed direction",
                  )
              }
              for (let other = 0; other < currentAnchors.length; other++)
                if (other !== index)
                  assert.ok(
                    !footprintsOverlap(anchor, currentAnchors[other], movement.size),
                    "Moving trucks overlap",
                  )
              const cells = footprint(anchor, movement.size)
              assert.deepEqual(
                step.symbols.map(({ reel, row }) => [reel, row]),
                cells,
              )
              for (const cell of step.symbols) {
                const symbol: SymbolId = lastBoard![cell.reel][cell.row]
                assert.equal(
                  cell.symbol,
                  symbol,
                  "Incorrect symbol under movement footprint",
                )
                const key = cell.reel * 5 + cell.row
                const eligible: boolean =
                  stepIndex > 0 && symbol.startsWith("H") && !picked.has(key)
                assert.equal(cell.collected, eligible, "Missing or duplicate H pickup")
                if (eligible) {
                  picked.add(key)
                  const id = Number(symbol[1]) as UpgradeId
                  counts[id] = (counts[id] ?? 0) + 1
                  if (!activeUpgrades[id]) collected[id]++
                }
              }
              previous = anchor
            }
            currentAnchors[index] = previous
            const credits = ([1, 2, 3, 4] as const).flatMap((id) =>
              counts[id]
                ? [
                    {
                      symbol: `H${id}`,
                      upgrade: id,
                      count: counts[id],
                      collected: collected[id],
                    },
                  ]
                : [],
            )
            assert.deepEqual(movement.collectedSymbols, credits)
            assert.equal(
              movement.collectedCount,
              Object.values(counts).reduce((sum, count) => sum + count, 0),
            )
          }
          assert.deepEqual(event.data.collected, collected)
          assert.ok(
            !("required" in event.data),
            "Redundant required field in movement event",
          )
          assert.deepEqual(event.data.upgrades, activeUpgrades)
        }
        if (event.type === "upgradeUnlocked") {
          const id = event.data.upgrade as UpgradeId
          assert.ok(movementOccurred, "Upgrade preceded movement")
          currentAnchors = (event.data.roamingWildPositions as Position[]).map(
            ([x, y]) => [x, y],
          )
          assert.ok(!activeUpgrades[id], "Upgrade unlocked twice")
          assert.ok(
            collected[id] >= FEATURE_RULES.upgrades[id].requiredSymbols,
            "Upgrade unlocked before five real symbols were collected",
          )
          activeUpgrades[id] = true
        }
        if (event.type === "reveal") {
          assert.ok(settled, "Previous reveal was not settled")
          if (lastWilds.length)
            assert.ok(movementOccurred, "Feature spin omitted movement")
          movementOccurred = false
          const reveal = event.data.board as RevealSymbol[][]
          const board = reveal.map((reel) => reel.map((symbol) => symbol.name)) as Board
          lastBoard = board
          assert.ok(!("gameType" in event.data))
          assert.ok(!("paddingPositions" in event.data))
          assert.ok(!("naturalWilds" in event.data))
          assert.ok(!("spinType" in event.data))
          assert.equal(event.data.anticipation.length, 5)
          assert.ok(event.data.anticipation.every((v: number) => v === 0 || v === 1))
          // board never shows a wild overlay, so it doubles as the source.
          const source = board
          const repositioning = event.data.roamingWilds as RevealedWild[]
          const wilds: RoamingWild[] = repositioning.map((wild) => ({
            multiplier: wild.multiplier,
            size: wild.size,
            positions: wild.steps.map(({ reel, row }) => [reel, row]),
          }))
          for (const [index, wild] of repositioning.entries()) {
            assert.ok(
              !("positions" in wild),
              "Repositioning must use the uniform steps schema",
            )
            assert.equal(wild.roamingWildIndex, index)
            assert.ok(
              wild.steps.length >= 2 &&
                wild.steps.length <= FEATURE_RULES.maxMovesPerSpin + 1,
            )
            assert.equal(wild.collectedCount, 0)
            assert.deepEqual(wild.collectedSymbols, [])
            let previous = currentAnchors[index]
            const directions: Position[] = []
            for (const [stepIndex, step] of wild.steps.entries()) {
              const anchor: Position = [step.reel, step.row]
              if (!stepIndex)
                assert.deepEqual(
                  anchor,
                  previous,
                  "Repositioning started at the wrong anchor",
                )
              else {
                const direction: Position = [
                  anchor[0] - previous[0],
                  anchor[1] - previous[1],
                ]
                assert.equal(Math.abs(direction[0]) + Math.abs(direction[1]), 1)
                if (
                  !directions.length ||
                  direction.some((value, axis) => value !== directions.at(-1)![axis])
                )
                  directions.push(direction)
                assert.ok(directions.length <= 2)
                if (directions.length === 2)
                  assert.ok(
                    directions[0][0] * directions[1][0] +
                      directions[0][1] * directions[1][1] ===
                      0,
                  )
              }
              for (let other = 0; other < currentAnchors.length; other++)
                if (other !== index)
                  assert.ok(
                    !footprintsOverlap(anchor, currentAnchors[other], wild.size),
                    "Repositioning trucks overlap",
                  )
              assert.deepEqual(
                step.symbols,
                footprint(anchor, wild.size).map(([reel, row]) => ({
                  reel,
                  row,
                  symbol: source[reel][row],
                  collected: false,
                })),
              )
              previous = anchor
            }
            currentAnchors[index] = previous
          }
          lastWilds = wilds
          const upgrades = event.data.upgrades as Partial<Record<UpgradeId, true>>
          const multiplier = Math.max(1, (upgrades[3] ? 20 : 0) + (upgrades[4] ? 5 : 0))
          const size = upgrades[1] ? "2" : "1"
          const natural: RoamingWild[] = []
          for (let x = 0; x < source.length; x++)
            for (let y = 0; y < source[x].length; y++)
              if (source[x][y] === "W")
                natural.push({
                  multiplier,
                  size,
                  positions: [resizeAnchor([x, y], size)],
                })
          if (pendingFeatureStartWilds) {
            assert.deepEqual(
              wilds.map((wild) => wild.positions[0]),
              pendingFeatureStartWilds.map((wild) => [
                wild.steps[0].reel,
                wild.steps[0].row,
              ]),
              "featureStart's initial wild position must match the first reveal",
            )
            pendingFeatureStartWilds = undefined
          }
          for (const symbol of reveal.flat()) {
            assert.ok([...PAYING_SYMBOLS, "W", "S"].includes(symbol.name))
            assert.equal(symbol.Wild, symbol.name === "W" ? true : undefined)
            assert.equal(symbol.Scatter, symbol.name === "S" ? true : undefined)
            if (symbol.Wild) assert.equal(symbol.multiplier, multiplier)
          }
          assert.equal(board.length, 5)
          for (const column of board) assert.equal(column.length, 5)
          // Scatters land from real reel stops: max one per reel, organic base
          // spins cap at 2 near-misses, trigger spins show exactly 3/4/5.
          const scatterCounts = board.map(
            (column) => column.filter((s) => s === "S").length,
          )
          assert.ok(
            scatterCounts.every((count) => count <= 1),
            "Two scatters on a reel",
          )
          const scatterTotal = scatterCounts.reduce((sum, count) => sum + count, 0)
          if (mode === "featureSpin") assert.equal(scatterTotal, 0)
          else if (!inBonus) {
            if (bucketDef?.tier)
              assert.equal(
                scatterTotal,
                { normal: 3, super: 4, hidden: 5 }[bucketDef.tier],
              )
            else assert.ok(scatterTotal <= 2, "Organic base spin shows a trigger")
          }
          for (const wild of wilds) {
            assert.ok(wild.positions.length >= 2 && wild.positions.length <= 6)
            assert.equal(wild.multiplier, multiplier)
            assert.equal(wild.size, upgrades[1] ? "2" : "1")
            for (const position of wild.positions) footprint(position, wild.size)
            // Every step actually moves somewhere new.
            for (let step = 1; step < wild.positions.length; step++) {
              const [px, py] = wild.positions[step - 1]
              const [x, y] = wild.positions[step]
              assert.ok(x !== px || y !== py, "Roaming wild step did not move")
            }
            // A scatter must always stay visible: the final resting spot
            // (the only position actually applied to the board) may never
            // cover one.
            const final = wild.positions[wild.positions.length - 1]
            assert.ok(
              footprint(final, wild.size).every(([x, y]) => source[x][y] !== "S"),
              "Roaming wild landed on a scatter",
            )
            assert.ok(
              footprint(final, wild.size).every(
                ([x, y]) => !source[x][y].startsWith("H"),
              ),
              "Reveal roaming wild concealed an H symbol",
            )
          }
          const winBoard = applyWilds(source, [...natural, ...wilds], false)
          expectedWins = capWins(
            evaluateClusters(winBoard, (positions) =>
              clusterMultiplier(positions, [...wilds, ...natural]),
            ).sort(
              (a, b) =>
                PAYING_SYMBOLS.indexOf(a.symbol) - PAYING_SYMBOLS.indexOf(b.symbol) ||
                Math.min(...a.positions.map(([x, y]) => x * 5 + y)) -
                  Math.min(...b.positions.map(([x, y]) => x * 5 + y)),
            ),
            MAX_WIN - totalCents / 100,
          ).filter((win) => win.payout > 0)
          spinCents = 0
          settled = expectedWins.length === 0
        }
        if (event.type === "winInfo") {
          assert.ok(!settled && expectedWins.length > 0, "Unexpected winInfo")
          const actual = (event.data.wins as WinInfoWin[]).map(
            (win): ClusterWin => ({
              symbol: win.symbol,
              count: win.kind,
              positions: win.positions.map(({ reel, row }) => [reel, row]),
              basePayout: win.meta.winWithoutMult,
              multiplier: win.meta.multiplier,
              payout: win.win,
            }),
          )
          assert.deepEqual(
            actual.map(normalizeWin),
            expectedWins.map(normalizeWin),
            "Serialized winInfo differs from independent cluster evaluation",
          )
          spinCents = actual.reduce((sum, win) => sum + Math.round(win.payout * 100), 0)
          assert.equal(Math.round(event.data.totalWin * 100), spinCents)
          expectedWins = []
          awaitingSetWin = true
        }
        if (event.type === "setWin") {
          assert.ok(awaitingSetWin, "setWin must follow winInfo")
          assert.equal(Math.round(event.data.amount * 100), spinCents)
          assert.equal(event.data.winLevel, calculateWinLevel(spinCents / 100))
          totalCents += spinCents
          if (inBonus) bonusCents += spinCents
          assert.ok(totalCents <= MAX_WIN * 100)
          awaitingSetWin = false
          awaitingSetTotal = true
        } else if (event.type === "setTotalWin") {
          assert.ok(awaitingSetTotal, "setTotalWin must follow setWin")
          assert.equal(
            Math.round(event.data.amount * 100),
            inBonus ? triggerCents + bonusCents : spinCents,
          )
          awaitingSetTotal = false
          settled = true
        }
        if (event.type === "freeSpinTrigger") {
          assert.equal(event.data.totalFs, 10)
          const scatters = lastBoard!.flatMap((reel, x) =>
            reel.flatMap((s, y) => (s === "S" ? [{ reel: x, row: y }] : [])),
          )
          assert.deepEqual(event.data.positions, scatters)
          assert.equal(
            scatters.length,
            { normal: 3, super: 4, hidden: 5 }[event.data.tier as BonusTier],
          )
          // The feature total includes the triggering spin's own win.
          triggerCents = totalCents
          expectedTotalFs = event.data.totalFs
          inBonus = true
        }
        if (event.type === "updateFreeSpin") {
          assert.ok(inBonus)
          assert.equal(event.data.amount, ++freeSpinNumber)
          assert.equal(event.data.total, expectedTotalFs)
        }
        if (event.type === "addAdditionalFreeSpins") {
          assert.ok(inBonus, "Retrigger outside the bonus")
          assert.ok(movementOccurred, "Retrigger spin omitted collection movement")
          const scatters = lastBoard!.flatMap((reel, x) =>
            reel.flatMap((s, y) => (s === "S" ? [{ reel: x, row: y }] : [])),
          )
          assert.deepEqual(event.data.positions, scatters)
          assert.equal(event.data.additionalFs, scatters.length)
          expectedTotalFs += event.data.additionalFs
          assert.equal(event.data.totalFs, expectedTotalFs)
          assert.equal(event.data.remainingFs, expectedTotalFs - freeSpinNumber)
        }
        if (event.type === "freeSpinEnd") {
          assert.ok(
            !movementOccurred,
            "Final feature spin collected without a following spin",
          )
          const tier = book.events.find(
            (e: { type: string }) => e.type === "freeSpinTrigger",
          ).data.tier as BonusTier
          assert.equal(Math.round(event.data.amount * 100), triggerCents + bonusCents)
          assert.equal(
            event.data.winLevel,
            calculateWinLevel((triggerCents + bonusCents) / 100),
          )
          assert.ok(event.data.amount >= bonusMinimum(mode, tier))
        }
      }
      assert.ok(settled && !awaitingSetWin && !awaitingSetTotal)
      if (lastWilds.length)
        assert.ok(!movementOccurred, "Terminal feature spin emitted collection movement")

      assert.equal(totalCents, book.payoutMultiplier)
      if (totalCents > 0) {
        assert.equal(book.events.at(-1).type, "finalWin")
        assert.equal(Math.round(book.events.at(-1).data.amount * 100), totalCents)
      } else {
        assert.ok(
          book.events.every((e: { type: string }) => e.type !== "finalWin"),
          "Zero-payout rounds emit no finalWin",
        )
      }
      const segment = criteria.get(book.id)!
      const bonusPayout =
        book.events.find((e: any) => e.type === "freeSpinEnd")?.data.amount ?? 0
      close(segment.base + segment.bonus, totalCents / 100, "Native segmented LUT total")
      close(segment.bonus, bonusCents / 100, "Native wallet free-spin attribution")
      if (book.events.some((e: any) => e.type === "freeSpinEnd"))
        close(bonusPayout, totalCents / 100, "Feature total includes the trigger spin")
      weighted.push({
        bucket: segment.bucket,
        payout: totalCents / 100,
        bonusPayout,
        initialUpgrades: Object.keys(
          book.events.find((e: any) => e.type === "featureStart")?.data.upgrades ?? {},
        ).map(Number),
        weight: lookup.weight,
      })
      totalWeight += lookup.weight
      totalPaid += (lookup.weight * totalCents) / 100
      if (totalCents > 0) hits += lookup.weight
      if (totalCents >= MODES[mode].cost * 100) breakEvens += lookup.weight
    }
    const stats = {
      ...analyze(mode, weighted),
      lookupSha256: createHash("sha256").update(csv).digest("hex"),
    }
    report.modes[mode] = stats
    assert.equal(seen.size, lut.size)
    // Integer lookup weights can leave a sub-millionth rounding residual.
    close(totalPaid / totalWeight / MODES[mode].cost, DESIGN.rtp, mode + " RTP", 1e-7)
    close(hits / totalWeight, HIT_TARGETS[mode], mode + " hit rate")
    close(breakEvens / totalWeight, stats.breakEvenRate, mode + " measured break-even")
    const belowCostTarget = BELOW_COST_TARGETS[mode]
    if (belowCostTarget !== undefined)
      close(1 - stats.breakEvenRate, belowCostTarget, mode + " below-cost probability")
    for (const tier of ["normal", "super", "hidden"] as const) {
      const probability = mathBuckets(mode)
        .filter((b) => b.tier === tier)
        .reduce((sum, b) => sum + b.probability, 0)
      if (probability)
        close(
          stats.tiers[tier].probability,
          probability,
          mode + "/" + tier + " trigger probability",
        )
    }
    if (mode === "featureSpin") {
      for (const count of [1, 2, 3, 4] as const) {
        const actual = Object.entries(stats.startingUpgrades)
          .filter(([key]) => key.split("+").filter(Boolean).length === count)
          .reduce((sum, [, probability]) => sum + Number(probability), 0)
        const expected = mathBuckets(mode)
          .filter((bucket) => bucket.startingUpgradeCount === count)
          .reduce((sum, bucket) => sum + bucket.probability, 0)
        close(actual, expected, `featureSpin ${count}-upgrade probability`)
      }
    }
    totalAudited += seen.size
    console.log(
      mode +
        ": audited " +
        seen.size +
        " compressed books, boards, payouts, and LUT entries",
    )
  }
  fs.writeFileSync(
    path.join(output, "math-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  )
  writeSummary(totalAudited)
}
function normalizeWin(win: ClusterWin) {
  return {
    ...win,
    positions: [...win.positions].sort(([ax, ay], [bx, by]) => ax - bx || ay - by),
  }
}
function writeSummary(totalAudited: number) {
  const rows = [
    "# ButchEm calibration",
    "",
    "Current model: additive wild multipliers, 96% RTP, and base bonus frequencies 1/300 regular, 1/3000 super, 1/75000 hidden. Below-cost targets use the panel Payout < Bet metric; cost recovery is its complement.",
    "",
    "Generated by Slot Engine simulation and optimization; independently checked by the audit script. Statistics describe this development build.",
    "",
    "Audited: " + report.generatedAt,
    "",
    "| Mode | Books | RTP | Hit rate | Below cost | Cost recovery | Mean payout | Median | SD / mode cost |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ]
  for (const [mode, s] of Object.entries(report.modes) as [string, any][]) {
    rows.push(
      "| " +
        [
          mode,
          s.books,
          (100 * s.rtp).toFixed(5) + "%",
          (100 * s.hitRate).toFixed(2) + "%",
          (100 * (1 - s.breakEvenRate)).toFixed(2) + "%",
          (100 * s.breakEvenRate).toFixed(2) + "%",
          s.average.toFixed(2) + "x",
          s.quantiles["0.5"] + "x",
          s.standardDeviationInModeCosts.toFixed(3),
        ].join(" | ") +
        " |",
    )
  }
  rows.push(
    "",
    "## Triggered bonus distributions",
    "",
    "Bonus-only means exclude the triggering-spin award; the budget targets the total triggered round.",
    "",
    "| Mode / tier | One in | Minimum | Mean | P25 | Median | P75 | P90 |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  )
  for (const mode of ["base", "extraChance", "extraChance2"]) {
    for (const [tier, s] of Object.entries(report.modes[mode].tiers) as [string, any][]) {
      rows.push(
        "| " +
          [
            mode + " / " + tier,
            Math.round(s.oneIn).toLocaleString("en-US"),
            s.minimum.toFixed(2) + "x",
            s.average.toFixed(2) + "x",
            s.quantiles["0.25"] + "x",
            s.quantiles["0.5"] + "x",
            s.quantiles["0.75"] + "x",
            s.quantiles["0.9"] + "x",
          ].join(" | ") +
          " |",
      )
    }
  }
  rows.push("", "## Returned value below 3000x", "")
  for (const [mode, s] of Object.entries(report.modes) as [string, any][]) {
    const share =
      s.payoutBands
        .filter((b: any) => b.max < 3000)
        .reduce((sum: number, b: any) => sum + b.rtp, 0) / s.rtp
    rows.push("- " + mode + ": " + (100 * share).toFixed(2) + "%")
  }
  rows.push(
    "",
    "## Validation and artifacts",
    "",
    "- " +
      totalAudited.toLocaleString("en-US") +
      " compressed books independently decompressed and checked against their lookup tables.",
    "- Shared event names/payloads checked; every serialized winInfo award recomputed from its reveal board and participating wild identities.",
    "- Zero-padding, bounded repositioning and collection paths with uniform steps, full-footprint pickups, shared meters, upgrade multipliers, movement ordering, bonus minima, and the 10000x cap checked.",
    "- Weighted RTP, hit rates, trigger probabilities, break-even measurements, and lookup hashes verified.",
    "- Native ResultSet quotas provide candidate coverage; optimized lookup weights determine player probabilities.",
    "- Starting upgrades are random without duplicates. featureSpin starts with 1/2/3/4 upgrades at optimized 70%/15%/10%/5% probabilities.",
    "",
    "[Detailed report](__build__/math-report.json) | [Publish files](__build__/publish_files/index.json)",
    "",
  )
  fs.writeFileSync(path.join(root, "CALIBRATION.md"), rows.join("\n"))
  console.log("Wrote CALIBRATION.md")
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
