import {
  ClusterWinType,
  WinCombination,
  GameContext,
  Reels,
  SPIN_TYPE,
} from "@slot-engine/core"
import { GameModesType, SymbolsType, UserStateType } from ".."

type Context = GameContext<GameModesType, SymbolsType, UserStateType>

/**
 * 6x5 cluster-pays game flow with tumbling reels.
 * After all wins on a board are paid, the winning symbols are removed and new
 * symbols drop into the board (a "tumble"). This repeats until no more wins
 * occur. Like "Sugar Rush", win combinations build up multipliers on the board:
 * a position's multiplier doubles for each tumble win it's part of, up to 128x.
 * During free spins, multipliers do not reset between spins.
 */

export function onHandleGameFlow(ctx: Context) {
  // Build initial board multipliers starting at 0
  makeInitialBoardMultis(ctx)

  // Build the initial board
  drawBoard(ctx)

  // Set anticipation states based on scatters on board
  handleAnticipation(ctx)

  // Create event to tell the client what to render
  ctx.services.data.addBookEvent({
    type: "board-reveal",
    data: {
      // Note: If you can, only send IDs to minimize data size.
      board: getSymIdsFromReels(ctx.services.board.getBoardReels()),
      padTop: getSymIdsFromReels(ctx.services.board.getPaddingTop()),
      padBottom: getSymIdsFromReels(ctx.services.board.getPaddingBottom()),
      anticipation: ctx.services.board.getAnticipation(),
    },
  })

  // Tumble until no more wins.
  // This also creates event data for the frontend.
  handleTumbles(ctx)

  // Finalize this round's win
  ctx.services.wallet.confirmSpinWin()

  ctx.services.data.addBookEvent({
    type: "show-final-win",
    data: {
      payout: Math.min(ctx.services.wallet.getCurrentWin(), ctx.config.maxWinX),
    },
  })

  // If we reach max win in base game we can skip free spins entirely
  if (ctx.state.triggeredMaxWin) return

  // Maybe enter free spins loop
  checkFreespins(ctx)
}

function drawBoard(ctx: Context) {
  const reels = ctx.services.board.getRandomReelset()
  const scatter = ctx.config.symbols.get("S")!

  const numScatters = Number(
    ctx.services.rng.weightedRandom(
      getScatterWeights(ctx.state.currentResultSet.criteria),
    ),
  )

  if (
    // If free spins are forced via the result set, draw board with scatters
    ctx.state.currentResultSet.forceFreespins &&
    ctx.state.currentSpinType == SPIN_TYPE.BASE_GAME
  ) {
    while (true) {
      ctx.services.board.resetBoard()

      const reelStops = ctx.services.board.getReelStopsForSymbol(reels, scatter)
      const scatterReelStops = ctx.services.board.getRandomReelStops(
        reels,
        reelStops,
        numScatters,
      )

      ctx.services.board.drawBoardWithForcedStops({
        reels,
        forcedStops: scatterReelStops,
      })

      const scatInvalid = ctx.services.board.isSymbolOnAnyReelMultipleTimes(scatter)
      const [scatCount] = ctx.services.board.countSymbolsOnBoard(scatter)

      if (scatCount == numScatters && !scatInvalid) break
    }
  } else if (
    // If spin should NOT trigger free spins, draw board with up to 2 scatters
    !ctx.state.currentResultSet.forceFreespins &&
    ctx.state.currentSpinType == SPIN_TYPE.BASE_GAME
  ) {
    while (true) {
      ctx.services.board.resetBoard()
      ctx.services.board.drawBoardWithRandomStops(reels)

      const scatInvalid = ctx.services.board.isSymbolOnAnyReelMultipleTimes(scatter)
      const [scatCount] = ctx.services.board.countSymbolsOnBoard(scatter)

      if (scatCount > ctx.config.anticipationTriggers[ctx.state.currentSpinType]) {
        continue
      }

      if (!scatInvalid) break
    }
  } else {
    // If no special ResultSet criteria, or we are in FS, draw board normally
    while (true) {
      ctx.services.board.resetBoard()
      ctx.services.board.drawBoardWithRandomStops(reels)
      const scatInvalid = ctx.services.board.isSymbolOnAnyReelMultipleTimes(scatter)
      if (!scatInvalid) break
    }
  }
}

