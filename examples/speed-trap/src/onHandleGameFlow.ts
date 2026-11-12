import { GameContext, SPIN_TYPE } from "@slot-engine/core"
import type { gameModes, symbols, userState } from ".."
import { capWins, evaluateLines } from "./evaluations"
import {
  EVENT,
  anticipation,
  calculateWinLevel,
  cameraStatus,
  revealBoard,
  winInfo,
} from "./events"
import {
  addHeadOnPartners,
  addFeatureSpinCars,
  applyStickyCars,
  cameraActivationFromScatters,
  countScatters,
  drawRandomDistinctReels,
  extractLandedCars,
  hasIllegalScatterPath,
  hasLegalCarLandings,
  hasLegalCarMovement,
  pickFeatureSpinCameraCount,
  resolveCarMove,
  stickyFromCars,
} from "./feature"
import {
  BONUS_ENTRY_RULES,
  FEATURE_SPIN_MIN_NEW_CARS,
  FEATURE_TO_BONUS_TRIGGER_SCALE,
  HEAD_ON_FREE_PAIR_CHANCE,
  HEAD_ON_PARTNER_CHANCE,
  MODES,
} from "./settings"
import { bonusMinimum } from "./math"
import { maxWinReelStops } from "./reels"
import {
  Board,
  BonusTier,
  FREE_SPINS,
  MAX_WIN,
  ModeName,
  StickyCar,
  SymbolId,
  cents,
  positionKey,
} from "./types"

type Context = GameContext<typeof gameModes, typeof symbols, typeof userState>

