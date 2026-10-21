import { afterEach, describe, expect, it, vi } from "vitest"
import { FEATURE_RULES } from "../src/settings"
import { RevealSymbol } from "../src/events"
import { MAX_WIN } from "../src/types"
import * as feature from "../src/feature"
import { fixture, fullBoard, losingBoard } from "./fixture"

afterEach(() => vi.restoreAllMocks())
// Use scoped property mutation for the deterministic base/bonus tests.
const originalExplosion = FEATURE_RULES.baseExplosionProbability
afterEach(() => {
  FEATURE_RULES.baseExplosionProbability = originalExplosion
})

describe("ButchEm-compatible events", () => {
  it("preserves exact shared event keys, win grouping and payout amounts", () => {
    FEATURE_RULES.baseExplosionProbability = 0
    const { events } = fixture("base").run()
    expect(events.map((event) => event.type)).toEqual([
      "reveal",
      "winInfo",
      "setWin",
      "setTotalWin",
      "finalWin",
    ])
    expect(events[0].data).toEqual({
      board: Array.from({ length: 5 }, () =>
        Array.from({ length: 3 }, () => ({ name: "H1" })),
      ),
      anticipation: [0, 0, 0, 0, 0],
      upgrades: {},
      roamingWilds: [],
    })
    expect(events[1].data.totalWin).toBe(550)
    for (const win of events[1].data.wins as object[])
      expect(Object.keys(win).sort()).toEqual([
        "kind",
        "meta",
        "positions",
        "symbol",
        "win",
      ])
    expect(events.at(-1)).toEqual({ type: "finalWin", data: { amount: 550 } })
  })
  it("emits no payout events on a losing base spin", () => {
    FEATURE_RULES.baseExplosionProbability = 0
    expect(
      fixture("base", losingBoard)
        .run()
        .events.map((event) => event.type),
    ).toEqual(["reveal"])
  })
  it("orders base explosions before reveal, and overlays before wins", () => {
    FEATURE_RULES.baseExplosionProbability = 1
    const { events } = fixture("base").run()
    expect(events.slice(0, 4).map((event) => event.type)).toEqual([
      "triggerExplode",
      "reveal",
      "spawnNewStageWilds",
      "winInfo",
    ])
    expect(
      (events[1].data.board as RevealSymbol[][])
        .flat()
        .every((cell) => cell.name === "H1"),
    ).toBe(true)
    expect(
      (events[2].data.wilds as { multiplier: number }[]).every(
        (wild) => wild.multiplier === 1,
      ),
    ).toBe(true)
  })
  it.each([
    ["normal", 3],
    ["super", 4],
    ["hidden", 5],
  ] as const)(
    "triggers %s with %i visible scatters and five initial spins",
    (tier, count) => {
      FEATURE_RULES.baseExplosionProbability = 0
      const { events } = fixture("base", losingBoard, tier).run()
      const trigger = events.find((event) => event.type === "freeSpinTrigger")!
      expect(trigger.data).toEqual({
        tier,
        totalFs: 5,
        positions: Array.from({ length: count }, (_, reel) => ({ reel, row: 0 })),
      })
      const reveals = events.filter((event) => event.type === "reveal")
      expect(reveals).toHaveLength(6)
      expect(reveals[0].data.anticipation).toEqual([0, 0, 1, 1, 1])
      for (const reveal of reveals.slice(1)) {
        expect(
          (reveal.data.board as RevealSymbol[][])
            .flat()
            .some((cell) => cell.name === "S"),
        ).toBe(false)
        expect(reveal.data.anticipation).toEqual([0, 0, 0, 0, 0])
        expect(reveal.data.bonusTier).toBe(tier)
      }
      expect(
        events
          .filter((event) => event.type === "updateFreeSpin")
          .map((event) => event.data),
      ).toEqual(Array.from({ length: 5 }, (_, i) => ({ amount: i + 1, total: 5 })))
    },
  )
})