function handleAnticipation(ctx: Context) {
  const scatter = ctx.config.symbols.get("S")!
  const [_, scatCount] = ctx.services.board.countSymbolsOnBoard(scatter)

  let count = 0

  for (const [i, reel] of ctx.services.board.getBoardReels().entries()) {
    if (count >= ctx.config.anticipationTriggers[ctx.state.currentSpinType]) {
      ctx.services.board.setAnticipationForReel(i, true)
    }
    if (scatCount[i]! > 0) {
      count++
    }
  }
}

function handleTumbles(ctx: Context) {
  const cluster = new ClusterWinType({
    ctx,
  })

  // Keep tumbling until no more wins
  while (true) {
    let { payout, winCombinations } = cluster
      .evaluateWins(ctx.services.board.getBoardReels())
      .postProcess((wins) => processWins(wins, ctx))
      .getWins()

    if (payout === 0) break

    // Apply the feature-wide global multiplier. It is 1x in the base game and
    // in normal free spins, and ramps up during super/hidden free spins.
    payout = payout * ctx.state.userData.fsGlobalMulti

    // Deduplicate win symbols to avoid double processing.
    const winSymbols = ctx.services.game.dedupeWinSymbols(winCombinations)

    // Add event to tell client about all wins.
    // It could then highlight and destroy the winning symbols.
    ctx.services.data.addBookEvent({
      type: "highlight-cluster-wins",
      data: {
        winSymbols,
      },
    })

    // `addTumbleWin` already calls `addSpinWin`, so no need to do it here.
    ctx.services.wallet.addTumbleWin(payout)

    ctx.services.data.addBookEvent({
      type: "update-tumble-win",
      data: {
        payout,
      },
    })

    // Double board multipliers after win, capped by the active free-spin tier.
    // Super/hidden free spins raise the ceiling so multipliers compound higher.
    const multiCap = getTierConfig(ctx.state.userData.fsTier).multiCap
    for (const sym of winSymbols) {
      const currentMulti = ctx.state.userData.boardMultis[sym.reelIdx]![sym.rowIdx]!
      const newMulti = Math.max(1, Math.min(currentMulti * 2, multiCap))
      ctx.state.userData.boardMultis[sym.reelIdx]![sym.rowIdx] = newMulti
    }

    ctx.services.data.addBookEvent({
      type: "update-multipliers",
      data: {
        multipliers: ctx.state.userData.boardMultis,
      },
    })

    // Tumbling the board gives us the newly added symbols as well.
    // We can tell the client which new symbols to animate in.
    const { newBoardSymbols, newPaddingTopSymbols } =
      ctx.services.board.tumbleBoard(winSymbols)

    // Note: If you can, only send IDs to minimize data size.
    ctx.services.data.addBookEvent({
      type: "tumble-symbols",
      data: {
        newBoardSymbols: Object.fromEntries(
          Object.entries(newBoardSymbols).map(([reelIdx, symbols]) => [
            reelIdx,
            symbols.map((s) => s.id),
          ]),
        ),
        newPaddingTopSymbols: Object.fromEntries(
          Object.entries(newPaddingTopSymbols).map(([reelIdx, symbols]) => [
            reelIdx,
            symbols.map((s) => s.id),
          ]),
        ),
      },
    })

    // Reached max win, stop win calculation
    if (payout >= ctx.config.maxWinX) {
      ctx.state.triggeredMaxWin = true
      break
    }
  }
}

