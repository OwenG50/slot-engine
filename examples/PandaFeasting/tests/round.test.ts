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

describe("PandaFeasting events", () => {
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
    })
    expect(events[1].data.totalWin).toBe(330)
    for (const win of events[1].data.wins as object[])
      expect(Object.keys(win).sort()).toEqual([
        "kind",
        "meta",
        "positions",
        "symbol",
        "win",
      ])
    expect(events.at(-1)).toEqual({ type: "finalWin", data: { amount: 330 } })
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
      { roll: 0.01999, explodes: true },
      { roll: 0.02, explodes: false },
    ])("uses the 2% boundary for roll $roll", ({ roll, explodes }) => {
      expect(FEATURE_RULES.baseExplosionProbability).toBe(0.02)
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
  it("preserves near-miss scatters when adding thirteen wilds to an exploding base spin", () => {
    FEATURE_RULES.baseExplosionProbability = 1
    vi.spyOn(feature, "weightedNumber").mockReturnValue(13)
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
    expect(wilds).toHaveLength(13)
    expect(board[0][0].name).toBe("S")
    expect(board[1][1].name).toBe("S")
    expect(wilds.every(({ reel, row }) => board[reel][row].name !== "S")).toBe(true)
    expect(events.some((event) => event.type === "freeSpinTrigger")).toBe(false)
  })
})

