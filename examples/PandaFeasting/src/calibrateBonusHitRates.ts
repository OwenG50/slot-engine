import { createReadStream, readFileSync, writeFileSync } from "node:fs"
import { createInterface } from "node:readline"
import path from "node:path"
import { createHash } from "node:crypto"
import { lookupIndex } from "./lookupIndex"
import { bonusSpinStats } from "./bonusSpinStats"
import { fitFullScreenStages } from "./fullScreenWeights"
import { wildLaunches } from "./wildLaunches"
import { optimizationBuckets } from "./math"
import { MODES, FULL_SCREEN_TARGETS, BASE_GAME_EXPLOSION_ONE_IN } from "./settings"
import { MAX_WIN } from "./types"
import type { GameEvent, ModeName } from "./types"

/** Payout weighting pass: preserve bands while balancing full-screen stages.
 * Plan and validate every mode before writing any replacement lookup tables.
 */
export async function calibrateBonusHitRates(root: string) {
  const build = path.join(root, "__build__")
  const pending: {
    filename: string
    text: string
    indexFilename: string
    index: Buffer
  }[] = []
  const report: Record<string, unknown> = {}
  for (const mode of Object.keys(MODES) as ModeName[]) {
    const filename = path.join(build, "publish_files", `lookUpTable_${mode}_0.csv`)
    const rows = readFileSync(filename, "utf8")
      .trim()
      .split(/\r?\n/)
      .map((line) => {
        const [id, weight, cents] = line.split(",").map(Number)
        return { id, weight, cents }
      })
    const total = rows.reduce((sum, row) => sum + row.weight, 0)
    if (!(total > 0) || !Number.isSafeInteger(total))
      throw new Error(`${mode}: invalid lookup weight total`)
    const rowById = new Map(rows.map((row) => [row.id, row]))
    const criteria = new Map(
      readFileSync(path.join(build, `lookUpTableSegmented_${mode}.csv`), "utf8")
        .trim()
        .split(/\r?\n/)
        .map((line) => {
          const [id, name] = line.split(",")
          return [Number(id), name]
        }),
    )
    const stats = new Map<number, ReturnType<typeof bonusSpinStats>>()
    const fullScreens = new Map<number, number[]>()
    const baseExplosions = new Map<number, number>()
    for await (const line of createInterface({
      input: createReadStream(path.join(build, `books_${mode}.jsonl`)),
      crlfDelay: Infinity,
    })) {
      if (!line.trim()) continue
      const book = JSON.parse(line) as {
        id: number
        payoutMultiplier: number
        events: GameEvent[]
      }
      const row = rowById.get(book.id)
      if (!row || row.cents !== book.payoutMultiplier)
        throw new Error(`${mode}: stale lookup/book ${book.id}`)
      const counts = bonusSpinStats(book.events)
      const launches = wildLaunches(book.events, mode)
      fullScreens.set(
        book.id,
        launches.filter((launch) => launch.fullScreen).map((launch) => launch.multiplier),
      )
      baseExplosions.set(
        book.id,
        Number(launches.some((launch) => launch.source === "base")),
      )
      if (counts.tier) stats.set(book.id, counts)
    }
    const replacements = new Map(rows.map((row) => [row.id, row.weight / total]))
    const buckets = optimizationBuckets(mode)
    const summaries: object[] = []
    const bands = buckets.map((bucket) => ({
      name: bucket.name,
      probability: bucket.probability,
      average: bucket.average,
      samples: rows
        .filter(
          (row) =>
            stats.get(row.id)?.tier === bucket.tier &&
            bucket.criteria.includes(criteria.get(row.id)!) &&
            row.cents / 100 >= bucket.range[0] &&
            row.cents / 100 <= bucket.range[1],
        )
        .map((row) => ({
          id: row.id,
          payout: row.cents / 100,
          spins: stats.get(row.id)?.spins ?? 1,
          hits: stats.get(row.id)?.hits ?? Number(row.cents > 0),
          weight: 1,
          fullScreens: fullScreens.get(row.id)!,
        })),
    }))
    const maxWinProbability = buckets
      .filter((bucket) => bucket.range[0] === MAX_WIN)
      .reduce((sum, bucket) => sum + bucket.probability, 0)
    const highStage =
      (FULL_SCREEN_TARGETS.maxWinShare * maxWinProbability) /
      FULL_SCREEN_TARGETS.highStageMultipliers.length
    const targets = new Map(
      [1, 2, 5, 10, 25, 50].map((multiplier) => [
        multiplier,
        (FULL_SCREEN_TARGETS.highStageMultipliers as readonly number[]).includes(
          multiplier,
        )
          ? highStage
          : highStage * FULL_SCREEN_TARGETS.lowStageRatio,
      ]),
    )
    const explosionOneIn =
      mode in BASE_GAME_EXPLOSION_ONE_IN
        ? BASE_GAME_EXPLOSION_ONE_IN[mode as keyof typeof BASE_GAME_EXPLOSION_ONE_IN]
        : undefined
    // Explosion steering uses per-round indicators; bonus statistics stay on `bands`.
    const fitBands =
      explosionOneIn === undefined
        ? bands
        : bands.map((band) => ({
            ...band,
            samples: band.samples.map((sample) => ({
              ...sample,
              spins: 1,
              hits: baseExplosions.get(sample.id)!,
            })),
          }))
    let fit: ReturnType<typeof fitFullScreenStages>
    try {
      fit = fitFullScreenStages(
        fitBands,
        targets,
        explosionOneIn === undefined ? undefined : 1 / explosionOneIn,
      )
    } catch (error) {
      throw new Error(`${mode}: full-screen calibration failed`, { cause: error })
    }
    if (!fit.achieved)
      console.warn(
        `${mode}: full-screen targets constrained after ${fit.iterations} iterations; payout targets preserved`,
      )
    if (explosionOneIn !== undefined && !fit.targetReached)
      console.warn(
        `${mode}: base-game explosion target 1 in ${explosionOneIn} unsupported; using 1 in ${(1 / fit.hitRate).toFixed(1)}`,
      )
    for (const [id, weight] of fit.weights) replacements.set(id, weight)
    const units = 2 ** 50
    const adjusted = rows.map((row) => ({
      ...row,
      weight: Math.round(replacements.get(row.id)! * units),
    }))
    const adjustedTotal = adjusted.reduce((sum, row) => sum + row.weight, 0)
    for (const tier of ["normal", "super", "hidden"] as const) {
      const group = adjusted.filter((row) => stats.get(row.id)?.tier === tier)
      if (!group.length) continue
      const mass = group.reduce((sum, row) => sum + row.weight, 0)
      const sum = (value: (s: ReturnType<typeof bonusSpinStats>) => number) =>
        group.reduce((acc, row) => acc + row.weight * value(stats.get(row.id)!), 0)
      const spins = sum((s) => s.spins),
        hits = sum((s) => s.hits)
      const hitRate = hits / spins
      const floatingGroup = bands
        .flatMap((band) => band.samples)
        .filter((sample) => stats.get(sample.id)?.tier === tier)
      const floatingHits = floatingGroup.reduce(
        (sum, sample) => sum + fit.weights.get(sample.id)! * sample.hits,
        0,
      )
      const floatingSpins = floatingGroup.reduce(
        (sum, sample) => sum + fit.weights.get(sample.id)! * sample.spins,
        0,
      )
      if (Math.abs(hitRate - floatingHits / floatingSpins) > 1e-5)
        throw new Error(`${mode}/${tier}: integer hit-rate validation failed`)
      summaries.push({
        tier,
        books: group.length,
        probability: mass / adjustedTotal,
        hitRate,
        losingSpinRate: 1 - hitRate,
        highOnlySpinRate: sum((s) => s.highOnly) / spins,
        highPaidLineShare: sum((s) => s.highLines) / sum((s) => s.paidLines),
        meanSpins: spins / mass,
        stageReach: [1, 2, 3, 4, 5, 6].map(
          (stage) => sum((s) => Number(s.maxStage >= stage)) / mass,
        ),
      })
    }
    // Check the existing optimizer's payout promises again after integer rounding.
    for (const bucket of buckets) {
      const group = adjusted.filter(
        (row) =>
          bucket.criteria.includes(criteria.get(row.id)!) &&
          row.cents / 100 >= bucket.range[0] &&
          row.cents / 100 <= bucket.range[1],
      )
      const mass = group.reduce((sum, row) => sum + row.weight, 0)
      const mean =
        group.reduce((sum, row) => sum + (row.weight * row.cents) / 100, 0) / mass
      if (
        Math.abs(mass / adjustedTotal - bucket.probability) > 1e-8 ||
        Math.abs(mean - bucket.average) > 0.005
      ) {
        throw new Error(
          `${mode}/${bucket.name}: payout target changed during bonus calibration`,
        )
      }
    }
    const text =
      adjusted.map((row) => `${row.id},${row.weight},${row.cents}`).join("\n") + "\n"
    pending.push({
      filename,
      text,
      indexFilename: path.join(build, `lookUpTable_${mode}.index`),
      index: lookupIndex(text),
    })
    const integerStageMasses = new Map<number, number>()
    for (const row of adjusted)
      for (const multiplier of fullScreens.get(row.id)!)
        integerStageMasses.set(
          multiplier,
          (integerStageMasses.get(multiplier) ?? 0) + row.weight,
        )
    if (
      [...fit.masses].some(
        ([multiplier, mass]) => mass > 0 && !(integerStageMasses.get(multiplier)! > 0),
      )
    )
      throw new Error(`${mode}: full-screen stage support lost during integer rounding`)
    for (const [multiplier, mass] of fit.masses)
      if (Math.abs(integerStageMasses.get(multiplier)! / adjustedTotal / mass - 1) > 1e-3)
        throw new Error(`${mode}: full-screen ${multiplier}x mass changed during rounding`)
    report[mode] = {
      sha256: createHash("sha256").update(text).digest("hex"),
      ...(explosionOneIn === undefined
        ? {}
        : {
            baseGameExplosion: {
              targetOneIn: explosionOneIn,
              reached: fit.targetReached,
              oneIn:
                adjustedTotal /
                adjusted.reduce(
                  (sum, row) => sum + row.weight * baseExplosions.get(row.id)!,
                  0,
                ),
            },
          }),
      fullScreenTargets: {
        achieved: fit.achieved,
        iterations: fit.iterations,
        maxWinProbability,
        targetByMultiplier: Object.fromEntries(targets),
        expectedLaunchesByMultiplier: Object.fromEntries(
          [...integerStageMasses].map(([multiplier, mass]) => [
            multiplier,
            mass / adjustedTotal,
          ]),
        ),
      },
      tiers: summaries,
    }
  }
  for (const file of pending) {
    writeFileSync(file.filename, file.text)
    writeFileSync(file.indexFilename, file.index)
  }
  writeFileSync(
    path.join(build, "bonus-hit-rate-report.json"),
    JSON.stringify(
      {
        hitRatePolicy: "unconstrained",
        bookWeightingPolicy: "full-screen stage targets; exact band mass and mean",
        stageReachPolicy: "unconstrained",
        stagePayoutPolicy: "unconstrained",
        modes: report,
      },
      null,
      2,
    ),
  )
  console.log(
    "Published payouts calibrated with full-screen stage targets. Payout-band probabilities and means preserved.",
  )
}
