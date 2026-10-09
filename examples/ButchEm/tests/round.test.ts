import { describe, expect, it, vi } from "vitest"
import { RandomNumberGenerator } from "@slot-engine/core"
import { game } from ".."
import { Context, onHandleGameFlow } from "../src/onHandleGameFlow"
import { RevealSymbol, calculateWinLevel } from "../src/events"
import { evaluateClusters, evaluateWins } from "../src/evaluations"

import * as feature from "../src/feature"
import { movementPaths, RevealedWild, WildMovement } from "../src/collection"
import { FEATURE_RULES } from "../src/settings"
import { PAYTABLE } from "../src/paytable"
import {
  Board,
  BonusTier,
  GameEvent,
  MAX_WIN,
  ModeName,
  PAYING_SYMBOLS,
  Position,
  UpgradeId,
  positionKey,
} from "../src/types"
import { footprint, footprintsOverlap, validAnchors } from "../src/wilds"

const fullH1Payout = PAYTABLE.H1[25]

const fullBoard = (symbol: Board[number][number] = "H1"): Board =>
  Array.from({ length: 5 }, () => Array(5).fill(symbol))

/** Rotate a mixed board's low strip so retries can find clear 2x2 landings.
 * High cells still form a ceiling-paying cluster; lows use checkerboard filler. */
function roamingBoard(
  symbol: "H1" | "H2" = "H1",
  isolated = false,
  lowWidth = 2,
): () => Board {
  let draws = 0
  return () => {
    const orientation = Math.max(0, ++draws - 2) % 4
    return Array.from({ length: 5 }, (_, x) =>
      Array.from({ length: 5 }, (_, y) => {
        const low = [y < lowWidth, x >= 5 - lowWidth, y >= 5 - lowWidth, x < lowWidth][
          orientation
        ]
        return low
          ? (x + y) % 2
            ? "L3"
            : "L4"
          : isolated
            ? (["H1", "H2", "H3", "H4"] as const)[(x + y) % 4]
            : symbol
      }),
    )
  }
}
const defaultSource = (mode: ModeName) =>
  ["base", "extraChance", "extraChance2"].includes(mode) ? fullBoard : roamingBoard()

/** Service fixture exercises the actual game hook and native ClusterWinType.
 * End-to-end simulation/audit additionally checks the real board and wallet services. */
function fixture(mode: ModeName, source: () => Board = defaultSource(mode), seed = 4) {
  const config = game.getConfig()
  const events: GameEvent[] = []
  const rng = new RandomNumberGenerator()
  rng.setSeed(seed)
  let board = source().map((r) => r.map((id) => config.symbols.get(id)!))
  let spinWin = 0,
    totalWin = 0
  const tier = (
    {
      bonusFeature: "normal",
      superBonusFeature: "super",
      hiddenBonusFeature: "hidden",
    } as Partial<Record<ModeName, BonusTier>>
  )[mode]
  const state = {
    currentGameMode: mode,
    currentSpinType: "basegame",
    currentResultSet: {
      criteria: tier ? tier + "_center" : "baseWin",
      userData: {
        tier,
        profile: "standard",
        ...(mode === "featureSpin" ? { startingUpgradeCount: 1 } : {}),
      },
    },
    userData: { bonusPayout: 0, profile: "standard" },
    currentFreespinAmount: 0,
    totalFreespinAmount: 0,
    triggeredMaxWin: false,
    triggeredFreespins: false,
  }
  const ctx = {
    config,
    state,
    services: {
      rng,
      board: {
        resetBoard() {},
        getRandomReelset: () => [],
        drawBoardWithRandomStops() {
          board = source().map((r) => r.map((id) => config.symbols.get(id)!))
        },
        getReelStopsForSymbol: () => Array.from({ length: 5 }, () => [0]),
        getRandomReelStops(_reels: unknown, stops: number[][], amount: number) {
          const eligible = stops.flatMap((s, reel) => (s.length ? [reel] : []))
          return Object.fromEntries(eligible.slice(0, amount).map((reel) => [reel, 0]))
        },
        drawBoardWithForcedStops({
          forcedStops,
        }: {
          forcedStops: Record<number, number>
        }) {
          board = source().map((r) => r.map((id) => config.symbols.get(id)!))
          for (const reel of Object.keys(forcedStops))
            board[Number(reel)][0] = config.symbols.get("S")!
        },
        getBoardReels: () => board,
        setSymbol(x: number, y: number, symbol: (typeof board)[number][number]) {
          board[x][y] = symbol
        },
      },
      wallet: {
        addSpinWin(amount: number) {
          spinWin += amount
        },
        confirmSpinWin() {
          totalWin += spinWin
          spinWin = 0
        },
        getCurrentWin: () => totalWin,
      },
      game: {
        getFreeSpinsForScatters: () => 10,
        awardFreespins(amount: number) {
          state.currentFreespinAmount += amount
          state.totalFreespinAmount += amount
          state.triggeredFreespins = true
        },
      },
      data: {
        addBookEvent(event: GameEvent) {
          events.push(structuredClone(event))
        },
        tag() {},
        tagSymbolOccurrence() {},
      },
    },
  } as unknown as Context
  return { ctx, events }
}
function run(mode: ModeName, source = defaultSource(mode), upgrades?: UpgradeId[]) {
  const mock = upgrades
    ? vi.spyOn(feature, "randomStartingUpgrades").mockReturnValueOnce(upgrades)
    : undefined
  try {
    const f = fixture(mode, source)
    onHandleGameFlow(f.ctx)
    return f
  } finally {
    mock?.mockRestore()
  }
}