function checkFreespins(ctx: Context) {
  const scatter = ctx.config.symbols.get("S")!
  const [scatCount] = ctx.services.board.countSymbolsOnBoard(scatter)

  const freespinsAwarded = ctx.services.game.getFreeSpinsForScatters(
    ctx.state.currentSpinType,
    scatCount,
  )

  // no freespins, return early
  if (freespinsAwarded <= 0) return

  ctx.services.game.awardFreespins(freespinsAwarded)

  // Ensure we only trigger free spins from base game.
  // Our playFreeSpins function handles the free spins loop already and we don't want recursion.
  if (ctx.state.currentSpinType == SPIN_TYPE.BASE_GAME) {
    // In some cases, free spins might be triggered in a non-freespins result set,
    // for example when the third scatter drops in during tumbling.
    // Make this simulation invalid to skip it.
    const forbiddenResultSets = ["0", "basegame"]
    if (forbiddenResultSets.includes(ctx.state.currentResultSet.criteria)) {
      ctx.services.wallet.addSpinWin(-999999999)
    }

    // Determine the free-spin tier from the number of triggering scatters and
    // initialize the feature-wide global multiplier for that tier.
    //   3 scatters  -> normal free spins
    //   4-5 scatters -> super free spins  (higher value)
    //   6 scatters  -> hidden free spins (highest value)
    const tier = getTierForScatters(scatCount)
    ctx.state.userData.fsTier = tier
    ctx.state.userData.fsGlobalMulti = getTierConfig(tier).startMulti

    ctx.services.data.addBookEvent({
      type: "fs-triggered",
      data: {
        fs: freespinsAwarded,
        tier,
        globalMulti: ctx.state.userData.fsGlobalMulti,
      },
    })

    // We can optionally record how many scatters triggered the free spins
    ctx.services.data.recordSymbolOccurrence({
      kind: scatCount,
      symbolId: scatter.id,
      spinType: ctx.state.currentSpinType,
    })

    ctx.services.data.record({
      triggeredFS: true,
    })

    playFreeSpins(ctx)
    // We return here to avoid recording a retrigger event right after all free spins were played
    return
  }

  // If we are already in free spins, record a retrigger event
  if (ctx.state.currentSpinType == SPIN_TYPE.FREE_SPINS) {
    ctx.services.data.addBookEvent({
      type: "fs-retriggered",
      data: {
        fs: freespinsAwarded,
      },
    })
  }
}

function playFreeSpins(ctx: Context) {
  // Change spin type to free spins manually (Slot Engine does not do this automatically yet)
  ctx.state.currentSpinType = SPIN_TYPE.FREE_SPINS

  // Free spins loop
  while (ctx.state.currentFreespinAmount > 0) {
    ctx.state.currentFreespinAmount--

    ctx.services.data.addBookEvent({
      type: "update-fs-amount",
      data: {
        fs: ctx.state.currentFreespinAmount,
        totalFs: ctx.state.totalFreespinAmount,
      },
    })

    drawBoard(ctx)
    handleAnticipation(ctx)

    ctx.services.data.addBookEvent({
      type: "board-reveal",
      data: {
        // Note: If you can, only send IDs to minimize data size.
        board: getSymIdsFromReels(ctx.services.board.getBoardReels()),
        padTop: getSymIdsFromReels(ctx.services.board.getPaddingTop()),
        padBottom: getSymIdsFromReels(ctx.services.board.getPaddingBottom()),
        anticipation: ctx.services.board.getAnticipation(),
      },
    })

    handleTumbles(ctx)

    // Add event before calling `confirmSpinWin()`, because the spin win will be reset.
    ctx.services.data.addBookEvent({
      type: "show-fs-spin-win",
      data: {
        payout: Math.min(ctx.services.wallet.getCurrentSpinWin(), ctx.config.maxWinX),
      },
    })

    ctx.services.wallet.confirmSpinWin()

    // We don't want to play more free spins if max win was reached
    if (ctx.state.triggeredMaxWin) break

    // Ramp the feature-wide global multiplier for the next free spin.
    // Normal free spins have a ramp of 0 (it stays flat at 1x); super and
    // hidden free spins grow the multiplier every spin, making later spins
    // progressively more valuable.
    const tierCfg = getTierConfig(ctx.state.userData.fsTier)
    if (tierCfg.ramp > 0) {
      ctx.state.userData.fsGlobalMulti += tierCfg.ramp
      ctx.services.data.addBookEvent({
        type: "update-global-multi",
        data: {
          globalMulti: ctx.state.userData.fsGlobalMulti,
        },
      })
    }

    checkFreespins(ctx)
  }

  // All FS have been played at this point so we can send the total win amount using `getCurrentWin()`.
  ctx.services.data.addBookEvent({
    type: "show-fs-win",
    data: {
      payout: Math.min(ctx.services.wallet.getCurrentWin(), ctx.config.maxWinX),
    },
  })
}

