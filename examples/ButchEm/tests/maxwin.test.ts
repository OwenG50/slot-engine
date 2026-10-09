import { mkdtempSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { game } from ".."
import { capWins, evaluateClusters } from "../src/evaluations"
import { RevealSymbol } from "../src/events"
import type { RevealedWild } from "../src/collection"
import { clusterMultiplier } from "../src/feature"
import type { Context } from "../src/onHandleGameFlow"
import { MODES } from "../src/settings"
import { Board, MAX_WIN, ModeName, RoamingWild } from "../src/types"
import { applyWilds, footprint } from "../src/wilds"

// Exercise Core's real strip generation, retry loop, and wallet without
// replacing the game's existing books, CSVs, or optimization artifacts.
const simulation = (
  game as unknown as {
    simulation: {
      gameConfig: ReturnType<typeof game.getConfig> & {
        rootDir: string
        outputDir: string
      }
      workerCtx?: Context
      runSingleSimulation(opts: {
        simId: number
        mode: string
        criteria: string
        index: number
      }): void
    }
  }
).simulation
const originalRoot = simulation.gameConfig.rootDir
let temporaryRoot: string

beforeAll(() => {
  temporaryRoot = mkdtempSync(path.join(tmpdir(), "butch-maxwin-"))
  simulation.gameConfig.rootDir = temporaryRoot
  mkdirSync(path.join(temporaryRoot, simulation.gameConfig.outputDir), {
    recursive: true,
  })
  for (const [mode, config] of Object.entries(simulation.gameConfig.gameModes)) {
    for (const reel of config.reelSets.filter((reel) =>
      reel.id.includes("maxwin_mixed"),
    )) {
      reel.associatedGameModeName = mode
      reel.generateReels(simulation.gameConfig)
    }
  }
})

afterAll(() => {
  simulation.gameConfig.rootDir = originalRoot
  if (temporaryRoot) rmSync(temporaryRoot, { recursive: true, force: true })
})

describe("generated max-win rounds", () => {
  let serial = 200000
  for (const mode of Object.keys(MODES) as ModeName[]) {
    it(`${mode} reaches the cap with varied reveals and independently valid wins`, () => {
      const resultSets = simulation.gameConfig.gameModes[mode].resultSets.filter(
        (resultSet) => resultSet.forceMaxWin,
      )
      expect(resultSets.length).toBeGreaterThan(0)
      for (const resultSet of resultSets) {
        for (let round = 0; round < 3; round++) {
          simulation.runSingleSimulation({
            simId: ++serial,
            mode,
            criteria: resultSet.criteria,
            index: 0,
          })
          const ctx = simulation.workerCtx!
          // Core confirms and resets the wallet after writing the book.
          expect(ctx.services.data._getBook().payout).toBe(MAX_WIN * 100)
          let paid = 0
          let expectedWin = 0
          const events = ctx.services.data._getBook().events
          const lastReveal =
            events.length -
            1 -
            [...events].reverse().findIndex((event) => event.type === "reveal")
          expect(
            events
              .slice(lastReveal)
              .some((event) =>
                ["moveRoamingWild", "upgradeUnlocked"].includes(event.type),
              ),
          ).toBe(false)
          for (const event of ctx.services.data._getBook().events) {
            if (event.type === "reveal") {
              const source = (event.data.board as RevealSymbol[][]).map((column) =>
                column.map((symbol) => symbol.name),
              ) as Board
              expect(new Set(source.flat()).size).toBeGreaterThanOrEqual(3)
              const wilds: RoamingWild[] = (
                event.data.roamingWilds as RevealedWild[]
              ).map((wild) => ({
                multiplier: wild.multiplier,
                size: wild.size,
                positions: wild.steps.map(({ reel, row }) => [reel, row]),
              }))
              for (const wild of wilds)
                for (const [x, y] of footprint(wild.positions.at(-1)!, wild.size)) {
                  expect(source[x][y].startsWith("H")).toBe(false)
                  expect(source[x][y]).not.toBe("S")
                }
              const board = applyWilds(source, wilds, false)
              const wins = evaluateClusters(board, (positions) =>
                clusterMultiplier(positions, wilds),
              )
              expectedWin =
                capWins(wins, MAX_WIN - paid).reduce(
                  (sum, win) => sum + Math.round(win.payout * 100),
                  0,
                ) / 100
            }
            if (event.type === "winInfo") {
              expect(event.data.totalWin).toBe(expectedWin)
              paid = Math.round((paid + expectedWin) * 100) / 100
            }
          }
          expect(paid).toBe(MAX_WIN)
        }
      }
    }, 30000)
  }
})