describe("stage progression", () => {
  it.each([
    "base",
    "extraChance",
    "extraChance2",
    "featureSpin",
    "bonusFeature",
    "superBonusFeature",
    "hiddenBonusFeature",
  ] as const)("uses the shared count pool on every launch in %s", (mode) => {
    FEATURE_RULES.baseExplosionProbability = 1
    const drawCount = vi.spyOn(feature, "weightedNumber")
    // FeatureSpin stage selection calls the same helper with stage weights.
    vi.spyOn(feature, "featureSpinStage").mockReturnValue(1)
    fixture(mode, () => fullBoard("L1")).run()
    const countCalls = drawCount.mock.calls.filter(
      ([weights]) => weights !== FEATURE_RULES.featureSpinStageWeights,
    )
    expect(countCalls.length).toBeGreaterThan(0)
    for (const [weights] of countCalls)
      expect(weights).toBe(FEATURE_RULES.spawnCountWeights)
  })
  it.each(["bonusFeature", "superBonusFeature", "hiddenBonusFeature"] as const)(
    "can launch 15 wilds on the same board after collecting food in %s",
    (mode) => {
      vi.spyOn(feature, "weightedNumber").mockReturnValue(15)
      let draws = -1
      const { events } = fixture(mode, () =>
        ++draws === 1 ? fullBoard("L1") : losingBoard(),
      ).run()
      const collect = events.findIndex((event) => event.type === "collectSymbols")
      expect(events[collect + 1]).toEqual({
        type: "triggerExplode",
        data: { source: "stage" },
      })
      expect(events[collect + 2].type).toBe("spawnNewStageWilds")
      const wilds = events[collect + 2].data.wilds as {
        reel: number
        row: number
        multiplier: number
      }[]
      expect(wilds).toHaveLength(15)
      expect(new Set(wilds.map((wild) => `${wild.reel},${wild.row}`)).size).toBe(15)
      expect(wilds.every((wild) => wild.multiplier === 1)).toBe(true)
      expect(events[collect + 3]).toMatchObject({
        type: "winInfo",
        data: { totalWin: 330 },
      })
    },
  )
  it.each([
    { mode: "bonusFeature" as const, threshold: 10 },
    { mode: "superBonusFeature" as const, threshold: 9 },
    { mode: "hiddenBonusFeature" as const, threshold: 8 },
  ])("accumulates food across spins before $mode unlocks", ({ mode, threshold }) => {
    let draw = -1
    const { events } = fixture(mode, () => {
      const board = losingBoard()
      if (++draw > 0 && draw <= Math.ceil(threshold / 5))
        for (let reel = 0; reel < 5; reel++) board[reel][0] = "L4"
      return board
    }).run()
    const unlock = events.findIndex((event) => event.type === "newStageUnlocked")
    expect(unlock).toBeGreaterThan(0)
    const collections = events
      .slice(0, unlock)
      .filter((event) => event.type === "collectSymbols")
    expect(
      collections.map((event) => [event.data.initialProgress, event.data.finalProgress]),
    ).toEqual([
      [0, 5],
      [5, 10],
    ])
    expect(events.filter((event) => event.type === "newStageUnlocked")).toHaveLength(1)
    expect(events[unlock + 1]).toMatchObject({
      type: "addAdditionalFreeSpins",
      data: { remainingFs: 5 },
    })
  })

  it.each([1, 3, 5])(
    "replays the upgrade board on spin %i before unlocking, without food or another reveal",
    (promoteOn) => {
      let draws = -1
      const { events, ctx } = fixture("bonusFeature", () =>
        ++draws === promoteOn ? fullBoard("L1") : losingBoard(),
      ).run()
      const collect = events.findIndex(
        (event) => event.type === "collectSymbols" && event.data.finalProgress === 15,
      )
      const unlock = events.findIndex((event) => event.type === "newStageUnlocked")
      expect(events.slice(collect, unlock + 1).map((event) => event.type)).toEqual([
        "collectSymbols",
        "triggerExplode",
        "spawnNewStageWilds",
        "winInfo",
        "setWin",
        "setTotalWin",
        "newStageUnlocked",
      ])
      expect(events[collect + 1]).toEqual({
        type: "triggerExplode",
        data: { source: "stage" },
      })
      expect(
        (events[collect + 2].data.wilds as { multiplier: number }[]).every(
          (w) => w.multiplier === 1,
        ),
      ).toBe(true)
      expect(events[unlock + 1]).toMatchObject({
        type: "addAdditionalFreeSpins",
        data: { additionalFs: promoteOn, remainingFs: 5, totalFs: 5 + promoteOn },
      })
      expect(events.filter((event) => event.type === "reveal")).toHaveLength(
        1 + promoteOn + 5,
      )
      expect(events.filter((event) => event.type === "spawnNewStageWilds")).toHaveLength(
        1,
      )
      const amounts = events
        .filter((event) => event.type === "winInfo")
        .map((event) => Number(event.data.totalWin))
      expect(ctx.services.wallet.getCurrentWin()).toBeCloseTo(
        amounts.reduce((sum, amount) => sum + amount, 0),
      )
    },
  )

  it("pays unchanged winning lines again as part of ALL replay wins", () => {
    let draws = -1
    const board = losingBoard()
    for (let reel = 0; reel < 5; reel++) {
      board[reel][0] = "H1"
      board[reel][1] = "L4"
      board[reel][2] = "L4"
    }
    vi.spyOn(feature, "spawnWilds").mockImplementation((current, _count, multiplier) => {
      const added = [0, 1, 2].map((reel) => ({
        position: [reel, 2] as [number, number],
        multiplier: multiplier(),
      }))
      for (const wild of added) current[wild.position[0]][wild.position[1]] = "W"
      return added
    })
    const { events } = fixture("bonusFeature", () =>
      ++draws === 1 ? board : losingBoard(),
    ).run()
    const wins = events.filter((event) => event.type === "winInfo")
    expect(wins).toHaveLength(2)
    for (const event of wins)
      expect(event.data.wins).toContainEqual(
        expect.objectContaining({ symbol: "H1", win: 30 }),
      )
  })

  it.each(["bonusFeature", "superBonusFeature", "hiddenBonusFeature"] as const)(
    "%s spawns completed-stage wilds and fills stage six once without extra spins",
    (mode) => {
      let draws = 0
      const { events } = fixture(mode, () => {
        const board = fullBoard("L4")
        if (++draws > 1) board[4][2] = "W"
        return board
      }).run()
      expect(
        events
          .filter((event) => event.type === "newStageUnlocked")
          .map((event) => event.data.stage),
      ).toEqual([2, 3, 4, 5, 6])
      expect(events.filter((event) => event.type === "spawnNewStageWilds")).toHaveLength(
        6,
      )
      expect(
        events
          .filter((event) => event.type === "spawnNewStageWilds")
          .map((event) => [
            ...new Set(
              (event.data.wilds as { multiplier: number }[]).map(
                (wild) => wild.multiplier,
              ),
            ),
          ]),
      ).toEqual([[1], [2], [5], [10], [25], [50]])
      let stage = 1
      for (const event of events) {
        if (event.type === "newStageUnlocked") stage = Number(event.data.stage)
        if (event.type === "reveal" && event.data.bonusTier)
          expect((event.data.board as RevealSymbol[][])[4][2].multiplier).toBe(
            FEATURE_RULES.stageMultipliers[stage as 1 | 2 | 3 | 4 | 5 | 6],
          )
        if (event.type === "spawnNewStageWilds")
          expect(
            (event.data.wilds as { multiplier: number }[]).every(
              (w) =>
                w.multiplier ===
                FEATURE_RULES.stageMultipliers[stage as 1 | 2 | 3 | 4 | 5 | 6],
            ),
          ).toBe(true)
      }
      const finalUnlock = events.findIndex(
        (event) => event.type === "newStageUnlocked" && event.data.stage === 6,
      )
      const finalStageEvents = events.slice(finalUnlock + 2)
      const tier = (
        {
          bonusFeature: "normal",
          superBonusFeature: "super",
          hiddenBonusFeature: "hidden",
        } as const
      )[mode]
      expect(
        finalStageEvents
          .filter((event) => event.type === "collectSymbols")
          .map((event) => [event.data.initialProgress, event.data.finalProgress]),
      ).toEqual([
        [0, 14],
        [14, FEATURE_RULES.stageThresholds[tier][6]],
      ])
      expect(finalStageEvents.filter((event) => event.type === "reveal")).toHaveLength(5)
      expect(
        finalStageEvents.filter((event) => event.type === "triggerExplode"),
      ).toHaveLength(1)
      expect(
        finalStageEvents.some(
          (event) =>
            event.type === "newStageUnlocked" || event.type === "addAdditionalFreeSpins",
        ),
      ).toBe(false)
      const finalSpawn = finalStageEvents.findIndex(
        (event) => event.type === "spawnNewStageWilds",
      )
      expect(finalStageEvents[finalSpawn + 1].type).toBe("winInfo")
      expect(
        finalStageEvents
          .slice(finalSpawn + 1)
          .some(
            (event) =>
              event.type === "collectSymbols" || event.type === "spawnNewStageWilds",
          ),
      ).toBe(false)
      expect(
        events.filter((event) => event.type === "updateFreeSpin").length,
      ).toBeLessThanOrEqual(30)
      expect(FEATURE_RULES.stageMultipliers).toEqual({
        1: 1,
        2: 2,
        3: 5,
        4: 10,
        5: 25,
        6: 50,
      })
      expect(fixture("base", () => fullBoard("L4"), "hidden").run().events).toEqual(
        fixture("hiddenBonusFeature", () => fullBoard("L4")).run().events,
      )
    },
  )

  it.each([
    { fillOn: 5, capReplay: false },
    { fillOn: 2, capReplay: true },
  ])(
    "completes stage six on spin $fillOn without extending the bonus (cap replay: $capReplay)",
    ({ fillOn, capReplay }) => {
      let stage = 1
      let finalStageSpins = 0
      const advanceStage = feature.advanceStage
      vi.spyOn(feature, "advanceStage").mockImplementation((state, count) => {
        const unlocked = advanceStage(state, count)
        stage = state.stage
        return unlocked
      })
      const spawnWilds = feature.spawnWilds
      vi.spyOn(feature, "spawnWilds").mockImplementation(
        (board, count, multiplier, rng) =>
          spawnWilds(
            board,
            count,
            () => (capReplay && multiplier() === 50 ? 10000 : multiplier()),
            rng,
          ),
      )
      const { events, ctx } = fixture("hiddenBonusFeature", () => {
        if (stage === 6 && ++finalStageSpins < fillOn - 1) return losingBoard()
        return fullBoard("L4")
      }).run()
      const finalUnlock = events.findIndex(
        (event) => event.type === "newStageUnlocked" && event.data.stage === 6,
      )
      const finalEvents = events.slice(finalUnlock + 2)
      expect(finalEvents.filter((event) => event.type === "reveal")).toHaveLength(fillOn)
      expect(
        finalEvents.filter((event) => event.type === "spawnNewStageWilds"),
      ).toHaveLength(1)
      expect(
        finalEvents.filter((event) => event.type === "collectSymbols").at(-1)?.data,
      ).toMatchObject({
        initialProgress: 15,
        finalProgress: 20,
      })
      expect(
        finalEvents.some(
          (event) =>
            event.type === "newStageUnlocked" || event.type === "addAdditionalFreeSpins",
        ),
      ).toBe(false)
      expect(ctx.state.currentFreespinAmount).toBe(0)
      expect(ctx.state.triggeredMaxWin).toBe(capReplay)
      if (capReplay) {
        expect(ctx.services.wallet.getCurrentWin()).toBe(MAX_WIN)
        expect(events.at(-1)).toEqual({ type: "finalWin", data: { amount: MAX_WIN } })
      }
    },
  )

  it("caps upgrade replay winnings at the remaining max-win budget", () => {
    vi.spyOn(feature, "spawnWilds").mockImplementation(
      (board, count, _multiplier, rng) => {
        const available = feature.spawnPositions(board)
        return available.slice(0, count).map((position) => {
          board[position[0]][position[1]] = "W"
          return { position, multiplier: 10000 }
        })
      },
    )
    let draw = -1
    const { events, ctx } = fixture("bonusFeature", () =>
      ++draw === 1 ? fullBoard("L1") : losingBoard(),
    ).run()
    expect(ctx.services.wallet.getCurrentWin()).toBe(MAX_WIN)
    const unlock = events.findIndex((event) => event.type === "newStageUnlocked")
    expect(unlock).toBeGreaterThan(0)
    expect(
      events
        .slice(unlock + 1)
        .some(
          (event) =>
            event.type === "reveal" ||
            event.type === "addAdditionalFreeSpins" ||
            event.type === "collectSymbols",
        ),
    ).toBe(false)
    expect(events.at(-1)).toEqual({ type: "finalWin", data: { amount: MAX_WIN } })
  })
})