describe("explosion eligibility", () => {
  describe.each(["base", "extraChance", "extraChance2"] as const)("%s", (mode) => {
    it.each([
      { roll: 0.02499, explodes: true },
      { roll: 0.025, explodes: false },
    ])("uses the 2.5% boundary for roll $roll", ({ roll, explodes }) => {
      expect(FEATURE_RULES.baseExplosionProbability).toBe(0.025)
      const f = fixture(mode, losingBoard)
      vi.spyOn(f.ctx.services.rng, "randomFloat").mockReturnValue(roll)
      const { events } = f.run()
      expect(events.some((event) => event.type === "triggerExplode")).toBe(explodes)
      expect(events.some((event) => event.type === "spawnNewStageWilds")).toBe(explodes)
    })
    it.each(["normal", "super", "hidden"] as const)(
      "never explodes on a %s bonus trigger, even with the chance forced to 100%",
      (tier) => {
        FEATURE_RULES.baseExplosionProbability = 1
        const { events } = fixture(mode, losingBoard, tier).run()
        expect(events.some((event) => event.type === "freeSpinTrigger")).toBe(true)
        expect(events.some((event) => event.type === "triggerExplode")).toBe(false)
        const trigger = events.findIndex((event) => event.type === "freeSpinTrigger")
        expect(
          events.slice(0, trigger).some((event) => event.type === "spawnNewStageWilds"),
        ).toBe(false)
      },
    )
  })
  it.each(["bonusFeature", "superBonusFeature", "hiddenBonusFeature"] as const)(
    "never explodes on the trigger reveal for %s",
    (mode) => {
      FEATURE_RULES.baseExplosionProbability = 1
      const { events } = fixture(mode, losingBoard).run()
      expect(events.some((event) => event.type === "freeSpinTrigger")).toBe(true)
      expect(events.some((event) => event.type === "triggerExplode")).toBe(false)
      const trigger = events.findIndex((event) => event.type === "freeSpinTrigger")
      expect(
        events.slice(0, trigger).some((event) => event.type === "spawnNewStageWilds"),
      ).toBe(false)
    },
  )
  it("preserves near-miss scatters when adding ten wilds to an exploding base spin", () => {
    FEATURE_RULES.baseExplosionProbability = 1
    vi.spyOn(feature, "weightedNumber").mockReturnValue(10)
    const { events } = fixture("base", () => {
      const board = fullBoard()
      board[0][0] = "S"
      board[1][1] = "S"
      return board
    }).run()
    const reveal = events.find((event) => event.type === "reveal")!
    const added = events.find((event) => event.type === "spawnNewStageWilds")!
    const board = reveal.data.board as RevealSymbol[][]
    const wilds = added.data.wilds as { reel: number; row: number }[]
    expect(wilds).toHaveLength(10)
    expect(board[0][0].name).toBe("S")
    expect(board[1][1].name).toBe("S")
    expect(wilds.every(({ reel, row }) => board[reel][row].name !== "S")).toBe(true)
    expect(events.some((event) => event.type === "freeSpinTrigger")).toBe(false)
  })
})

