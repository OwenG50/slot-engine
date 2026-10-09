import { GameContext, SPIN_TYPE } from "@slot-engine/core"
import type { gameModes, symbols, userState } from ".."
import { evaluateWins } from "./evaluations"
import { canRepositionWilds, moveRoamingWilds } from "./collection"
import {
  EVENT,
  EventName,
  anticipation,
  eventPosition,
  calculateWinLevel,
  revealBoard,
  scatterPositions,
  winInfo,
} from "./events"
import { BoardProfile } from "./reels"
import { MODES, NON_TRIGGER_SCATTER_ACCEPTANCE } from "./settings"
import {
  activeEffects,
  featureBoard,
  FeatureState,
  randomStartingUpgrades,
  randomFeatureSpinUpgradeCount,
  roam,
  startFeature,
  unlockUpgrade,
} from "./feature"
import { FEATURE_RULES } from "./settings"
import {
  Board,
  BonusTier,
  cents,
  HEIGHT,
  MAX_WIN,
  ModeName,
  PAYING_SYMBOLS,
  WIDTH,
} from "./types"

export type Context = GameContext<typeof gameModes, typeof symbols, typeof userState>
export function onHandleGameFlow(ctx: Context) {
  const mode = ctx.state.currentGameMode as ModeName
  const settings = MODES[mode]
  const tier = (ctx.state.currentResultSet.userData?.tier ?? settings.boughtTier) as
    | BonusTier
    | undefined
  const rng = ctx.services.rng
  const rules = FEATURE_RULES
  ctx.state.userData.profile =
    ctx.state.currentResultSet.userData?.profile ??
    rng.randomItem<BoardProfile>(["standard", "dense", "tail"])
  const emit = (type: EventName, data: Record<string, unknown>) =>
    ctx.services.data.addBookEvent({ type, data })
  let bonusPayout = 0
  let freeSpinsPlayed = 0
  let triggerPositions: { reel: number; row: number }[] = []
  let feature: FeatureState | undefined
  const isFeatureSpin = mode === "featureSpin"

  // Draws real reel stops like the reference games. Trigger spins force
  // `forceScatters` scatter stops (exact count), organic spins retry until at
  // most `maxScatters` show, and no reel may ever show more than one scatter.
  function draw(
    forceScatters: number,
    maxScatters: number,
    reduceScatters: boolean,
  ): Board {
    const scatter = ctx.config.symbols.get("S")!
    const reels = ctx.services.board.getRandomReelset()
    // Physical strips stay fixed during this draw, including its retries.
    const scatterStops =
      forceScatters > 0
        ? ctx.services.board.getReelStopsForSymbol(reels, scatter)
        : undefined
    while (true) {
      // Core's draw methods reset reels/padding/anticipation themselves.
      // ButchEm has no locked reels, so a separate reset only allocates twice.
      if (forceScatters > 0) {
        const forcedStops = ctx.services.board.getRandomReelStops(
          reels,
          scatterStops!,
          forceScatters,
        )
        ctx.services.board.drawBoardWithForcedStops({ reels, forcedStops })
      } else {
        ctx.services.board.drawBoardWithRandomStops(reels)
      }
      const board = ctx.services.board
        .getBoardReels()
        .map((reel) => reel.map((s) => s.id)) as Board
      const perReel = board.map((reel) => reel.filter((id) => id === "S").length)
      if (perReel.some((count) => count > 1)) continue
      const total = perReel.reduce((sum, count) => sum + count, 0)
      if (forceScatters > 0 ? total !== forceScatters : total > maxScatters) continue
      if (feature && forceScatters === 0) {
        const { size } = activeEffects(feature, rules)
        // Reveal destinations must keep H symbols and scatters visible.
        if (!canRepositionWilds(board, feature.anchors, size, rules.maxMovesPerSpin))
          continue
      }
      if (ctx.state.currentResultSet.forceMaxWin) {
        // Sample real stops rather than repainting a winning board. Fifteen
        // matching cells already reach the paytable ceiling; wilds can still
        // complete and multiply the cluster as usual.
        const cells = board.flat()
        const counts = PAYING_SYMBOLS.map(
          (symbol) => cells.filter((id) => id === symbol).length,
        )
        if (counts.some((count) => count > 15)) continue
        if (counts.filter((count) => count > 0).length < 3) continue
      }
      // Retry actual reel stops to gently reduce near-misses without editing
      // symbols or changing the separately controlled bonus trigger frequency.
      if (
        reduceScatters &&
        total > 0 &&
        rng.randomFloat(0, 1) >= NON_TRIGGER_SCATTER_ACCEPTANCE
      )
        continue
      return board
    }
  }
  function reveal(inFeature: boolean, forceScatters = 0): number {
    // Organic base spins show at most 2 near-miss scatters (never a trigger),
    // free spins land scatters organically for retriggers, and featureSpin
    // never shows one (it cannot trigger or extend anything).
    const maxScatters = inFeature ? (isFeatureSpin ? 0 : WIDTH) : 2
    const reduceScatters =
      !inFeature &&
      forceScatters === 0 &&
      (mode === "base" || mode === "extraChance" || mode === "extraChance2")
    const sourceBoard = draw(forceScatters, maxScatters, reduceScatters)
    const wilds = inFeature ? roam(feature!, rules, rng, sourceBoard) : []
    const { board, naturalWilds } = inFeature
      ? featureBoard(sourceBoard, feature!, rules, wilds)
      : { board: sourceBoard, naturalWilds: [] }
    const revealEffects = inFeature
      ? activeEffects(feature!, rules)
      : { multiplier: 1, size: "1" as const }
    // Always count scatters from the real board: a roaming wild's footprint
    // must never hide a genuine scatter landing from the retrigger count.
    const scatters = scatterPositions(sourceBoard)
    if (!inFeature) triggerPositions = scatters
    // Overlays are written back before the native cluster evaluator reads the board.
    for (let x = 0; x < WIDTH; x++)
      for (let y = 0; y < HEIGHT; y++)
        ctx.services.board.setSymbol(x, y, ctx.config.symbols.get(board[x][y])!)
    const wins = evaluateWins(ctx, [...wilds, ...naturalWilds])
    emit(EVENT.reveal, {
      board: revealBoard(sourceBoard, revealEffects.multiplier),
      anticipation: anticipation(sourceBoard),
      upgrades: inFeature ? feature!.upgrades : {},
      roamingWilds: wilds.map(({ positions, ...movement }) => movement),
      ...(tier && inFeature ? { bonusTier: tier, freeSpin: freeSpinsPlayed } : {}),
    })
    const info = winInfo(wins)
    const spinPayout = info.totalWin
    // Settle every win before moving or applying upgrades.
    if (spinPayout > 0) {
      emit(EVENT.winInfo, info)
      emit(EVENT.setWin, { amount: spinPayout, winLevel: calculateWinLevel(spinPayout) })
      if (inFeature && !isFeatureSpin) bonusPayout = cents(bonusPayout + spinPayout)
      emit(EVENT.setTotalWin, {
        amount: inFeature && !isFeatureSpin ? bonusPayout : spinPayout,
      })
    }
    ctx.services.wallet.addSpinWin(spinPayout)
    ctx.services.wallet.confirmSpinWin()
    ctx.state.triggeredMaxWin = cents(ctx.services.wallet.getCurrentWin()) >= MAX_WIN

    // Collect only when another feature spin can use the resulting upgrades.
    // The current spin was already consumed; scatters can extend the last one.
    // Keep retrigger emission after movement/upgrades as before.
    if (
      inFeature &&
      !isFeatureSpin &&
      !ctx.state.triggeredMaxWin &&
      (ctx.state.currentFreespinAmount > 0 || scatters.length > 0)
    ) {
      const movements = moveRoamingWilds(
        sourceBoard,
        feature!,
        revealEffects.size,
        rules,
        rng,
      )
      emit(EVENT.moveRoamingWild, {
        movements,
        collected: { ...feature!.collected },
        upgrades: { ...feature!.upgrades },
      })
      const pending = ([1, 2, 3, 4] as const).filter(
        (id) =>
          !feature!.upgrades[id] &&
          feature!.collected[id] >= rules.upgrades[id].requiredSymbols,
      )
      // Movement uses this reveal's size for every symbol. Size/spawn changes
      // are committed together afterwards, ready for the following spin.
      for (const id of pending) {
        unlockUpgrade(feature!, id, rules, rng)
        emit(EVENT.upgradeUnlocked, {
          upgrade: id,
          upgrades: feature!.upgrades,
          ...activeEffects(feature!, rules),
          effectiveFromSpin: freeSpinsPlayed + 1,
          roamingWildPositions: feature!.anchors,
        })
      }
    }

    // Scatter retriggers: +1 free spin per scatter landed during the bonus.
    if (
      inFeature &&
      !isFeatureSpin &&
      scatters.length > 0 &&
      !ctx.state.triggeredMaxWin
    ) {
      ctx.services.game.awardFreespins(scatters.length)
      emit(EVENT.addAdditionalFreeSpins, {
        additionalFs: scatters.length,
        remainingFs: ctx.state.currentFreespinAmount,
        totalFs: ctx.state.totalFreespinAmount,
        positions: scatters,
      })
    }
    return spinPayout
  }
  function beginFeature() {
    const configuredCount = Number(
      ctx.state.currentResultSet.userData?.startingUpgradeCount,
    )
    const count = isFeatureSpin
      ? Number.isInteger(configuredCount) && configuredCount >= 1 && configuredCount <= 4
        ? configuredCount
        : randomFeatureSpinUpgradeCount(rng)
      : rules.startingUpgradeCount[tier!]
    const initialUpgrades = randomStartingUpgrades(count, rng)
    feature = startFeature(initialUpgrades, rules, rng)
    emit(EVENT.featureStart, {
      upgrades: feature.upgrades,
      // Matches the first step of this wild's initial repositioning path.
      roamingWilds: feature.anchors.map((anchor, roamingWildIndex) => ({
        ...activeEffects(feature!, rules),
        roamingWildIndex,
        steps: [{ ...eventPosition(anchor), symbols: [] }],
        collectedSymbols: [],
        collectedCount: 0,
      })),
      freeSpins: ctx.state.currentFreespinAmount,
      bonusTier: tier ?? null,
    })
  }
  if (isFeatureSpin) {
    beginFeature()
    reveal(true)
  } else {
    // Every bonus â€” organic or bought â€” is triggered by a real base-game spin
    // that lands its 3/4/5 scatters from actual reel stops.
    const targetScatters = tier ? { normal: 3, super: 4, hidden: 5 }[tier] : 0
    const triggerWin = reveal(false, targetScatters)
    if (tier && !ctx.state.triggeredMaxWin) {
      const awarded = ctx.services.game.getFreeSpinsForScatters(
        SPIN_TYPE.BASE_GAME,
        targetScatters,
      )
      ctx.services.game.awardFreespins(awarded)
      emit(EVENT.freeSpinTrigger, {
        tier,
        totalFs: awarded,
        positions: triggerPositions,
      })
      // The feature total includes the triggering spin's own win.
      bonusPayout = cents(triggerWin)
      beginFeature()
      ctx.state.currentSpinType = SPIN_TYPE.FREE_SPINS
      while (ctx.state.currentFreespinAmount > 0 && !ctx.state.triggeredMaxWin) {
        ctx.state.currentFreespinAmount--
        freeSpinsPlayed++
        emit(EVENT.updateFreeSpin, {
          amount: freeSpinsPlayed,
          total: ctx.state.totalFreespinAmount,
        })
        reveal(true)
      }
      ctx.state.currentFreespinAmount = 0
      emit(EVENT.freeSpinEnd, {
        amount: bonusPayout,
        winLevel: calculateWinLevel(bonusPayout),
      })
    }
  }
  ctx.state.userData.bonusPayout = bonusPayout
  ctx.services.data.tag({ triggeredFS: !!tier, bonusTier: tier ?? "none" })
  const payout = cents(ctx.services.wallet.getCurrentWin())
  if (payout > 0) emit(EVENT.finalWin, { amount: payout })
}