type FsTier = "normal" | "super" | "hidden"

/**
 * Configuration for each free-spin tier. Higher tiers are more valuable:
 *  - `startMulti`: the feature-wide global multiplier the tier starts at.
 *  - `ramp`: how much the global multiplier grows after every free spin.
 *  - `multiCap`: the ceiling for the persistent per-position multipliers, so
 *    higher tiers let multipliers compound further.
 */
const FS_TIERS: Record<
  FsTier,
  { startMulti: number; ramp: number; multiCap: number }
> = {
  // Normal free spins (3 scatters): persistent position multipliers double up
  // to 128x, no feature-wide global multiplier.
  normal: { startMulti: 1, ramp: 0, multiCap: 128 },
  // Super free spins (4-5 scatters): higher multiplier ceiling and a global
  // multiplier that starts at 2x and grows by 1x every free spin.
  super: { startMulti: 2, ramp: 1, multiCap: 256 },
  // Hidden free spins (6 scatters): the most valuable tier. Global multiplier
  // starts at 3x and grows by 2x every free spin, with the highest ceiling.
  hidden: { startMulti: 3, ramp: 2, multiCap: 512 },
}

function getTierConfig(tier: FsTier) {
  return FS_TIERS[tier]
}

function getTierForScatters(scatCount: number): FsTier {
  if (scatCount >= 6) return "hidden"
  if (scatCount >= 4) return "super"
  return "normal"
}

function getScatterWeights(key: string) {
  const SCATTER_WEIGHTS = {
    freespins: {
      3: 80,
      4: 10,
      5: 1,
      6: 0.5,
    },
    maxwin: {
      5: 1,
      6: 2,
    },
  }

  if (key in SCATTER_WEIGHTS) {
    return SCATTER_WEIGHTS[key as keyof typeof SCATTER_WEIGHTS]
  }

  return SCATTER_WEIGHTS.freespins
}

function makeInitialBoardMultis(ctx: Context) {
  const mode =
    ctx.config.gameModes[ctx.state.currentGameMode as keyof typeof ctx.config.gameModes]

  const reelsNum = mode.reelsAmount
  const symbolsPerReel = mode.symbolsPerReel

  const boardMultis: number[][] = []

  for (let r = 0; r < reelsNum; r++) {
    const reelMultis: number[] = []
    for (let s = 0; s < symbolsPerReel[r]!; s++) {
      reelMultis.push(0)
    }
    boardMultis.push(reelMultis)
  }

  ctx.state.userData.boardMultis = boardMultis
  // Reset the free-spin tier state for the new base round.
  ctx.state.userData.fsTier = "normal"
  ctx.state.userData.fsGlobalMulti = 1
}

function processWins(wins: WinCombination[], ctx: Context) {
  const winCombinations = wins.map((wc) => {
    const multiForCluster = wc.symbols.reduce((multi, s) => {
      const multiOnPos = ctx.state.userData.boardMultis[s.reelIndex]![s.posIndex]!
      // A winning cluster must first "activate" the multiplier on a position (multi 0 -> 1).
      // Only on the next win does the multiplier apply (multi 1 -> 2).
      // Multipliers themselves are updated in `handleTumbles()`.
      // This function here just applies the multiplier to the payout.
      return multiOnPos >= 2 ? multiOnPos + multi : multi
    }, 0)

    // Multi is initially 0, so we ensure at least 1x payout
    const payout = wc.payout * Math.max(1, multiForCluster)

    return {
      ...wc,
      payout,
    }
  })
  return { winCombinations }
}

function getSymIdsFromReels(reels: Reels) {
  return reels.map((reel) => reel.map((s) => s.id))
}
