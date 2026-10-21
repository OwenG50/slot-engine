import { GameContext, SPIN_TYPE } from "@slot-engine/core"
import type { gameModes, symbols, userState } from ".."
import { BONUS_LINE_SAMPLING, bonusLineStops } from "./lineSampling"
import { capWins, evaluateLines } from "./evaluations"
import {
  EVENT,
  EventName,
  anticipation,
  calculateWinLevel,
  eventPosition,
  revealBoard,
  scatterPositions,
  winInfo,
} from "./events"
import {
  advanceStage,
  collectLowSymbols,
  FeatureState,
  featureSpinMultiplier,
  spawnPositions,
  spawnWilds,
  startFeature,
  weightedNumber,
} from "./feature"
import {
  FEATURE_RULES,
  FEATURE_SPIN_HIGH_WIN_SAMPLING,
  MODES,
  NON_TRIGGER_SCATTER_ACCEPTANCE,
} from "./settings"
import {
  Board,
  BonusTier,
  FREE_SPINS,
  MAX_WIN,
  ModeName,
  Wild,
  cents,
  positionKey,
} from "./types"

export type Context = GameContext<typeof gameModes, typeof symbols, typeof userState>
export function onHandleGameFlow(ctx: Context) {
  const mode = ctx.state.currentGameMode as ModeName
  const settings = MODES[mode]
  const tier = (ctx.state.currentResultSet.userData?.tier ?? settings.boughtTier) as
    | BonusTier
    | undefined
  const rng = ctx.services.rng
  const isFeatureSpin = mode === "featureSpin"
  const lineProbability = ctx.state.currentResultSet.userData?.sampleBonusLines
    ? ctx.state.currentResultSet.userData?.tail
      ? BONUS_LINE_SAMPLING.tailProbability
      : rng.randomItem(BONUS_LINE_SAMPLING.roundProbabilities)
    : 0
  const highWinSampling =
    isFeatureSpin &&
    (ctx.state.currentResultSet.forceMaxWin || ctx.state.currentResultSet.userData?.tail)
      ? FEATURE_SPIN_HIGH_WIN_SAMPLING
      : undefined
  const randomFeatureSpinMultiplier = () =>
    featureSpinMultiplier(rng, highWinSampling?.stageWeights)
  const emit = (type: EventName, data: Record<string, unknown>) =>
    ctx.services.data.addBookEvent({ type, data })
  let feature: FeatureState | undefined
  let bonusPayout = 0
  let freeSpinsPlayed = 0
  let triggerPositions: { reel: number; row: number }[] = []

  function draw(forceScatters: number, maxScatters: number, spawnCount: number): Board {
    const reels = ctx.services.board.getRandomReelset()
    const scatterStops =
      forceScatters > 0
        ? ctx.services.board.getReelStopsForSymbol(reels, ctx.config.symbols.get("S")!)
        : undefined
    for (let attempt = 0; attempt < 100_000; attempt++) {
      if (forceScatters > 0) {
        const forcedStops = ctx.services.board.getRandomReelStops(
          reels,
          scatterStops!,
          forceScatters,
        )
        ctx.services.board.drawBoardWithForcedStops({ reels, forcedStops })
      } else if (feature && rng.randomFloat(0, 1) < lineProbability) {
        ctx.services.board.drawBoardWithForcedStops({
          reels,
          forcedStops: bonusLineStops(
            reels,
            rng,
            feature.stage,
            !!ctx.state.currentResultSet.forceMaxWin,
          ),
          randomOffset: false,
        })
      } else ctx.services.board.drawBoardWithRandomStops(reels)
      const board = ctx.services.board
        .getBoardReels()
        .map((reel) => reel.map((s) => s.id)) as Board
      const perReel = board.map((reel) => reel.filter((s) => s === "S").length)
      const count = perReel.reduce((sum, value) => sum + value, 0)
      if (perReel.some((value) => value > 1)) continue
      if (forceScatters > 0 ? count !== forceScatters : count > maxScatters) continue
      if (spawnPositions(board).length < spawnCount) continue
      if (
        !feature &&
        !isFeatureSpin &&
        forceScatters === 0 &&
        count > 0 &&
        rng.randomFloat(0, 1) >= NON_TRIGGER_SCATTER_ACCEPTANCE
      )
        continue
      return board
    }
    throw new Error("Cannot draw a legal PandaFeasting board; check reel strips")
  }

  function spin(forceScatters = 0): number {
    const stageMultiplier = FEATURE_RULES.stageMultipliers[feature?.stage ?? 1]
    const explode =
      !feature &&
      // Triggering boards always draw exactly 3/4/5 forced scatters;
      // ordinary Base/ExtraChance/ExtraChance2 boards draw at most two.
      forceScatters === 0 &&
      (isFeatureSpin || rng.randomFloat(0, 1) < FEATURE_RULES.baseExplosionProbability)
    const spawn = explode || !!feature?.pendingSpawn
    const spawnCount = spawn
      ? weightedNumber(
          highWinSampling?.spawnCountWeights ?? FEATURE_RULES.spawnCountWeights,
          rng,
        )
      : 0
    const board = draw(forceScatters, feature || isFeatureSpin ? 0 : 2, spawnCount)
    const wilds: Wild[] = board.flatMap((reel, x) =>
      reel.flatMap((symbol, y) =>
        symbol === "W"
          ? [
              {
                position: [x, y] as [number, number],
                multiplier: isFeatureSpin
                  ? randomFeatureSpinMultiplier()
                  : stageMultiplier,
              },
            ]
          : [],
      ),
    )
    const naturalMultipliers = new Map(
      wilds.map((wild) => [positionKey(wild.position), wild.multiplier]),
    )
    if (!feature) triggerPositions = scatterPositions(board)
    if (explode) emit(EVENT.triggerExplode, {})
    // Empty ButchEm-specific fields preserve the existing reveal contract.
    emit(EVENT.reveal, {
      board: revealBoard(board, (pos) => naturalMultipliers.get(positionKey(pos)) ?? 1),
      anticipation: anticipation(board),
      upgrades: {},
      roamingWilds: [],
      ...(feature ? { bonusTier: feature.tier, freeSpin: freeSpinsPlayed } : {}),
    })
    if (spawn) {
      const added = spawnWilds(
        board,
        spawnCount,
        () => (isFeatureSpin ? randomFeatureSpinMultiplier() : stageMultiplier),
        rng,
      )
      wilds.push(...added)
      emit(EVENT.spawnNewStageWilds, {
        wilds: added.map((wild) => ({
          ...eventPosition(wild.position),
          multiplier: wild.multiplier,
        })),
      })
      if (feature) feature.pendingSpawn = false
    }
    // Keep the engine's board in sync with the visible post-spawn board.
    board.forEach((reel, x) =>
      reel.forEach((symbol, y) =>
        ctx.services.board.setSymbol(x, y, ctx.config.symbols.get(symbol)!),
      ),
    )
    const wins = capWins(
      evaluateLines(board, wilds),
      MAX_WIN - ctx.services.wallet.getCurrentWin(),
    )
    const info = winInfo(wins)
    if (info.totalWin > 0) {
      emit(EVENT.winInfo, info)
      emit(EVENT.setWin, {
        amount: info.totalWin,
        winLevel: calculateWinLevel(info.totalWin),
      })
      if (feature) bonusPayout = cents(bonusPayout + info.totalWin)
      emit(EVENT.setTotalWin, { amount: feature ? bonusPayout : info.totalWin })
    }
    ctx.services.wallet.addSpinWin(info.totalWin)
    ctx.services.wallet.confirmSpinWin()
    ctx.state.triggeredMaxWin = cents(ctx.services.wallet.getCurrentWin()) >= MAX_WIN
    for (const win of wins.filter((win) => win.payout > 0))
      ctx.services.data.tagSymbolOccurrence({
        symbolId: win.symbol,
        kind: win.count,
        spinType: ctx.state.currentSpinType,
      })
    if (feature && feature.stage < 5 && !ctx.state.triggeredMaxWin) {
      const collected = collectLowSymbols(board, wins)
      const initialProgress = feature.progress
      const finalProgress = initialProgress + collected.length
      emit(EVENT.collectSymbols, { symbols: collected, initialProgress, finalProgress })
      const unlocked = advanceStage(feature, collected.length)
      for (const stage of unlocked) {
        emit(EVENT.newStageUnlocked, { stage })
        // Top up to five, rather than add five. Cumulative counters retain
        // ButchEm semantics, so totalFs - spinsPlayed is exactly five.
        const additionalFs = FREE_SPINS - ctx.state.currentFreespinAmount
        ctx.services.game.awardFreespins(additionalFs)
        emit(EVENT.addAdditionalFreeSpins, {
          additionalFs,
          remainingFs: ctx.state.currentFreespinAmount,
          totalFs: ctx.state.totalFreespinAmount,
          positions: [],
        })
      }
    }
    return info.totalWin
  }

  if (isFeatureSpin) spin()
  else {
    const targetScatters = tier ? { normal: 3, super: 4, hidden: 5 }[tier] : 0
    const triggerWin = spin(targetScatters)
    if (tier && !ctx.state.triggeredMaxWin) {
      ctx.services.game.awardFreespins(FREE_SPINS)
      emit(EVENT.freeSpinTrigger, {
        tier,
        totalFs: FREE_SPINS,
        positions: triggerPositions,
      })
      bonusPayout = triggerWin
      feature = startFeature(tier)
      ctx.state.currentSpinType = SPIN_TYPE.FREE_SPINS
      while (ctx.state.currentFreespinAmount > 0 && !ctx.state.triggeredMaxWin) {
        ctx.state.currentFreespinAmount--
        freeSpinsPlayed++
        emit(EVENT.updateFreeSpin, {
          amount: freeSpinsPlayed,
          total: ctx.state.totalFreespinAmount,
        })
        spin()
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