describe("FeatureSpin and cap", () => {
  it("always adds 3–15 wilds sharing the meter's selected multiplier", () => {
    const selected = new Set<number>()
    for (let seed = 1; seed <= 30; seed++) {
      const { events } = fixture("featureSpin", losingBoard, undefined, seed).run()
      const meter = events.filter((event) => event.type === "featureSpinMeter")
      const remaining = events.filter((event) => event.type !== "featureSpinMeter")
      expect(remaining.slice(0, 3).map((event) => event.type)).toEqual([
        "triggerExplode",
        "reveal",
        "spawnNewStageWilds",
      ])
      const wilds = remaining[2].data.wilds as { multiplier: number }[]
      expect(wilds.length).toBeGreaterThanOrEqual(3)
      expect(wilds.length).toBeLessThanOrEqual(15)
      expect(
        wilds.every((wild) =>
          Object.values(FEATURE_RULES.stageMultipliers).includes(wild.multiplier),
        ),
      ).toBe(true)
      expect(new Set(wilds.map((wild) => wild.multiplier)).size).toBe(1)
      expect(wilds[0].multiplier).toBe(meter.at(-1)!.data.multiplier)
      selected.add(wilds[0].multiplier)
      expect(events.some((event) => event.type === "freeSpinTrigger")).toBe(false)
    }
    expect(selected.size).toBeGreaterThan(1)
  })
  it.each(["base", "extraChance", "extraChance2", "featureSpin"] as const)(
    "can launch a full screen of 15 wilds in %s",
    (mode) => {
      FEATURE_RULES.baseExplosionProbability = 1
      vi.spyOn(feature, "featureSpinStage").mockReturnValue(6)
      vi.spyOn(feature, "weightedNumber").mockReturnValue(15)
      const { ctx, events } = fixture(mode, losingBoard).run()
      const reveal = events.find((event) => event.type === "reveal")!
      expect(
        (reveal.data.board as RevealSymbol[][]).flat().some((s) => s.name === "W"),
      ).toBe(false)
      const wilds = events.find((event) => event.type === "spawnNewStageWilds")!.data
        .wilds as { reel: number; row: number; multiplier: number }[]
      expect(wilds).toHaveLength(15)
      expect(new Set(wilds.map((wild) => `${wild.reel},${wild.row}`)).size).toBe(15)
      const multiplier = mode === "featureSpin" ? 50 : 1
      expect(wilds.every((wild) => wild.multiplier === multiplier)).toBe(true)
      expect(
        ctx.services.board.getBoardReels().flat().every((symbol) => symbol.id === "W"),
      ).toBe(true)
      const payout = mode === "featureSpin" ? MAX_WIN : 330
      expect(ctx.services.wallet.getCurrentWin()).toBe(payout)
      expect(events.at(-1)).toEqual({ type: "finalWin", data: { amount: payout } })
    },
  )
  it("redraws boards with protected cells before launching 15 wilds", () => {
    vi.spyOn(feature, "featureSpinStage").mockReturnValue(6)
    vi.spyOn(feature, "weightedNumber").mockReturnValue(15)
    let draws = 0
    const { events } = fixture("featureSpin", () => {
      const board = losingBoard()
      if (++draws === 1) board[0][0] = "W"
      if (draws === 2) board[0][0] = "S"
      return board
    }).run()
    expect(draws).toBe(3)
    const reveal = events.find((event) => event.type === "reveal")!
    expect(
      (reveal.data.board as RevealSymbol[][])
        .flat()
        .every((symbol) => symbol.name !== "W" && symbol.name !== "S"),
    ).toBe(true)
    expect(
      events.find((event) => event.type === "spawnNewStageWilds")!.data.wilds,
    ).toHaveLength(15)
  })
  it.each([1, 2, 3, 4, 5, 6] as const)(
    "emits only a final stage %i fill before its explosion, without resetting",
    (selectedStage) => {
      vi.spyOn(feature, "featureSpinStage").mockReturnValue(selectedStage)
      const f = fixture("featureSpin", () => {
        const board = losingBoard()
        board[4][2] = "W"
        return board
      })
      const first = f.run().events
      const meter = first.filter((event) => event.type === "featureSpinMeter")
      expect(meter).toHaveLength(1)
      expect(first[0]).toEqual(meter[0])
      expect(meter[0].data).toEqual({
        action: "fill",
        stage: selectedStage,
        multiplier: FEATURE_RULES.stageMultipliers[selectedStage],
        progress: expect.any(Number),
      })
      expect(Number(meter[0].data.progress)).toBeGreaterThanOrEqual(0.1)
      expect(Number(meter[0].data.progress)).toBeLessThanOrEqual(0.9)
      expect(first[1].type).toBe("triggerExplode")
      const reveal = first.find((event) => event.type === "reveal")!
      expect((reveal.data.board as RevealSymbol[][])[4][2].multiplier).toBe(
        FEATURE_RULES.stageMultipliers[selectedStage],
      )
      expect(first.filter((event) => event.type === "triggerExplode")).toHaveLength(1)
      expect(first.filter((event) => event.type === "reveal")).toHaveLength(1)
      expect(
        first.some((event) =>
          [
            "collectSymbols",
            "newStageUnlocked",
            "addAdditionalFreeSpins",
            "freeSpinTrigger",
          ].includes(event.type),
        ),
      ).toBe(false)
      const firstLength = first.length
      f.run()
      expect(f.events[firstLength]).toMatchObject({
        type: "featureSpinMeter",
        data: {
          action: "fill",
          stage: selectedStage,
          multiplier: FEATURE_RULES.stageMultipliers[selectedStage],
        },
      })
      expect(
        f.events.slice(firstLength).filter((event) => event.type === "featureSpinMeter"),
      ).toHaveLength(1)
    },
  )
  it("keeps cosmetic partial progress out of payout decisions", () => {
    function runWithProgress(last: boolean) {
      const f = fixture("featureSpin", losingBoard)
      const original = f.ctx.services.rng.randomItem.bind(f.ctx.services.rng)
      vi.spyOn(f.ctx.services.rng, "randomItem").mockImplementation((items) =>
        items.length === 81 && typeof items[0] === "number"
          ? Number(items[last ? items.length - 1 : 0])
          : original(items),
      )
      return f.run()
    }
    const low = runWithProgress(false)
    const high = runWithProgress(true)
    const payoutEvents = (events: typeof low.events) =>
      events.filter((event) => event.type !== "featureSpinMeter")
    expect(payoutEvents(low.events)).toEqual(payoutEvents(high.events))
    expect(
      low.events.filter((event) => event.type === "featureSpinMeter").at(-1)!.data
        .progress,
    ).toBe(0.1)
    expect(
      high.events.filter((event) => event.type === "featureSpinMeter").at(-1)!.data
        .progress,
    ).toBe(0.9)
  })
  it("settles exactly 10,000x in wallet and every total, preserving unmodified reveal", () => {
    vi.spyOn(feature, "featureSpinStage").mockReturnValue(6)
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