export function onHandleGameFlow(ctx: Context) {
  const mode = ctx.state.currentGameMode as ModeName
  const settings = MODES[mode]
  ctx.state.userData.bonusMinimum = 0
  ctx.state.userData.bonusPayout = 0
  ctx.state.userData.bonusTier = "none"
  const emit = (type: string, data: Record<string, unknown>) =>
    ctx.services.data.addBookEvent({ type, data })

  const randomFloat = () => ctx.services.rng.randomFloat(0, 1)
  const randomItem = <T>(items: readonly T[]) =>
    items[Math.floor(randomFloat() * items.length)]!

  function drawSpinBoard(args: {
    isFreeSpin: boolean
    activeCameras: number[]
    forceScatters: number
    maxScatters: number
    stickyCars: StickyCar[]
    minNewCars: number
    headOnPairChance: number
  }) {
    const {
      isFreeSpin,
      activeCameras,
      forceScatters,
      maxScatters,
      stickyCars,
      minNewCars,
      headOnPairChance,
    } = args
    const reels = ctx.services.board.getRandomReelset()
    const scatter = ctx.config.symbols.get("S")!
    const scatterStops = ctx.services.board.getReelStopsForSymbol(reels, scatter)
    const emptyRows = Array.from({ length: 4 }, (_, row) => row)
      .filter((row) => !stickyCars.some((car) => car.position[1] === row))

    for (let attempt = 0; attempt < 100_000; attempt++) {
      if (forceScatters > 0) {
        const forcedStops = ctx.services.board.getRandomReelStops(
          reels,
          scatterStops,
          forceScatters,
        )
        ctx.services.board.drawBoardWithForcedStops({ reels, forcedStops })
      } else if (
        (ctx.state.currentResultSet.forceMaxWin ||
          (ctx.state.currentResultSet.userData?.sampleHighWins && randomFloat() < 0.6)) &&
        emptyRows.length > 0
      ) {
        ctx.services.board.drawBoardWithForcedStops({
          reels,
          forcedStops: maxWinReelStops(reels, randomFloat, emptyRows),
          randomOffset: false,
        })
      } else {
        ctx.services.board.drawBoardWithRandomStops(reels)
      }

      const raw = ctx.services.board
        .getBoardReels()
        .map((reel: Array<{ id: string }>) =>
          reel.map((symbol: { id: string }) => symbol.id as SymbolId),
        ) as Board
      const perReelScatters = raw.map(
        (reel) => reel.filter((symbol) => symbol === "S").length,
      )
      const scatterCount = perReelScatters.reduce((sum, value) => sum + value, 0)
      if (perReelScatters.some((count) => count > 1)) continue
      if (isFreeSpin && activeCameras.some((reel) => perReelScatters[reel] > 0))
        continue
      if (forceScatters > 0 ? scatterCount !== forceScatters : scatterCount > maxScatters)
        continue

      const withPartners = addHeadOnPartners({
        board: applyStickyCars(raw, stickyCars),
        stickyCars,
        chance: HEAD_ON_PARTNER_CHANCE[isFreeSpin ? "free" : "paid"],
        pairChance: headOnPairChance,
        allowScatterCrossing: isFreeSpin,
        randomFloat,
      })
      const withSticky = mode === "featureSpin" && !isFreeSpin
        ? addFeatureSpinCars(withPartners, randomFloat, minNewCars)
        : withPartners
      const landedCars = extractLandedCars(withSticky, stickyCars)
      if (landedCars.length < minNewCars) continue
      if (!hasLegalCarLandings(withSticky, stickyCars)) continue
      if (!isFreeSpin && hasIllegalScatterPath(withSticky, stickyCars)) continue

      const cameraActivation = isFreeSpin
        ? cameraActivationFromScatters(withSticky, activeCameras)
        : { activeReels: activeCameras, newlyActivated: [] as number[] }
      const movement = resolveCarMove({
        board: withSticky,
        stickyCars,
        activeCameraReels: cameraActivation.activeReels,
        allowScatterCrossing: isFreeSpin,
        randomFloat,
      })
      if (!hasLegalCarMovement(movement.carsAfterMove)) continue

      return { board: withSticky, cameraActivation, movement }
    }

    throw new Error(
      "Cannot draw a legal Speed Trap board; check reel strips and constraints",
    )
  }

  function triggerTierFromScatters(scatterCount: number): BonusTier | undefined {
    if (scatterCount >= 5) return "hidden"
    if (scatterCount === 4) return "super"
    if (scatterCount === 3) return "normal"
    return undefined
  }

  function runSingleSpin(args: {
    isFreeSpin: boolean
    stickyCars: StickyCar[]
    activeCameras: number[]
    minNewCars: number
    forceTier?: BonusTier
    headOnPairChance?: number
  }) {
    const { isFreeSpin, stickyCars, activeCameras, minNewCars, forceTier } = args
    const forcedScatters = forceTier
      ? forceTier === "normal"
        ? 3
        : forceTier === "super"
          ? 4
          : 5
      : 0
    const draw = drawSpinBoard({
      isFreeSpin,
      activeCameras,
      forceScatters: forcedScatters,
      maxScatters: isFreeSpin ? 5 : 5,
      stickyCars,
      headOnPairChance: args.headOnPairChance ?? 0,
      minNewCars,
    })

    const { cameraActivation, movement } = draw
    const currentCameraState = cameraActivation.activeReels

    const baseMultipliers = new Map(
      stickyCars.map((car) => [positionKey(car.position), car.multiplier]),
    )
    emit(EVENT.reveal, {
      board: revealBoard(draw.board, (pos) => baseMultipliers.get(positionKey(pos)) ?? 1),
      anticipation: isFreeSpin ? draw.board.map(() => 0) : anticipation(draw.board),
      cameraStatus: cameraStatus(currentCameraState),
      ...(isFreeSpin ? { newlyActivatedCameras: cameraActivation.newlyActivated } : {}),
    })

    if (movement.event.cars.length > 0) emit(EVENT.carMove, movement.event)

    movement.boardAfterMove.forEach((reel, x) =>
      reel.forEach((symbol, y) =>
        ctx.services.board.setSymbol(x, y, ctx.config.symbols.get(symbol)!),
      ),
    )

    const wins = capWins(
      evaluateLines(movement.boardAfterMove, movement.multipliers),
      MAX_WIN - ctx.services.wallet.getCurrentWin(),
    )
    const info = winInfo(wins)
    if (info.totalWin > 0) {
      emit(EVENT.winInfo, info)
      emit(EVENT.setWin, {
        amount: info.totalWin,
        winLevel: calculateWinLevel(info.totalWin),
      })
    }

    ctx.services.wallet.addSpinWin(info.totalWin)
    ctx.services.wallet.confirmSpinWin()
    ctx.state.triggeredMaxWin = cents(ctx.services.wallet.getCurrentWin()) >= MAX_WIN
    for (const win of wins.filter((item) => item.payout > 0)) {
      ctx.services.data.tagSymbolOccurrence({
        symbolId: win.symbol,
        kind: win.count,
        spinType: ctx.state.currentSpinType,
      })
    }

    return {
      payout: info.totalWin,
      scatterCount: countScatters(draw.board),
      camerasAfter: currentCameraState,
      stickyAfter: stickyFromCars(movement.carsAfterMove),
    }
  }

  function runBonus(args: {
    tier: BonusTier
    triggerPayout: number
    triggerCars: StickyCar[]
    triggerCameras: number[]
  }) {
    const { tier, triggerPayout, triggerCars, triggerCameras } = args
    ctx.state.userData.bonusMinimum = bonusMinimum(mode, tier)
    const rules = BONUS_ENTRY_RULES[tier]
    let bonusPayout = cents(triggerPayout)
    let stickyCars = triggerCars
    const inactiveReels = Array.from({ length: 5 }, (_, reel) => reel)
      .filter((reel) => !triggerCameras.includes(reel))
    const additionalCameras = drawRandomDistinctReels(
      rules.initialActiveCameras, randomFloat, inactiveReels.length,
    ).map((index) => inactiveReels[index])
    let activeCameras = [...triggerCameras, ...additionalCameras].sort((a, b) => a - b)

    ctx.services.game.awardFreespins(FREE_SPINS)
    emit(EVENT.freeSpinTrigger, {
      tier,
      totalFs: FREE_SPINS,
      initialCameraStatus: cameraStatus(activeCameras),
    })

    ctx.state.currentSpinType = SPIN_TYPE.FREE_SPINS
    let played = 0
    while (ctx.state.currentFreespinAmount > 0 && !ctx.state.triggeredMaxWin) {
      ctx.state.currentFreespinAmount--
      played++
      emit(EVENT.updateFreeSpin, { amount: played, total: ctx.state.totalFreespinAmount })

      const result = runSingleSpin({
        isFreeSpin: true,
        stickyCars,
        activeCameras,
        minNewCars: played === 1 ? rules.firstSpinMinNewCars : 0,
        headOnPairChance: HEAD_ON_FREE_PAIR_CHANCE[tier],
      })
      stickyCars = result.stickyAfter
      activeCameras = result.camerasAfter
      bonusPayout = cents(bonusPayout + result.payout)
      emit(EVENT.setTotalWin, { amount: bonusPayout })
    }

    ctx.state.currentFreespinAmount = 0
    emit(EVENT.freeSpinEnd, {
      amount: bonusPayout,
      winLevel: calculateWinLevel(bonusPayout),
    })
    ctx.state.userData.bonusPayout = bonusPayout
  }

  const isFeatureSpinMode = mode === "featureSpin"
  const forcedTier =
    settings.boughtTier ??
    (ctx.state.currentResultSet.forceMaxWin
      ? (mode === "featureSpin" ? "normal" : "hidden")
      : ctx.state.currentResultSet.forceFreespins
      ? (ctx.state.currentResultSet.userData?.tier as BonusTier | undefined)
      : ctx.state.currentResultSet.userData?.sampleHighWins &&
        !ctx.state.currentResultSet.userData?.ordinaryOnly
        ? "hidden"
        : undefined)

  ctx.state.currentSpinType = SPIN_TYPE.BASE_GAME
  const paidSpin = runSingleSpin({
    isFreeSpin: false,
    stickyCars: [],
    activeCameras: isFeatureSpinMode
      ? drawRandomDistinctReels(pickFeatureSpinCameraCount(randomFloat), randomFloat)
      : [],
    minNewCars: isFeatureSpinMode
      ? ctx.state.currentResultSet.userData?.minNewCars ?? FEATURE_SPIN_MIN_NEW_CARS
      : 0,
    forceTier: forcedTier,
  })

  let tier = forcedTier ?? triggerTierFromScatters(paidSpin.scatterCount)
  if (
    tier &&
    isFeatureSpinMode &&
    !forcedTier &&
    randomFloat() > FEATURE_TO_BONUS_TRIGGER_SCALE
  ) {
    tier = undefined
  }

  if (tier && !ctx.state.triggeredMaxWin) {
    ctx.state.userData.bonusTier = tier
    runBonus({
      tier,
      triggerPayout: paidSpin.payout,
      triggerCars: paidSpin.stickyAfter,
      triggerCameras: paidSpin.camerasAfter,
    })
    ctx.services.data.tag({ triggeredFS: true, bonusTier: tier, sourceMode: mode })
  } else {
    ctx.state.userData.bonusPayout = 0
    ctx.services.data.tag({ triggeredFS: false, bonusTier: "none", sourceMode: mode })
  }

  const payout = cents(ctx.services.wallet.getCurrentWin())
  if (payout > 0) emit(EVENT.finalWin, { amount: payout })
}
