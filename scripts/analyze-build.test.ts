import { afterEach, describe, expect, it, vi } from "vitest"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { analyseMode, printMode } from "./analyze-build"

const dirs: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "analyze-build-test-"))
  dirs.push(dir)
  const books = path.join(dir, "books.jsonl")
  const lut = path.join(dir, "lut.csv")
  // Result-set names deliberately differ from the old hardcoded criteria.
  const reveal = { type: "reveal", data: { gameType: "loss" } }
  const win = (amount: number) => ({ type: "setWin", data: { amount } })
  fs.writeFileSync(
    books,
    [
      { id: 1, payoutMultiplier: 0, events: [reveal] },
      { id: 2, payoutMultiplier: 100, events: [reveal, win(1)] },
      { id: 3, payoutMultiplier: 200, events: [reveal, win(2)] },
      {
        id: 4,
        payoutMultiplier: 1000000,
        events: [
          reveal,
          win(1),
          { type: "freeSpinTrigger", data: { tier: "hidden" } },
          { type: "updateFreeSpin" },
          { type: "reveal" },
          win(9999),
          { type: "addAdditionalFreeSpins" },
          { type: "updateFreeSpin" },
          { type: "reveal" },
          // This total includes the trigger win and must not be used as pure FS win.
          { type: "freeSpinEnd", data: { amount: 10000 } },
        ],
      },
    ]
      .map((b) => JSON.stringify(b))
      .join("\n"),
  )
  // LUT is zero based while books are one based.
  fs.writeFileSync(lut, "0,80,0\n1,10,100\n2,5,200\n3,5,1000000\n")
  return { books, lut }
}
describe("build analysis", () => {
  it("assigns triggering plays entirely to bonus totals and keeps individual free spins separate", async () => {
    const f = fixture()
    const a = await analyseMode("base", 2, null, [f.books], f.lut)
    expect(a.total.weight).toBe(100)
    expect(a.total.values.get(0)).toBe(80)
    expect(a.base.sum).toBe(20)
    expect(a.base.weight).toBe(95)
    expect(a.base.count).toBe(3)
    expect(a.base.values.get(1)).toBe(10)
    expect(a.tiers.hidden.rounds.sum).toBe(50000)
    expect(a.tiers.hidden.rounds.values.get(10000)).toBe(5)
    expect(a.tiers.hidden.spins.sum).toBe(49995)
    expect(a.base.weight + a.tiers.hidden.rounds.weight).toBe(a.total.weight)
    expect(a.tiers.hidden.spins.weight).toBe(10)
    expect(a.tiers.hidden.spins.values.get(0)).toBe(5)
    expect(a.tiers.hidden.lengths.values.get(2)).toBe(5)
    expect(a.tiers.hidden.retriggerWeight).toBe(5)
    expect(a.base.sum + a.tiers.hidden.rounds.sum).toBe(a.total.sum)
    const lines: string[] = []
    vi.spyOn(console, "log").mockImplementation((value) => {
      lines.push(String(value))
    })
    printMode(a)
    const report = lines.join("\n")
    expect(report).toContain("Null Hit Rate: 80.0000% (1 in 1.25")
    expect(report).toContain("Non-Zero Hit Rate: 20.0000% (1 in 5.00")
    expect(report).toContain("Any Bonus Entry: 5.0000% (1 in 20.00")
    expect(report).toContain(
      "Highest Published Payout: 10000.00x base bet | Frequency: 1 in 20.00",
    )
    expect(report).toMatch(/1x - <2x\s+10.0000%/)
    expect(report).toMatch(/2x - <5x\s+5.0000%/)
    expect(report).toMatch(/10kx\+\s+5.0000%/)
    const baseSection = report
      .split("Base Game - Payout Distribution")[1]
      .split("Hidden Bonus Free Spins")[0]
    expect(baseSection).toMatch(/1x - <2x\s+10.5263%/)
    expect(baseSection).toContain("non-bonus plays only")
    const bonusSection = report
      .split("Total Bonus Play Payout Distribution")[1]
      .split("Individual Free-Spin Payout Distribution")[0]
    expect(bonusSection).toMatch(/10kx\+\s+100.0000%/)
    expect(report).toContain("Target RTP: unavailable")
    expect(report).not.toContain("Result Set Distribution")
    expect(report).not.toContain("1-0 spins")
    expect(report).toMatch(/1-3 spins\s+100.0000%/)
  })
  it("leaves base payouts empty for a mode containing only bonus plays", async () => {
    const f = fixture()
    const bonusBook = fs.readFileSync(f.books, "utf8").split("\n").at(-1)!
    fs.writeFileSync(f.books, bonusBook)
    fs.writeFileSync(f.lut, "3,5,1000000\n")
    const a = await analyseMode("hiddenBonusFeature", 1000, null, [f.books], f.lut)
    expect(a.base.weight).toBe(0)
    expect(a.base.sum).toBe(0)
    expect(a.tiers.hidden.rounds.sum).toBe(a.total.sum)
    expect(a.tiers.hidden.rounds.weight).toBe(a.total.weight)
    expect(a.tiers.hidden.spins.sum).toBe(49995)
  })
  it("matches comparison ranges at each inclusive lower and exclusive upper boundary", async () => {
    const f = fixture()
    const ranges: Array<[string, number, number]> = [
      [">0x - <0.25x", 0.01, 0.24],
      ["0.25x - <0.5x", 0.25, 0.49],
      ["0.5x - <1x", 0.5, 0.99],
      ["1x - <2x", 1, 1.99],
      ["2x - <5x", 2, 4.99],
      ["5x - <10x", 5, 9.99],
      ["10x - <25x", 10, 24.99],
      ["25x - <50x", 25, 49.99],
      ["50x - <100x", 50, 99.99],
      ["100x - <250x", 100, 249.99],
      ["250x - <500x", 250, 499.99],
      ["500x - <1kx", 500, 999.99],
      ["1kx - <3kx", 1000, 2999.99],
      ["3kx - <5kx", 3000, 4999.99],
      ["5kx - <10kx", 5000, 9999.99],
      ["10kx+", 10000, 11000],
    ]
    const wins = [0, ...ranges.flatMap(([, lower, upper]) => [lower, upper])]
    fs.writeFileSync(
      f.books,
      wins
        .map((amount, id) =>
          JSON.stringify({
            id,
            payoutMultiplier: Math.round(amount * 100),
            events: [{ type: "reveal" }, { type: "setWin", data: { amount } }],
          }),
        )
        .join("\n"),
    )
    fs.writeFileSync(
      f.lut,
      wins.map((amount, id) => `${id},1,${Math.round(amount * 100)}`).join("\n"),
    )
    const a = await analyseMode("base", 1, null, [f.books], f.lut)
    const lines: string[] = []
    vi.spyOn(console, "log").mockImplementation((value) => {
      lines.push(String(value))
    })
    printMode(a)
    const totalSection = lines
      .join("\n")
      .split("Entire Mode - Total Payout Distribution")[1]
      .split("Base Game - Payout Distribution")[0]
    const rows = totalSection.split("\n")
    expect(rows.find((row) => row.trimStart().startsWith("0x "))).toContain("3.0303%")
    for (const [label] of ranges) {
      expect(rows.find((row) => row.trimStart().startsWith(label + " "))).toContain(
        "6.0606%",
      )
    }
  })
  it("rejects missing positive-weight books instead of renormalizing a partial mode", async () => {
    const f = fixture()
    fs.appendFileSync(f.lut, "4,1,0\n")
    await expect(analyseMode("base", 1, null, [f.books], f.lut)).rejects.toThrow(
      "has no book",
    )
  })
  it("rejects mismatched published payouts", async () => {
    const f = fixture()
    fs.writeFileSync(
      f.lut,
      fs.readFileSync(f.lut, "utf8").replace("1,10,100", "1,10,200"),
    )
    await expect(analyseMode("base", 1, null, [f.books], f.lut)).rejects.toThrow(
      "payout mismatch",
    )
  })
  it("rejects event totals that cannot explain the published payout", async () => {
    const f = fixture()
    fs.writeFileSync(
      f.books,
      fs.readFileSync(f.books, "utf8").replace('"amount":9999', '"amount":9998'),
    )
    await expect(analyseMode("base", 1, null, [f.books], f.lut)).rejects.toThrow(
      "do not reconcile",
    )
  })
})
