import assert from "node:assert/strict"
import { createReadStream, readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { createInterface } from "node:readline"
import path from "node:path"
import { FEATURE_RULES, MODES } from "../src/settings"
import { bonusSpinStats } from "../src/bonusSpinStats"
import type { BonusTier, GameEvent } from "../src/types"

async function main() {
  const root = path.resolve(__dirname, "../__build__")
  const report: object[] = []
  const progression = new Map<string, Map<BonusTier, number>>()
  const calibration = JSON.parse(
    readFileSync(path.join(root, "bonus-hit-rate-report.json"), "utf8"),
  ) as {
    hitRatePolicy: string
    modes: Record<
      string,
      {
        sha256: string
        tiers: {
          tier: BonusTier
          hitRate: number
        }[]
      }
    >
  }
  assert.equal(
    calibration.hitRatePolicy,
    "unconstrained",
    "Regenerate bonus calibration without hit-rate targets",
  )
  for (const mode of Object.keys(MODES)) {
    if (mode === "featureSpin") continue
    const calibrationMode = calibration.modes[mode]
    assert.ok(calibrationMode, `${mode}: missing calibration report`)
    const lookupText = readFileSync(
      path.join(root, "publish_files", `lookUpTable_${mode}_0.csv`),
      "utf8",
    )
    assert.equal(
      createHash("sha256").update(lookupText).digest("hex"),
      calibrationMode.sha256,
      `${mode}: stale calibration report`,
    )
    const weights = new Map(
      readFileSync(path.join(root, "publish_files", `lookUpTable_${mode}_0.csv`), "utf8")
        .trim()
        .split(/\r?\n/)
        .map((line) => {
          const [id, weight] = line.split(",").map(Number)
          return [id, weight]
        }),
    )
    const totals = new Map<
      BonusTier,
      {
        mass: number
        spins: number
        hits: number
        high: number
        highLines: number
        paidLines: number
        stages: number[]
      }
    >()
    for await (const line of createInterface({
      input: createReadStream(path.join(root, `books_${mode}.jsonl`)),
      crlfDelay: Infinity,
    })) {
      if (!line.trim()) continue
      const book = JSON.parse(line) as { id: number; events: GameEvent[] }
      const stats = bonusSpinStats(book.events)
      if (!stats.tier) continue
      const weight = weights.get(book.id)
      assert.notEqual(weight, undefined, `${mode}: missing weight for ${book.id}`)
      const t = totals.get(stats.tier) ?? {
        mass: 0,
        spins: 0,
        hits: 0,
        high: 0,
        highLines: 0,
        paidLines: 0,
        stages: [0, 0, 0, 0, 0, 0],
      }
      t.mass += weight!
      t.spins += weight! * stats.spins
      t.hits += weight! * stats.hits
      t.high += weight! * stats.highOnly
      t.highLines += weight! * stats.highLines
      t.paidLines += weight! * stats.paidLines
      for (let i = 0; i < stats.maxStage; i++) t.stages[i] += weight!
      totals.set(stats.tier, t)
    }
    for (const [tier, t] of totals) {
      const hitRate = t.hits / t.spins
      const fitted = calibrationMode.tiers.find((entry) => entry.tier === tier)
      assert.ok(fitted, `${mode}/${tier}: missing calibration result`)
      assert.ok(
        Math.abs(hitRate - fitted.hitRate) < 1e-5,
        `${mode}/${tier}: published rate differs from calibration`,
      )
      const stageReach = t.stages.map((n) => n / t.mass)
      const highestStage = stageReach.map(
        (value, index) => value - (stageReach[index + 1] ?? 0),
      )
      const meanHighestStage = stageReach.reduce((sum, value) => sum + value, 0)
      assert.ok(
        highestStage.every((value) => value >= -1e-12),
        `${mode}/${tier}: invalid highest-stage probabilities`,
      )
      assert.ok(
        Math.abs(highestStage.reduce((sum, value) => sum + value, 0) - 1) < 1e-10,
        `${mode}/${tier}: highest-stage probabilities must sum to one`,
      )
      const modeProgression = progression.get(mode) ?? new Map<BonusTier, number>()
      modeProgression.set(tier, meanHighestStage)
      progression.set(mode, modeProgression)
      const row = {
        mode,
        tier,
        hitRate,
        losingSpinRate: 1 - hitRate,
        highOnlySpinRate: t.high / t.spins,
        highPaidLineShare: t.highLines / t.paidLines,
        meanSpins: t.spins / t.mass,
        stageReach,
        highestStage,
        meanHighestStage,
      }
      report.push(row)
      console.log(JSON.stringify(row))
    }
  }
  const tierOrder: object[] = []
  const assertTierOrder = (entry: string, tiers: Map<BonusTier, number>) => {
    const normal = tiers.get("normal")!,
      superMean = tiers.get("super")!,
      hidden = tiers.get("hidden")!
    assert.ok(
      superMean > normal && hidden > superMean,
      `${entry}: mean highest stage must increase Normal < Super < Hidden; got ${normal}, ${superMean}, ${hidden}`,
    )
    tierOrder.push({ entry, normal, super: superMean, hidden })
  }
  for (const mode of ["base", "extraChance", "extraChance2"])
    assertTierOrder(mode, progression.get(mode)!)
  assertTierOrder(
    "bonusBuys",
    new Map([
      ["normal", progression.get("bonusFeature")!.get("normal")!],
      ["super", progression.get("superBonusFeature")!.get("super")!],
      ["hidden", progression.get("hiddenBonusFeature")!.get("hidden")!],
    ]),
  )
  writeFileSync(
    path.join(root, "bonus-hit-rate-audit.json"),
    JSON.stringify(
      {
        note: "Independently recomputed from generated bonus reveals, win events, and final integer-weight lookup tables; trigger spins excluded.",
        hitRatePolicy: "unconstrained",
        stageThresholds: FEATURE_RULES.stageThresholds,
        bookWeightingPolicy: "full-screen stage targets; exact band mass and mean",
        stagePayoutPolicy: "unconstrained",
        tierOrder,
        results: report,
      },
      null,
      2,
    ),
  )
}
void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