describe("stage progression", () => {
  it.each([
    { mode: "bonusFeature" as const, threshold: 15, spinsToUnlock: 3 },
    { mode: "superBonusFeature" as const, threshold: 12, spinsToUnlock: 3 },
    { mode: "hiddenBonusFeature" as const, threshold: 10, spinsToUnlock: 2 },
  ])(
    "accumulates winning lows across spins until $mode reaches $threshold",
    ({ mode, threshold, spinsToUnlock }) => {
      let draw = -1
      const { events } = fixture(mode, () => {
        const board = losingBoard()
        if (++draw > 0 && draw <= spinsToUnlock)
          for (let reel = 0; reel < 5; reel++) board[reel][0] = "L4"
        return board
      }).run()
      const unlock = events.findIndex((event) => event.type === "newStageUnlocked")
      expect(events.filter((event) => event.type === "newStageUnlocked")).toHaveLength(1)
      const progress = events
        .slice(0, unlock)
        .filter((event) => event.type === "collectSymbols")
      expect(progress.map((event) => event.data)).toEqual(
        Array.from({ length: spinsToUnlock }, (_, spin) => ({
          symbols: Array.from({ length: 5 }, (_, reel) => ({
            symbol: "L4",
            reel,
            row: 0,
          })),
          initialProgress: spin * 5,
          finalProgress: (spin + 1) * 5,
        })),
      )
      expect(Number(progress.at(-1)!.data.finalProgress)).toBeGreaterThanOrEqual(
        threshold,
      )
      expect(events[unlock + 1]).toMatchObject({
        type: "addAdditionalFreeSpins",
        data: { remainingFs: 5 },
      })
      expect(
        events.slice(unlock + 1).find((event) => event.type === "collectSymbols")?.data
          .initialProgress,
      ).toBe(0)
    },
  )
  it("requires another collecting spin after normal-bonus entry wilds leave only twelve lows", () => {
    vi.spyOn(feature, "weightedNumber").mockReturnValue(3)
    const { events } = fixture("bonusFeature", () => fullBoard("L4")).run()
    const stage2 = events.findIndex(
      (event) => event.type === "newStageUnlocked" && event.data.stage === 2,
    )
    const stage3 = events.findIndex(
      (event) => event.type === "newStageUnlocked" && event.data.stage === 3,
    )
    const collection = events
      .slice(stage2 + 1, stage3)
      .filter((event) => event.type === "collectSymbols")
    expect(
      collection.map((event) => ({
        initial: event.data.initialProgress,
        final: event.data.finalProgress,
      })),
    ).toEqual([
      { initial: 0, final: 12 },
      { initial: 12, final: 27 },
    ])
    expect(
      events.slice(stage2 + 1, stage3).filter((event) => event.type === "reveal"),
    ).toHaveLength(2)
  })
  it("runs the hidden buy with the same events and stages as a natural five-scatter hidden bonus", () => {
    const source = () => fullBoard("L4")
    const bought = fixture("hiddenBonusFeature", source).run()
    const natural = fixture("base", source, "hidden").run()
    expect(bought.events).toEqual(natural.events)
    expect(bought.events.find((event) => event.type === "freeSpinTrigger")?.data).toEqual(
      {
        tier: "hidden",
        totalFs: 5,
        positions: Array.from({ length: 5 }, (_, reel) => ({ reel, row: 0 })),
      },
    )
    expect(
      bought.events
        .filter((event) => event.type === "newStageUnlocked")
        .map((event) => event.data.stage),
    ).toEqual([2, 3, 4, 5])
    const reveal = bought.events.find((event) => event.type === "reveal")!
    expect(
      (reveal.data.board as RevealSymbol[][])
        .flat()
        .filter((symbol) => symbol.name === "S"),
    ).toHaveLength(5)
  })
  it.each([1, 3, 5])(
    "can promote on free spin %i and resets the remaining count to exactly five",
    (promoteOn) => {
      FEATURE_RULES.baseExplosionProbability = 0
      let draws = -1
      const { events } = fixture("bonusFeature", () => {
        draws++
        return draws === promoteOn ? fullBoard("L1") : losingBoard()
      }).run()
      const unlock = events.findIndex((event) => event.type === "newStageUnlocked")
      expect(unlock).toBeGreaterThan(0)
      expect(events[unlock - 1]).toMatchObject({
        type: "collectSymbols",
        data: { initialProgress: 0, finalProgress: 15 },
      })
      expect(events[unlock].data).toEqual({ stage: 2 })
      expect(events[unlock + 1]).toEqual({
        type: "addAdditionalFreeSpins",
        data: {
          additionalFs: promoteOn,
          remainingFs: 5,
          totalFs: 5 + promoteOn,
          positions: [],
        },
      })
      const nextReveal = events.findIndex(
        (event, i) => i > unlock && event.type === "reveal",
      )
      expect(events[nextReveal + 1].type).toBe("spawnNewStageWilds")
      expect(
        (events[nextReveal + 1].data.wilds as { multiplier: number }[]).every(
          (wild) => wild.multiplier === 2,
        ),
      ).toBe(true)
      expect(events.filter((event) => event.type === "spawnNewStageWilds")).toHaveLength(
        1,
      )
      expect(events.some((event) => event.type === "triggerExplode")).toBe(false)
      const nextCollection = events
        .slice(unlock + 1)
        .find((event) => event.type === "collectSymbols")
      expect(nextCollection?.data.initialProgress).toBe(0)
    },
  )
  it("spawns once for each new stage, uses stage multipliers on natural wilds and stops collecting at five", () => {
    FEATURE_RULES.baseExplosionProbability = 0
    let draws = 0
    const { events } = fixture("bonusFeature", () => {
      const board = fullBoard("L4")
      if (++draws > 1) board[4][2] = "W"
      return board
    }).run()
    expect(
      events
        .filter((event) => event.type === "newStageUnlocked")
        .map((event) => event.data.stage),
    ).toEqual([2, 3, 4, 5])
    expect(events.filter((event) => event.type === "spawnNewStageWilds")).toHaveLength(4)
    let stage = 1
    for (const event of events) {
      if (event.type === "newStageUnlocked") stage = Number(event.data.stage)
      if (event.type === "reveal" && event.data.bonusTier)
        expect((event.data.board as RevealSymbol[][])[4][2].multiplier).toBe(
          FEATURE_RULES.stageMultipliers[stage as 1 | 2 | 3 | 4 | 5],
        )
      if (stage === 5) expect(event.type).not.toBe("collectSymbols")
    }
  })
})

