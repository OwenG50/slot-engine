import { RandomNumberGenerator } from "@slot-engine/core"
import { describe, expect, it } from "vitest"
import { game } from ".."
import { evaluateLines } from "../src/evaluations"
import { bonusLineStops } from "../src/lineSampling"
import { PAYING_SYMBOLS, Board, Stage } from "../src/types"

describe("balanced line-game reel generation", () => {
  const config = (
    game as unknown as {
      simulation: { gameConfig: ReturnType<typeof game.getConfig> }
    }
  ).simulation.gameConfig
  const sets = config.gameModes.base.reelSets
  for (const set of sets) {
    set.associatedGameModeName = "base"
    set.generateReels(config)
  }

  it("uses only the two balanced strips, with no dominant paying symbol on any reel", () => {
    for (const mode of Object.values(config.gameModes)) {
      expect(mode.reelSets.map((set) => set.id)).toEqual([
        "base_lines_v1",
        "bonus_lines_v1",
      ])
      for (const result of mode.resultSets) {
        expect(result.reelWeights.evaluate).toBeUndefined()
        expect(result.userData).not.toHaveProperty("profile")
      }
    }
    for (const set of sets) {
      for (const strip of set.reels) {
        expect(strip.length).toBe(1000)
        for (const symbol of PAYING_SYMBOLS) {
          const frequency =
            strip.filter((cell) => cell.id === symbol).length / strip.length
          expect(frequency).toBeGreaterThan(0.02)
          expect(frequency).toBeLessThan(0.2)
        }
        if (set.id.startsWith("bonus"))
          expect(strip.some((cell) => cell.id === "S")).toBe(false)
        else expect(strip.some((cell) => cell.id === "S")).toBe(true)
      }
    }
  })

  it("produces payable lines from real contiguous windows across all stages", () => {
    const reels = sets.find((set) => set.id === "bonus_lines_v1")!.reels
    const rng = new RandomNumberGenerator()
    rng.setSeed(745)
    const symbols = new Set<string>()
    const lines = new Set<number>()
    for (let sample = 0; sample < 1000; sample++) {
      const stage = ((sample % 5) + 1) as Stage
      const stops = bonusLineStops(reels, rng, stage, sample % 2 === 0)
      const board = reels.map((strip, reel) => {
        const stop = stops[reel] ?? 0
        expect(stop).toBeGreaterThanOrEqual(0)
        expect(stop).toBeLessThan(strip.length)
        return Array.from(
          { length: 3 },
          (_, row) => strip[(stop + row) % strip.length].id,
        )
      }) as Board
      const wins = evaluateLines(board, [])
      expect(wins.length).toBeGreaterThan(0)
      for (const win of wins) {
        symbols.add(win.symbol)
        lines.add(win.line)
      }
    }
    expect([...symbols].sort()).toEqual([...PAYING_SYMBOLS].sort())
    expect(lines.size).toBe(11)
  })
})
