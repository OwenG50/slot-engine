import assert from "node:assert/strict"
import { GameEvent, HEIGHT, ModeName, WIDTH } from "./types"

export function wildLaunches(events: readonly GameEvent[], mode: ModeName) {
  let board: string[][] | undefined
  let source = mode === "featureSpin" ? "featureSpin" : "base"
  const launches = []
  for (const event of events) {
    if (event.type === "freeSpinTrigger") {
      assert.ok(["normal", "super", "hidden"].includes(String(event.data.tier)))
      source = `bonus:${event.data.tier}`
    } else if (event.type === "reveal") {
      const cells = event.data.board as { name: string }[][]
      assert.ok(
        Array.isArray(cells) &&
          cells.length === WIDTH &&
          cells.every((reel) => Array.isArray(reel) && reel.length === HEIGHT),
        "Invalid reveal dimensions",
      )
      board = cells.map((reel) => reel.map((cell) => cell.name))
    } else if (event.type === "spawnNewStageWilds") {
      assert.ok(board, "Wild launch without a reveal")
      const wilds = event.data.wilds as {
        reel: number
        row: number
        multiplier: number
      }[]
      assert.ok(Array.isArray(wilds) && wilds.length >= 1 && wilds.length <= 15)
      const multiplier = wilds[0].multiplier
      assert.ok(Number.isFinite(multiplier) && multiplier > 0)
      for (const wild of wilds) {
        assert.ok(Number.isInteger(wild.reel) && wild.reel >= 0 && wild.reel < WIDTH)
        assert.ok(Number.isInteger(wild.row) && wild.row >= 0 && wild.row < HEIGHT)
        assert.equal(wild.multiplier, multiplier, "Mixed multipliers in one launch")
        assert.ok(
          board[wild.reel][wild.row] !== "W" && board[wild.reel][wild.row] !== "S",
          "Launch replaced a protected cell or repeated a position",
        )
        board[wild.reel][wild.row] = "W"
      }
      launches.push({
        source,
        count: wilds.length,
        multiplier,
        fullScreen: board.flat().every((symbol) => symbol === "W"),
      })
    }
  }
  return launches
}