describe("FeatureSpin and cap", () => {
  it("always adds 3–10 wilds with independent multipliers from the stage pool", () => {
    let mixed = false
    for (let seed = 1; seed <= 30; seed++) {
      const { events } = fixture("featureSpin", losingBoard, undefined, seed).run()
      expect(events.slice(0, 3).map((event) => event.type)).toEqual([
        "triggerExplode",
        "reveal",
        "spawnNewStageWilds",
      ])
      const wilds = events[2].data.wilds as { multiplier: number }[]
      expect(wilds.length).toBeGreaterThanOrEqual(3)
      expect(wilds.length).toBeLessThanOrEqual(10)
      expect(
        wilds.every((wild) =>
          Object.values(FEATURE_RULES.stageMultipliers).includes(wild.multiplier),
        ),
      ).toBe(true)
      mixed ||= new Set(wilds.map((wild) => wild.multiplier)).size > 1
      expect(events.some((event) => event.type === "freeSpinTrigger")).toBe(false)
    }
    expect(mixed).toBe(true)
  })
  it("settles exactly 10,000x in wallet and every total, preserving unmodified reveal", () => {
    vi.spyOn(feature, "featureSpinMultiplier").mockReturnValue(25)
    vi.spyOn(feature, "weightedNumber").mockReturnValue(10)
    const { ctx, events } = fixture("featureSpin").run()
    expect(ctx.services.wallet.getCurrentWin()).toBe(MAX_WIN)
    expect(ctx.state.triggeredMaxWin).toBe(true)
    expect(events.find((event) => event.type === "winInfo")?.data.totalWin).toBe(MAX_WIN)
    expect(events.at(-1)).toEqual({ type: "finalWin", data: { amount: MAX_WIN } })
  })
  it("replays seeded rounds exactly", () => {
    expect(fixture("superBonusFeature", () => fullBoard("L4")).run().events).toEqual(
      fixture("superBonusFeature", () => fullBoard("L4")).run().events,
    )
  })
})
