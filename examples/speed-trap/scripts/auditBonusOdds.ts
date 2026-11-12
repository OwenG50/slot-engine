import assert from "node:assert/strict"
import { createReadStream } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { createInterface } from "node:readline"
import { bonusMinimum, bonusProbability, maxWinProbability } from "../src/math"
import { payoutBands } from "../src/payoutShape"
import { DESIGN, MODES } from "../src/settings"
import { BonusTier, MAX_WIN, ModeName } from "../src/types"
import { capWins, evaluateLines } from "../src/evaluations"
import { RevealSymbol, winInfo } from "../src/events"
import { CarMoveResolution } from "../src/feature"

interface Book {
  id: number
  payoutMultiplier: number
  events: Array<
    | { type: "freeSpinTrigger"; data: { tier: BonusTier } }
    | { type: "reveal"; data: { board: RevealSymbol[][] } }
    | { type: "carMove"; data: CarMoveResolution["event"] }
    | { type: "winInfo"; data: ReturnType<typeof winInfo> }
    | { type: "ignored"; data: Record<string, unknown> }
  >
}

function auditResolvedWins(book: Book) {
  let board: RevealSymbol[][] | undefined
  let observed = winInfo([])
  let paid = 0
  const finishSpin = () => {
    if (!board) return
    const multipliers = new Map<string, number>()
    board.forEach((reel, x) => reel.forEach((cell, y) => {
      if (cell.multiplier && cell.multiplier > 1)
        multipliers.set(`${x}:${y}`, cell.multiplier)
    }))
    const expected = winInfo(capWins(
      evaluateLines(board.map((reel) => reel.map((cell) => cell.name)), multipliers),
      MAX_WIN - paid,
    ))
    assert.deepEqual(observed, expected, `book ${book.id}: wild-trail board differs from line awards`)
    paid += expected.totalWin
    observed = winInfo([])
  }
  for (const event of book.events) {
    if (event.type === "reveal") {
      finishSpin()
      board = structuredClone(event.data.board)
    } else if (event.type === "carMove") {
      assert(board)
      const current = board
      const symbols = event.data.cars.map((car) => current[car.start.reel][car.start.row].name)
      for (const car of event.data.cars)
        for (let reel = Math.min(car.start.reel, car.end.reel);
          reel <= Math.max(car.start.reel, car.end.reel); reel++)
          current[reel][car.start.row] = { name: "W", Wild: true, multiplier: 1 }
      for (const flash of event.data.cameraFlashes ?? [])
        for (const car of flash.doubledCars) {
          const waiting = event.data.cars.some((moving) =>
            moving.start.row > flash.triggeringCar.start.row &&
            moving.start.row === car.position.row &&
            moving.start.reel === car.position.reel)
          if (waiting) continue
          current[car.position.reel][car.position.row].multiplier = car.after
        }
      event.data.cars.forEach((car, index) => {
        current[car.end.reel][car.end.row] = {
          name: symbols[index], Wild: true, multiplier: car.multiplier,
        }
      })
    } else if (event.type === "winInfo") observed = event.data
  }
  finishSpin()
  assert(Math.abs(paid * 100 - book.payoutMultiplier) < 1e-6,
    `book ${book.id}: reconstructed total differs`)
}

function close(actual: number, expected: number, label: string) {
  assert(Math.abs(actual - expected) <= Math.max(2e-10, Math.abs(expected) * 1e-5),
    `${label}: expected ${expected}, got ${actual}`)
}

async function main() {
  const root = path.resolve(__dirname, "..", "__build__")
  for (const mode of Object.keys(MODES) as ModeName[]) {
    const weights = new Map((await readFile(
      path.join(root, "publish_files", `lookUpTable_${mode}_0.csv`), "utf8",
    )).trim().split(/\r?\n/).map((line) => {
      const [id, weight] = line.split(",").map(Number)
      assert(Number.isFinite(weight) && weight >= 0)
      return [id, weight] as const
    }))
    const tiers = { normal: { mass: 0, payout: 0 }, super: { mass: 0, payout: 0 },
      hidden: { mass: 0, payout: 0 } }
    const bands = payoutBands(mode, maxWinProbability(mode))
      .map((band) => ({ ...band, mass: 0, payout: 0 }))
    let mass = 0
    let payout = 0
    let books = 0
    for await (const line of createInterface({
      input: createReadStream(path.join(root, `books_${mode}.jsonl`)),
      crlfDelay: Infinity,
    })) {
      if (!line.trim()) continue
      const book: Book = JSON.parse(line)
      auditResolvedWins(book)
      const weight = weights.get(book.id)
      assert(weight !== undefined, `${mode}: missing weight for ${book.id}`)
      const win = book.payoutMultiplier / 100
      const band = bands.find((item) => win >= item.range[0] && win <= item.range[1])
      assert(band, `${mode}: payout outside configured bands: ${win}`)
      band.mass += weight
      band.payout += weight * win
      mass += weight
      payout += weight * win
      books++
      const triggers = book.events.filter((event) => event.type === "freeSpinTrigger")
      assert(triggers.length <= 1)
      const tier = triggers[0]?.data.tier
      if (tier) {
        assert(win >= bonusMinimum(mode, tier), `${mode}: bonus below minimum`)
        tiers[tier].mass += weight
        tiers[tier].payout += weight * win
      }
      if (MODES[mode].boughtTier) assert.equal(tier, MODES[mode].boughtTier)
    }
    assert(mass > 0 && books === weights.size)
    close(payout / mass / MODES[mode].cost, DESIGN.rtp, `${mode} RTP`)
    for (const band of bands) {
      close(band.mass / mass, band.probability, `${mode} ${band.name} probability`)
      close(band.payout / band.mass, band.average, `${mode} ${band.name} mean`)
    }
    for (const tier of ["normal", "super", "hidden"] as const) {
      const expected = MODES[mode].boughtTier
        ? Number(MODES[mode].boughtTier === tier) : bonusProbability(mode, tier)
      close(tiers[tier].mass / mass, expected, `${mode} ${tier} entry probability`)
      if (expected > 0) console.log(
        `${mode} ${tier}: 1 in ${(mass / tiers[tier].mass).toFixed(3)}, ` +
        `mean ${(tiers[tier].payout / tiers[tier].mass).toFixed(2)}x`,
      )
    }
    const max = bands.find((band) => band.range[0] === MAX_WIN)!
    close(max.mass / mass, maxWinProbability(mode), `${mode} exact max`)
    console.log(`${mode}: ${books} books; wild-trail line awards, bonus odds, floors, bands, max odds, RTP valid`)
  }
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