describe.each(["base", "extraChance", "extraChance2"] as const)(
  "%s non-triggering scatter distribution",
  (mode) => {
    it.each([1, 2])("redraws a rejected %i-scatter board from real stops", (count) => {
      const source = vi.fn(() => fullBoard())
      const { ctx, events } = fixture(mode, source)
      const nearMiss = fullBoard()
      for (let reel = 0; reel < count; reel++) nearMiss[reel][0] = "S"
      source.mockClear()
      source.mockReturnValueOnce(nearMiss)
      const roll = vi.spyOn(ctx.services.rng, "randomFloat").mockReturnValue(0.9)
      try {
        onHandleGameFlow(ctx)
        expect(source).toHaveBeenCalledTimes(2)
        expect(roll).toHaveBeenCalledTimes(1)
        const board = events[0].data.board as RevealSymbol[][]
        expect(board.flat().filter((symbol) => symbol.Scatter)).toHaveLength(0)
        expect(events.some((event) => event.type === "freeSpinTrigger")).toBe(false)
      } finally {
        roll.mockRestore()
      }
    })

    it.each([0, 1, 2])("still allows a %i-scatter non-triggering board", (count) => {
      const source = vi.fn(() => {
        const board = fullBoard()
        for (let reel = 0; reel < count; reel++) board[reel][0] = "S"
        return board
      })
      const { ctx, events } = fixture(mode, source)
      source.mockClear()
      const roll = vi.spyOn(ctx.services.rng, "randomFloat").mockReturnValue(0.1)
      try {
        onHandleGameFlow(ctx)
        expect(source).toHaveBeenCalledTimes(1)
        expect(roll).toHaveBeenCalledTimes(count === 0 ? 0 : 1)
        const board = events[0].data.board as RevealSymbol[][]
        expect(board.flat().filter((symbol) => symbol.Scatter)).toHaveLength(count)
        expect(events.some((event) => event.type === "freeSpinTrigger")).toBe(false)
      } finally {
        roll.mockRestore()
      }
    })
  },
)

describe("native ButchEm game flow", () => {
  it("plays one unpadded base reveal with ordinary wilds and no tumbling", () => {
    const { events, ctx } = run("base", () => {
      const board = fullBoard()
      board[0][0] = "W"
      return board
    })
    expect(ctx.services.wallet.getCurrentWin()).toBe(fullH1Payout)
    expect(events.filter((e) => e.type === "reveal")).toHaveLength(1)
    expect(events[0].data).toMatchObject({ upgrades: {}, roamingWilds: [] })
    expect(
      events.some((e) => /tumble|collect|moveRoamingWild|featureStart/.test(e.type)),
    ).toBe(false)
  })
  it("starts each feature with the required upgrade count before its first bonus reveal", () => {
    for (const [mode, count] of [
      ["bonusFeature", 0],
      ["superBonusFeature", 1],
      ["hiddenBonusFeature", 2],
      ["featureSpin", 1],
    ] as const) {
      const { events } = run(mode, () => fullBoard("L1"))
      const start = events.findIndex((e) => e.type === "featureStart")
      expect(Object.keys(events[start].data.upgrades as object)).toHaveLength(count)
      if (mode === "featureSpin") {
        expect(start).toBeLessThan(events.findIndex((e) => e.type === "reveal"))
      } else {
        // Bought bonuses are still triggered from a real base-game reveal.
        expect(events[0].type).toBe("reveal")
        const trigger = events.findIndex((e) => e.type === "freeSpinTrigger")
        expect(trigger).toBeGreaterThan(0)
        expect(start).toBe(trigger + 1)
      }
    }
  })
  it("starts featureSpin with every configured upgrade count and unique random upgrades", () => {
    for (const count of [1, 2, 3, 4]) {
      const f = fixture("featureSpin", () => fullBoard("L1"), 100 + count)
      f.ctx.state.currentResultSet.userData!.startingUpgradeCount = count
      onHandleGameFlow(f.ctx)
      const start = f.events.find((event) => event.type === "featureStart")!
      const upgrades = Object.keys(start.data.upgrades as object).map(Number)
      expect(upgrades).toHaveLength(count)
      expect(new Set(upgrades).size).toBe(count)
      expect(upgrades.every((id) => id >= 1 && id <= 4)).toBe(true)
      const wilds = start.data.roamingWilds as RevealedWild[]
      expect(wilds).toHaveLength(upgrades.includes(2) ? 2 : 1)
      expect(
        wilds.every((wild) => wild.size === (upgrades.includes(1) ? "2" : "1")),
      ).toBe(true)
    }
  })
  it("can reach the 10000x cap in featureSpin with all four upgrades", () => {
    const f = fixture("featureSpin", roamingBoard(), 104)
    f.ctx.state.currentResultSet.userData!.startingUpgradeCount = 4
    onHandleGameFlow(f.ctx)
    expect(f.ctx.services.wallet.getCurrentWin()).toBe(MAX_WIN)
    expect(f.events.at(-1)).toEqual({ type: "finalWin", data: { amount: MAX_WIN } })
  })
  it("redraws oversized and two-symbol forced boards and pays max win on a mixed 15-cell cluster", () => {
    const mixed: Board = Array.from({ length: 5 }, (_, x) =>
      Array.from({ length: 5 }, (_, y) =>
        y < 3 ? "H1" : (x + y) % 2 === 0 ? "L3" : "L4",
      ),
    )
    const oversized = mixed.map((column) => [...column])
    oversized[0][3] = "H1"
    const twoSymbols = mixed.map((column) =>
      column.map((id) => (id === "H1" ? id : "L3")),
    ) as Board
    const source = vi.fn(() => mixed)
    const { ctx, events } = fixture("featureSpin", source)
    ctx.state.currentResultSet.forceMaxWin = true
    ctx.state.currentResultSet.userData!.profile = "maxwin"
    ctx.state.currentResultSet.userData!.startingUpgradeCount = 4
    source.mockClear()
    source.mockReturnValueOnce(oversized).mockReturnValueOnce(twoSymbols)
    const initial = vi.spyOn(feature, "startFeature").mockReturnValueOnce({
      upgrades: { 1: true, 2: true, 3: true, 4: true },
      collected: { 1: 0, 2: 0, 3: 0, 4: 0 },
      anchors: [
        [0, 3],
        [3, 3],
      ],
    })
    const roaming = vi
      .spyOn(feature, "roam")
      .mockImplementation((state, rules, _rng, sourceBoard) => {
        const anchors: Position[] = [
          [1, 4],
          [3, 4],
        ]
        const paths: Position[][] = [
          [state.anchors[0], [1, 3], anchors[0]],
          [state.anchors[1], anchors[1]],
        ]
        const wilds = anchors.map((anchor, index) => ({
          ...feature.activeEffects(state, rules),
          positions: paths[index],
          roamingWildIndex: index,
          steps: paths[index].map(([reel, row]) => ({
            reel,
            row,
            symbols: footprint([reel, row], "2").map(([reel, row]) => ({
              reel,
              row,
              symbol: sourceBoard[reel][row],
              collected: false,
            })),
          })),
          collectedSymbols: [],
          collectedCount: 0,
        }))
        state.anchors = anchors
        return wilds
      })
    try {
      onHandleGameFlow(ctx)
      expect(source).toHaveBeenCalledTimes(3)
      expect(ctx.services.wallet.getCurrentWin()).toBe(MAX_WIN)
      const reveal = events.find((event) => event.type === "reveal")!
      const names = (reveal.data.board as RevealSymbol[][]).flat().map((s) => s.name)
      expect(new Set(names).size).toBeGreaterThanOrEqual(3)
      expect(names.filter((id) => id === "H1").length).toBeLessThanOrEqual(15)
      expect(events.find((event) => event.type === "winInfo")?.data).toMatchObject({
        totalWin: MAX_WIN,
        wins: expect.arrayContaining([
          expect.objectContaining({ symbol: "H1", kind: 23 }),
        ]),
      })
      expect(events.at(-1)).toEqual({ type: "finalWin", data: { amount: MAX_WIN } })
    } finally {
      roaming.mockRestore()
      initial.mockRestore()
    }
  })
  it("repositions before every reveal and collects only before a following spin", () => {
    const { events, ctx } = run("bonusFeature", () => fullBoard("L1"))
    expect(ctx.state.totalFreespinAmount).toBe(10)
    expect(ctx.state.currentFreespinAmount).toBe(0)
    const reveals = events.filter((event) => event.type === "reveal")
    expect(reveals).toHaveLength(11)
    expect(reveals[0].data.roamingWilds).toEqual([])
    expect(events.filter((event) => event.type === "collect")).toHaveLength(0)
    expect(events.filter((event) => event.type === "moveRoamingWild")).toHaveLength(9)
    let current = (
      events.find((event) => event.type === "featureStart")!.data
        .roamingWilds as RevealedWild[]
    ).map((wild) => [wild.steps[0].reel, wild.steps[0].row] as Position)
    for (let spin = 1; spin < reveals.length; spin++) {
      const reveal = reveals[spin]
      const wilds = reveal.data.roamingWilds as RevealedWild[]
      for (const wild of wilds) {
        const path = wild.steps.map(({ reel, row }): Position => [reel, row])
        expect(wild).not.toHaveProperty("positions")
        expect(path[0]).toEqual(current[wild.roamingWildIndex])
        expect(
          movementPaths(
            path[0],
            current.filter((_, index) => index !== wild.roamingWildIndex),
            wild.size,
          ),
        ).toContainEqual(path)
        expect(wild.collectedCount).toBe(0)
        expect(wild.collectedSymbols).toEqual([])
        expect(
          wild.steps.every((step) => step.symbols.every((cell) => !cell.collected)),
        ).toBe(true)
        current[wild.roamingWildIndex] = path.at(-1)!
      }
      const start = events.indexOf(reveal)
      const end =
        spin + 1 < reveals.length ? events.indexOf(reveals[spin + 1]) : events.length
      const movementEvents = events
        .slice(start, end)
        .filter((event) => event.type === "moveRoamingWild")
      expect(movementEvents).toHaveLength(spin === reveals.length - 1 ? 0 : 1)
      if (spin === reveals.length - 1) continue
      expect(movementEvents[0].data).not.toHaveProperty("required")
      const movements = movementEvents[0].data.movements as WildMovement[]
      for (const movement of movements) {
        const path = movement.steps.map(({ reel, row }): Position => [reel, row])
        expect(path[0]).toEqual(current[movement.roamingWildIndex])
        expect(movementPaths(path[0], [], movement.size)).toContainEqual(path)
        expect(movement.collectedCount).toBe(0)
        current[movement.roamingWildIndex] = path.at(-1)!
      }
    }
  })

  it("moves after win settlement and commits upgrades before the following reveal", () => {
    const { events } = run("bonusFeature")
    const unlock = events.findIndex((event) => event.type === "upgradeUnlocked")
    expect(unlock).toBeGreaterThan(0)
    expect(events[unlock].data).toMatchObject({ upgrade: 1, size: "2" })
    expect(events[unlock - 1].type).toBe("moveRoamingWild")
    for (const movement of events[unlock - 1].data.movements as WildMovement[])
      expect(movement.size).toBe("1")
    const next = events.slice(unlock + 1).find((event) => event.type === "reveal")!
    expect(next.data.upgrades).toEqual({ 1: true })
    for (const wild of next.data.roamingWilds as RevealedWild[])
      expect(
        footprint([wild.steps.at(-1)!.reel, wild.steps.at(-1)!.row], wild.size),
      ).toHaveLength(4)
    for (let index = 0; index < events.length; index++)
      if (events[index].type === "moveRoamingWild")
        expect(events[index - 1].type).toBe("setTotalWin")
    expect(events.filter((event) => event.type === "upgradeUnlocked")).toHaveLength(1)
  })

  it("moves and credits isolated nonwinning H cells, retaining their exact source symbols", () => {
    const draw = roamingBoard("H1", true)
    const sourceBoards: Board[] = []
    const source = () => {
      const board = draw()
      sourceBoards.push(structuredClone(board))
      return board
    }
    const { events } = run("bonusFeature", source)
    // More legal routes change seeded choices; a randomly chosen route can
    // cross only lows. Inspect a real pickup and its own preceding reveal.
    const movement = events.find(
      (event) =>
        event.type === "moveRoamingWild" &&
        (event.data.movements as WildMovement[]).some((truck) => truck.collectedCount > 0),
    )!
    expect(movement).toBeDefined()
    const reveal = events
      .slice(0, events.indexOf(movement))
      .reverse()
      .find((event) => event.type === "reveal")!
    expect(
      events
        .slice(events.indexOf(reveal), events.indexOf(movement))
        .some((event) => event.type === "winInfo"),
    ).toBe(false)
    const drawn = reveal.data.board as RevealSymbol[][]
    expect(sourceBoards).toContainEqual(
      drawn.map((column) => column.map((symbol) => symbol.name)),
    )
    for (const truck of movement.data.movements as WildMovement[])
      for (const step of truck.steps)
        for (const cell of step.symbols)
          expect(cell.symbol).toBe(drawn[cell.reel][cell.row].name)
  })

  it("skips collection and upgrades on terminal spins while retaining reveal roaming", () => {
    for (const mode of [
      "bonusFeature",
      "superBonusFeature",
      "hiddenBonusFeature",
      "featureSpin",
    ] as const) {
      const { events } = run(mode, () => fullBoard("L1"))
      const lastReveal =
        events.length -
        1 -
        [...events].reverse().findIndex((event) => event.type === "reveal")
      expect(
        events
          .slice(lastReveal)
          .filter((event) => ["moveRoamingWild", "upgradeUnlocked"].includes(event.type)),
      ).toHaveLength(0)
      const wilds = events[lastReveal].data.roamingWilds as RevealedWild[]
      expect(wilds.length).toBeGreaterThan(0)
      expect(
        wilds.every((wild) => wild.steps.length >= 2 && wild.collectedCount === 0),
      ).toBe(true)
    }
  })

  it("collects on a last scheduled spin that retriggers and skips the actual final spin", () => {
    let draws = 0
    const { events } = run("bonusFeature", () => {
      const source = fullBoard("L1")
      if (++draws === 12) source[4][0] = "S"
      return source
    })
    const spins = events.filter((event) => event.type === "updateFreeSpin")
    expect(spins).toHaveLength(11)
    expect(events.filter((event) => event.type === "moveRoamingWild")).toHaveLength(10)
    const retrigger = events.findIndex((event) => event.type === "addAdditionalFreeSpins")
    expect(events[retrigger - 1].type).toBe("moveRoamingWild")
    const nextSpin = events.findIndex(
      (event, index) => index > retrigger && event.type === "updateFreeSpin",
    )
    expect(events[nextSpin].data).toEqual({ amount: 11, total: 11 })
    expect(events.slice(nextSpin).some((event) => event.type === "moveRoamingWild")).toBe(
      false,
    )
  })

  it("does not advance an almost-complete meter or unlock it after the final free spin", () => {
    const finalBoard = fullBoard("H3")
    finalBoard[2][2] = "L1"
    const source = vi.fn(() => fullBoard("L1"))
    const f = fixture("bonusFeature", source)
    const state: feature.FeatureState = {
      upgrades: {},
      collected: { 1: 0, 2: 0, 3: 4, 4: 0 },
      anchors: [[0, 1]],
    }
    const initial = vi.spyOn(feature, "startFeature").mockReturnValueOnce(state)
    const spins = vi
      .spyOn(f.ctx.services.game, "getFreeSpinsForScatters")
      .mockReturnValue(1)
    source.mockClear()
    source.mockReturnValueOnce(fullBoard("L1")).mockReturnValueOnce(finalBoard)
    try {
      onHandleGameFlow(f.ctx)
      expect(f.ctx.state.triggeredMaxWin).toBe(false)
      expect(f.ctx.state.currentFreespinAmount).toBe(0)
      expect(f.events.filter((event) => event.type === "updateFreeSpin")).toHaveLength(1)
      expect(
        f.events.some((event) =>
          ["moveRoamingWild", "upgradeUnlocked"].includes(event.type),
        ),
      ).toBe(false)
      expect(state.collected[3]).toBe(4)
      expect(state.upgrades).toEqual({})
      const reveals = f.events.filter((event) => event.type === "reveal")
      const wild = (reveals.at(-1)!.data.roamingWilds as RevealedWild[])[0]
      expect(state.anchors).toEqual([[wild.steps.at(-1)!.reel, wild.steps.at(-1)!.row]])
    } finally {
      spins.mockRestore()
      initial.mockRestore()
    }
  })

  it("emits both trucks once, in playback order, and carries their final anchors forward", () => {
    const { events } = run("hiddenBonusFeature", () => fullBoard("L1"), [1, 2])
    let current: Position[] = []
    for (const event of events) {
      if (event.type === "featureStart")
        current = (event.data.roamingWilds as RevealedWild[]).map(
          (wild) => [wild.steps[0].reel, wild.steps[0].row] as Position,
        )
      if (event.type === "reveal" && (event.data.roamingWilds as unknown[]).length) {
        for (const wild of event.data.roamingWilds as RevealedWild[]) {
          const path = wild.steps.map(({ reel, row }): Position => [reel, row])
          expect(path[0]).toEqual(current[wild.roamingWildIndex])
          expect(
            movementPaths(
              path[0],
              current.filter((_, other) => other !== wild.roamingWildIndex),
              wild.size,
            ),
          ).toContainEqual(path)
          current[wild.roamingWildIndex] = path.at(-1)!
        }
      }
      if (event.type !== "moveRoamingWild") continue
      const movements = event.data.movements as WildMovement[]
      expect(movements.map((movement) => movement.roamingWildIndex)).toEqual([0, 1])
      for (const movement of movements) {
        expect(movement.steps[0]).toMatchObject({
          reel: current[movement.roamingWildIndex][0],
          row: current[movement.roamingWildIndex][1],
        })
        for (const step of movement.steps) {
          const anchor: Position = [step.reel, step.row]
          for (let other = 0; other < current.length; other++)
            if (other !== movement.roamingWildIndex)
              expect(footprintsOverlap(anchor, current[other], movement.size)).toBe(false)
          current[movement.roamingWildIndex] = anchor
        }
      }
    }
  })

  it("adds two 25x wild identities once each and caps the full round", () => {
    const { events, ctx } = run(
      "hiddenBonusFeature",
      roamingBoard("H1", false, 1),
      [2, 3, 4],
    )
    // Trigger spin: the 20-cell H1 cluster pays unmultiplied; scatters land on lows.
    const winInfos = events.filter((e) => e.type === "winInfo")
    expect(winInfos[0].data).toMatchObject({
      totalWin: fullH1Payout,
      wins: [
        { symbol: "H1", kind: 20, meta: { multiplier: 1, winWithoutMult: fullH1Payout } },
      ],
    })
    // Both 1x1 trucks land on lows bordering the 20-cell high cluster.
    // Other low clusters may pay first; the complete spin still reaches the cap.
    expect(winInfos[1].data).toMatchObject({
      totalWin: MAX_WIN - fullH1Payout,
      wins: expect.arrayContaining([
        expect.objectContaining({
          symbol: "H1",
          kind: 22,
          meta: { multiplier: 50, winWithoutMult: fullH1Payout },
        }),
      ]),
    })
    expect(ctx.services.wallet.getCurrentWin()).toBe(MAX_WIN)
    expect(ctx.state.triggeredMaxWin).toBe(true)
    expect(
      events.some((event) => ["moveRoamingWild", "upgradeUnlocked"].includes(event.type)),
    ).toBe(false)
    expect(events.filter((e) => e.type === "reveal")).toHaveLength(2)
    expect(
      events
        .filter((e) => e.type === "winInfo")
        .reduce((s, e) => s + Number(e.data.totalWin), 0),
    ).toBe(MAX_WIN)
    expect(events.at(-1)).toEqual({ type: "finalWin", data: { amount: MAX_WIN } })
  })
  it("replays seeded native flow identically", () => {
    expect(run("hiddenBonusFeature").events).toEqual(run("hiddenBonusFeature").events)
  })
  it("never lets two roaming wilds overlap at any step of any spin", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const mock = vi.spyOn(feature, "randomStartingUpgrades").mockReturnValueOnce([1, 2])
      try {
        const f = fixture("hiddenBonusFeature", () => fullBoard("L1"), seed)
        onHandleGameFlow(f.ctx)
        let checked = 0
        for (const event of f.events.filter((e) => e.type === "reveal")) {
          const wilds = event.data.roamingWilds as RevealedWild[]
          if (wilds.length < 2) continue
          const current = wilds.map(
            (wild): Position => [wild.steps[0].reel, wild.steps[0].row],
          )
          for (const wild of wilds)
            for (const step of wild.steps) {
              current[wild.roamingWildIndex] = [step.reel, step.row]
              const cells = current.flatMap((anchor) =>
                footprint(anchor, wild.size).map(positionKey),
              )
              expect(new Set(cells).size).toBe(cells.length)
              checked++
            }
        }
        expect(checked).toBeGreaterThan(0)
      } finally {
        mock.mockRestore()
      }
    }
  })
  it("repositions off a scatter without rejecting the real strip draw", () => {
    const source = vi.fn(() => fullBoard("L1"))
    const f = fixture("bonusFeature", source)
    const initial = vi.spyOn(feature, "startFeature").mockReturnValueOnce({
      upgrades: {},
      collected: { 1: 0, 2: 0, 3: 0, 4: 0 },
      anchors: [[0, 0]],
    })
    const concealed = fullBoard("L1")
    concealed[0][0] = "S"
    source.mockClear()
    source.mockReturnValueOnce(fullBoard("L1")).mockReturnValueOnce(concealed)
    try {
      onHandleGameFlow(f.ctx)
      expect(source).toHaveBeenCalledTimes(12)
      expect(f.ctx.state.totalFreespinAmount).toBe(11)
      const firstFeatureReveal = f.events.filter((event) => event.type === "reveal")[1]
      expect((firstFeatureReveal.data.board as RevealSymbol[][])[0][0].name).toBe("S")
      for (const event of f.events.filter((event) => event.type === "reveal")) {
        const board = event.data.board as RevealSymbol[][]
        for (const wild of event.data.roamingWilds as RevealedWild[])
          for (const [x, y] of footprint(
            [wild.steps.at(-1)!.reel, wild.steps.at(-1)!.row],
            wild.size,
          ))
            expect(board[x][y].name).not.toBe("S")
      }
    } finally {
      initial.mockRestore()
    }
  })
  it.each([
    { size: "1" as const, anchors: [[0, 1]] as Position[], upgrades: {} },
    {
      size: "2" as const,
      anchors: [[0, 1]] as Position[],
      upgrades: { 1: true as const },
    },
    {
      size: "2" as const,
      anchors: [
        [0, 1],
        [3, 4],
      ] as Position[],
      upgrades: { 1: true as const, 2: true as const },
    },
  ])(
    "redraws H-only boards before revealing $size trucks without hiding or replacing animals",
    ({ anchors, upgrades }) => {
      const source = vi.fn(() => fullBoard("L1"))
      const f = fixture("bonusFeature", source)
      const initial = vi.spyOn(feature, "startFeature").mockReturnValueOnce({
        upgrades,
        anchors,
        collected: { 1: 0, 2: 0, 3: 0, 4: 0 },
      })
      source.mockClear()
      source.mockReturnValueOnce(fullBoard("L1")) // Base trigger.
      for (const symbol of ["H1", "H2", "H3", "H4"] as const)
        source.mockReturnValueOnce(fullBoard(symbol)) // No valid reveal landing.
      try {
        onHandleGameFlow(f.ctx)
        expect(source).toHaveBeenCalledTimes(15) // 11 accepted draws + 4 retries.
        const reveals = f.events.filter((event) => event.type === "reveal").slice(1)
        expect(reveals).toHaveLength(10)
        for (const reveal of reveals) {
          const board = reveal.data.board as RevealSymbol[][]
          expect(board.flat().every((cell) => cell.name === "L1")).toBe(true)
          for (const wild of reveal.data.roamingWilds as RevealedWild[]) {
            const final = wild.steps.at(-1)!
            for (const [x, y] of footprint([final.reel, final.row], wild.size))
              expect(board[x][y].name.startsWith("H")).toBe(false)
            expect(wild.collectedCount).toBe(0)
          }
        }
        for (const event of f.events.filter((event) => event.type === "moveRoamingWild"))
          expect(event.data.collected).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0 })
      } finally {
        initial.mockRestore()
      }
    },
  )

  it.each(["1", "2"] as const)(
    "accepts a size-%s reveal with no H-free collection exit without extra draws",
    (size) => {
      const board = fullBoard("H1")
      for (const [x, y] of footprint([2, 2], size)) board[x][y] = "L1"
      const source = vi.fn(() => fullBoard("L1"))
      const f = fixture("bonusFeature", source)
      const initial = vi.spyOn(feature, "startFeature").mockReturnValueOnce({
        upgrades: size === "2" ? { 1: true } : {},
        anchors: [[0, 1]],
        collected: { 1: 0, 2: 0, 3: 0, 4: 0 },
      })
      source.mockClear()
      source.mockReturnValueOnce(fullBoard("L1")).mockReturnValueOnce(board)
      try {
        onHandleGameFlow(f.ctx)
        expect(source).toHaveBeenCalledTimes(11)
        const reveal = f.events.find(
          (event) =>
            event.type === "reveal" &&
            (event.data.roamingWilds as RevealedWild[]).length > 0,
        )!
        const wild = (reveal.data.roamingWilds as RevealedWild[])[0]
        expect(wild.steps.at(-1)!.symbols.every((cell) => cell.symbol === "L1")).toBe(
          true,
        )
        const movementEvent = f.events.find((event) => event.type === "moveRoamingWild")!
        const movement = (movementEvent.data.movements as WildMovement[])[0]
        expect(movement.steps.at(-1)!.symbols.some((cell) => cell.symbol === "H1")).toBe(
          true,
        )
        expect(movement.collectedCount).toBeGreaterThan(0)
      } finally {
        initial.mockRestore()
      }
    },
  )

  it("offers only clear 2x2 spawn footprints at every existing wild anchor", () => {
    for (const anchor of validAnchors("2")) {
      const occupied = new Set(footprint(anchor, "2").map((cell) => cell.join(",")))
      const state: feature.FeatureState = {
        upgrades: { 1: true },
        collected: { 1: 0, 2: 0, 3: 0, 4: 0 },
        anchors: [anchor],
      }
      let choices = 0
      const rng: feature.RandomSource = {
        randomFloat: () => 0,
        randomItem<T>(items: T[]): T {
          choices++
          expect(items.length).toBeGreaterThan(0)
          for (const candidate of items as Position[])
            for (const cell of footprint(candidate, "2"))
              expect(occupied.has(cell.join(","))).toBe(false)
          return items[items.length - 1]
        },
      }
      feature.unlockUpgrade(state, 2, FEATURE_RULES, rng)
      expect(choices).toBe(1)
      expect(state.anchors).toHaveLength(2)
      expect(state.anchors[0]).toEqual(anchor)
      expect(
        new Set(
          state.anchors.flatMap((position) =>
            footprint(position, "2").map((cell) => cell.join(",")),
          ),
        ).size,
      ).toBe(8)
    }
  })
  it("emits a clear second-wild spawn after collection by an expanded wild", () => {
    const { events } = run("superBonusFeature", roamingBoard("H2"), [1])
    const spawnIndex = events.findIndex(
      (event) => event.type === "upgradeUnlocked" && event.data.upgrade === 2,
    )
    expect(spawnIndex).toBeGreaterThan(0)
    const spawn = events[spawnIndex]
    expect(spawn.data.size).toBe("2")
    const anchors = spawn.data.roamingWildPositions as Position[]
    expect(anchors).toHaveLength(2)
    const lastCollect = events
      .slice(0, spawnIndex)
      .filter((event) => event.type === "moveRoamingWild")
      .at(-1)!
    const lastStep = (lastCollect.data.movements as WildMovement[])[0].steps.at(-1)!
    expect(anchors[0]).toEqual([lastStep.reel, lastStep.row])
    const cells = anchors.flatMap((anchor) =>
      footprint(anchor, "2").map((cell) => cell.join(",")),
    )
    expect(new Set(cells).size).toBe(8)
    const nextReveal = events
      .slice(spawnIndex + 1)
      .find((event) => event.type === "reveal")!
    const wilds = nextReveal.data.roamingWilds as RevealedWild[]
    expect(
      wilds.map((wild) => [wild.steps[0].reel, wild.steps[0].row] as Position),
    ).toEqual(anchors)
    expect(wilds.map((wild) => wild.size)).toEqual(["2", "2"])
  })
  it("relocates a wild when a size upgrade would make the two overlap", () => {
    const rng = new RandomNumberGenerator()
    rng.setSeed(1)
    for (let i = 0; i < 100; i++) {
      const state: feature.FeatureState = {
        upgrades: { 2: true },
        collected: { 1: 0, 2: 0, 3: 0, 4: 0 },
        anchors: [
          [2, 2],
          [3, 2],
        ],
      }
      feature.unlockUpgrade(state, 1, FEATURE_RULES, rng)
      expect(state.anchors).toHaveLength(2)
      expect(footprintsOverlap(state.anchors[0], state.anchors[1], "2")).toBe(false)
    }
  })
})

it("native clusters agree with an independent flood fill, including shared wilds", () => {
  const rng = new RandomNumberGenerator()
  rng.setSeed(7831)
  const normalize = (wins: ReturnType<typeof evaluateClusters>) =>
    wins
      .map((win) => ({
        ...win,
        positions: [...win.positions].sort(([ax, ay], [bx, by]) => ax - bx || ay - by),
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  for (let i = 0; i < 1000; i++) {
    const focus = rng.randomItem([...PAYING_SYMBOLS])
    const source = () =>
      Array.from({ length: 5 }, () =>
        Array.from({ length: 5 }, () =>
          rng.randomItem([focus, focus, focus, "W", ...PAYING_SYMBOLS]),
        ),
      ) as Board
    const board = source()
    const { ctx } = fixture("base", () => board)
    expect(normalize(evaluateWins(ctx, []))).toEqual(normalize(evaluateClusters(board)))
  }
})

describe("shared frontend event contract", () => {
  it("groups all clusters into one winInfo while allowing a shared wild", () => {
    const { events } = run("base", () => {
      // Non-clustering checkerboard filler; scatters now live on the reels so
      // an all-scatter filler would never pass the organic near-miss cap.
      const board = Array.from({ length: 5 }, (_, x) =>
        Array.from({ length: 5 }, (_, y) => ((x + y) % 2 ? "L1" : "L2")),
      ) as Board
      board[2][2] = "W"
      for (const [x, y] of [
        [0, 2],
        [1, 2],
        [1, 1],
        [0, 1],
      ])
        board[x][y] = "H1"
      for (const [x, y] of [
        [3, 2],
        [4, 2],
        [3, 3],
        [4, 3],
      ])
        board[x][y] = "H3"
      return board
    })
    const info = events.filter((e) => e.type === "winInfo")
    const sharedWildWin = PAYTABLE.H1[5] + PAYTABLE.H3[5]
    expect(info).toHaveLength(1)
    expect(info[0].data.totalWin).toBe(sharedWildWin)
    const wins = info[0].data.wins as {
      symbol: string
      positions: { reel: number; row: number }[]
    }[]
    expect(wins.map((win) => win.symbol).sort()).toEqual(["H1", "H3"])
    for (const win of wins) expect(win.positions).toContainEqual({ reel: 2, row: 2 })
    expect(events.find((e) => e.type === "setWin")?.data).toEqual({
      amount: sharedWildWin,
      winLevel: 1,
    })
    expect(events.at(-1)?.data).toEqual({ amount: sharedWildWin })
  })

  it("matches the reference games' winning event names, fields, and ordering", () => {
    const { events } = run("base")
    expect(events.map((e) => e.type)).toEqual([
      "reveal",
      "winInfo",
      "setWin",
      "setTotalWin",
      "finalWin",
    ])
    expect(events[0].data).toMatchObject({
      board: Array.from({ length: 5 }, () =>
        Array.from({ length: 5 }, () => ({ name: "H1" })),
      ),
      anticipation: [0, 0, 0, 0, 0],
      upgrades: {},
      roamingWilds: [],
    })
    expect(events[0].data).not.toHaveProperty("gameType")
    expect(events[0].data).not.toHaveProperty("paddingPositions")
    expect(events[0].data).not.toHaveProperty("naturalWilds")
    expect(events[0].data).not.toHaveProperty("spinType")
    expect(events[1].data).toEqual({
      totalWin: fullH1Payout,
      wins: [
        {
          symbol: "H1",
          kind: 25,
          win: fullH1Payout,
          positions: expect.arrayContaining([
            { reel: 0, row: 0 },
            { reel: 4, row: 4 },
          ]),
          meta: { multiplier: 1, winWithoutMult: fullH1Payout },
        },
      ],
    })
    expect(events[2]).toEqual({
      type: "setWin",
      data: { amount: fullH1Payout, winLevel: calculateWinLevel(fullH1Payout) },
    })
    expect(events[3]).toEqual({ type: "setTotalWin", data: { amount: fullH1Payout } })
    expect(events[4]).toEqual({ type: "finalWin", data: { amount: fullH1Payout } })
  })
  it("omits win presentation and finalWin on a losing reveal, like SmokeysStash", () => {
    const { events } = run("base", () =>
      Array.from({ length: 5 }, (_, x) =>
        Array.from({ length: 5 }, (_, y) => ((x + y) % 2 ? "L1" : "L2")),
      ),
    )
    expect(events.map((e) => e.type)).toEqual(["reveal"])
  })
  it("uses free-spin trigger, progress and ending conventions on buys", () => {
    const { events } = run("bonusFeature", () => fullBoard("L1"))
    // A bought bonus is still triggered from a real spin with real scatters.
    expect(events[0].type).toBe("reveal")
    const trigger = events.find((e) => e.type === "freeSpinTrigger")!
    expect(trigger.data).toEqual({
      totalFs: 10,
      tier: "normal",
      positions: [
        { reel: 0, row: 0 },
        { reel: 1, row: 0 },
        { reel: 2, row: 0 },
      ],
    })
    const board = events[0].data.board as RevealSymbol[][]
    for (const { reel, row } of trigger.data.positions as {
      reel: number
      row: number
    }[])
      expect(board[reel][row]).toEqual({ name: "S", Scatter: true })
    expect(events.filter((e) => e.type === "updateFreeSpin").map((e) => e.data)).toEqual(
      Array.from({ length: 10 }, (_, i) => ({ amount: i + 1, total: 10 })),
    )
    // The feature total includes the triggering spin's own win.
    const total = Number(
      events
        .filter((e) => e.type === "setWin")
        .reduce((sum, e) => sum + Number(e.data.amount), 0),
    )
    expect(events.at(-2)).toEqual({
      type: "freeSpinEnd",
      data: { amount: total, winLevel: calculateWinLevel(total) },
    })
    expect(events.at(-1)).toEqual({ type: "finalWin", data: { amount: total } })
  })
  it("awards +1 free spin per scatter landed during the bonus", () => {
    let calls = 0
    const source = (): Board => {
      const board = fullBoard("L1")
      // Draw 1 is the fixture's initial board, draw 2 the trigger spin
      // (scatters come from forced stops), draw 3 the first free spin,
      // which lands one organic scatter.
      if (++calls === 3) board[4][4] = "S"
      return board
    }
    const { events, ctx } = run("bonusFeature", source)
    expect(ctx.state.totalFreespinAmount).toBe(11)
    const retriggers = events.filter((e) => e.type === "addAdditionalFreeSpins")
    expect(retriggers).toHaveLength(1)
    expect(retriggers[0].data).toEqual({
      additionalFs: 1,
      remainingFs: 10,
      totalFs: 11,
      positions: [{ reel: 4, row: 4 }],
    })
    const totals = events
      .filter((e) => e.type === "updateFreeSpin")
      .map((e) => e.data.total)
    expect(totals).toEqual([10, ...Array(10).fill(11)])
  })
  it("reports real triggering scatter positions and preserves the complete round award", () => {
    const { ctx, events } = fixture("base", roamingBoard())
    ctx.state.currentResultSet.userData!.tier = "normal"
    onHandleGameFlow(ctx)
    const trigger = events.find((e) => e.type === "freeSpinTrigger")!
    const first = events[0].data.board as RevealSymbol[][]
    const positions = first.flatMap((r, reel) =>
      r.flatMap((s, row) => (s.Scatter ? [{ reel, row }] : [])),
    )
    expect(positions).toHaveLength(3)
    expect(trigger.data.positions).toEqual(positions)
    expect(trigger.data.totalFs).toBe(10)
    // The feature total includes the trigger spin's own win, like SmokeysStash.
    const allWins = events
      .filter((e) => e.type === "setWin")
      .reduce((s, e) => s + Number(e.data.amount), 0)
    const bonusAward = Number(events.find((e) => e.type === "freeSpinEnd")!.data.amount)
    expect(bonusAward).toBeCloseTo(allWins)
    expect(events.at(-1)?.data.amount).toBeCloseTo(bonusAward)
    const triggerIndex = events.indexOf(trigger)
    const bonusTotals = events.slice(triggerIndex).filter((e) => e.type === "setTotalWin")
    expect(bonusTotals.at(-1)?.data.amount).toBe(bonusAward)
  })
  it("uses the game's own presentation bands and max-win tier", () => {
    expect([0, 1, 25, 50, 100, 200, 350, MAX_WIN].map(calculateWinLevel)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ])
    const allowed = new Set([
      "reveal",
      "winInfo",
      "setWin",
      "setTotalWin",
      "freeSpinTrigger",
      "updateFreeSpin",
      "addAdditionalFreeSpins",
      "freeSpinEnd",
      "finalWin",
      "featureStart",
      "moveRoamingWild",
      "upgradeUnlocked",
    ])
    for (const mode of [
      "base",
      "extraChance",
      "extraChance2",
      "featureSpin",
      "bonusFeature",
      "superBonusFeature",
      "hiddenBonusFeature",
    ] as const)
      for (const event of run(mode).events) expect(allowed.has(event.type)).toBe(true)
  })
})
