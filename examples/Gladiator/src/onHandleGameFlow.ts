import { GameContext, GameSymbol, LinesWinType, SPIN_TYPE } from "@slot-engine/core"
import { GameModesType, SymbolsType, UserStateType } from ".."

type Context = GameContext<GameModesType, SymbolsType, UserStateType>

// Helper function to round to 1 decimal places to avoid floating point precision issues
function roundToDecimal(value: number, decimals: number = 1): number {
  const multiplier = Math.pow(10, decimals)
  return Math.round(value * multiplier) / multiplier
}

// Shared wild-reel multiplier pool used by normal/super/hidden tiers.
const MULTIPLIER_TABLE: Array<{ value: number; weight: number }> = [
  { value: 2,   weight: 250 },
  { value: 3,   weight: 205 },
  { value: 4,   weight: 168 },
  { value: 5,   weight: 138 },
  { value: 6,   weight: 113 },
  { value: 7,   weight: 93  },
  { value: 8,   weight: 76  },
  { value: 9,   weight: 62  },
  { value: 10,  weight: 51  },
  { value: 12,  weight: 42  },
  { value: 14,  weight: 34  },
  { value: 16,  weight: 28  },
  { value: 18,  weight: 23  },
  { value: 20,  weight: 19  },
  { value: 25,  weight: 14  },
  { value: 30,  weight: 10  },
  { value: 35,  weight: 8   },
  { value: 40,  weight: 6   },
  { value: 50,  weight: 4   },
  { value: 75,  weight: 2   },
  { value: 100, weight: 1   },
  { value: 150, weight: 1   },
  { value: 250, weight: 1   },
]

function pickWeightedMultiplier(
  table: Array<{ value: number; weight: number }>,
  randomFloat: () => number,
): number {
  const totalWeight = table.reduce((sum, entry) => sum + entry.weight, 0)
  let roll = randomFloat() * totalWeight
  for (const entry of table) {
    roll -= entry.weight
    if (roll <= 0) return entry.value
  }
  return table[table.length - 1]!.value
}

export function onHandleGameFlow(ctx: Context) {
  const isFreeSpin = ctx.state.currentSpinType === SPIN_TYPE.FREE_SPINS

  drawBoard(ctx)
  handleAnticipation(ctx)

  const wildReelMultipliers = resolveWildReelMultipliers(ctx, isFreeSpin)
  addRevealEvent(ctx, wildReelMultipliers)

  const currentSpinWin = handleWins(ctx, wildReelMultipliers, isFreeSpin)
  ctx.services.wallet.confirmSpinWin()

  const spinTypeBeforeCheck = ctx.state.currentSpinType

  // Initialize the free-spin running total from the current base spin before checking triggers.
  if (spinTypeBeforeCheck === SPIN_TYPE.BASE_GAME) {
    ctx.state.userData.totalFreeSpinsWin = roundToDecimal(currentSpinWin)
  }

  if (hasReachedMaxWin(ctx)) {
    if (spinTypeBeforeCheck === SPIN_TYPE.BASE_GAME) {
      const totalPayout = capToMaxWin(ctx, ctx.services.wallet.getCurrentWin())
      if (totalPayout > 0) {
        ctx.services.data.addBookEvent({
          type: "finalWin",
          data: {
            amount: totalPayout,
          },
        })
      }
    }

    return
  }

  checkFreespins(ctx)

  // Only add finalWin if we're in base game and free spins weren't triggered
  if (spinTypeBeforeCheck === SPIN_TYPE.BASE_GAME && ctx.state.currentSpinType === SPIN_TYPE.BASE_GAME) {
    const totalPayout = capToMaxWin(ctx, ctx.services.wallet.getCurrentWin())
    if (totalPayout > 0) {
      ctx.services.data.addBookEvent({
        type: "finalWin",
        data: {
          amount: totalPayout,
        },
      })
    }
  }
}

function drawBoard(ctx: Context) {
  const reels = ctx.services.board.getRandomReelset()
  const scatter = ctx.config.symbols.get("S")!
  const wildReel = ctx.config.symbols.get("WR")!
  const isFreeSpin = ctx.state.currentSpinType === SPIN_TYPE.FREE_SPINS

  if (isFreeSpin) {
    // Keep redrawing until max 4 scatters land (the 5-scatter Hidden bonus
    // can only be triggered from the base game, never as an FS retrigger).
    while (true) {
      ctx.services.board.resetBoard()
      ctx.services.board.drawBoardWithRandomStops(reels)

      const scatInvalid = ctx.services.board.isSymbolOnAnyReelMultipleTimes(scatter)
      const [scatCount] = ctx.services.board.countSymbolsOnBoard(scatter)

      if (scatCount > 4 || scatInvalid) continue

      if (ctx.state.userData.isFirstHiddenFreeSpin && countWildReels(ctx) < 2) continue
      if (ctx.state.userData.isFirstSuperFreeSpin && countWildReels(ctx) < 1) continue

      break
    }

    if (ctx.state.userData.isFirstSuperFreeSpin) {
      ctx.state.userData.isFirstSuperFreeSpin = false
    }
    if (ctx.state.userData.isFirstHiddenFreeSpin) {
      ctx.state.userData.isFirstHiddenFreeSpin = false
    }

    // Restore sticky wild reels (with their fixed initial multiplier) — during
    // free spins a landed wild reel stays expanded for the rest of the feature.
    const persistentWildReels = ctx.state.userData.persistentWildReels
    if (persistentWildReels.size > 0) {
      const boardReels = ctx.services.board.getBoardReels()
      persistentWildReels.forEach((_multiplier, reelIndex) => {
        const reel = boardReels[reelIndex]
        if (!reel) return
        for (let row = 0; row < reel.length; row++) {
          reel[row] = wildReel
        }
      })
    }
  } else if (ctx.state.currentResultSet.forceFreespins) {
    // Force scatter trigger in base game
    const criteria = ctx.state.currentResultSet.criteria
    const targetScatters = criteria.includes("hidden") ? 5 : criteria.includes("super") ? 4 : 3
    const isFeatureSpin = ctx.state.currentGameMode === "featureSpin"
    // With S/WR forbidden from sharing a reel, a wild reel can only land on
    // a reel NOT forced to scatter — impossible once every reel is forced
    // (hidden tier forces all 5), so the guarantee only applies when at
    // least one reel is left free.
    const hasFreeReelForWildReel = targetScatters < reels.length

    while (true) {
      ctx.services.board.resetBoard()

      const reelStops = ctx.services.board.getReelStopsForSymbol(reels, scatter)
      const scatterReelStops = ctx.services.board.getRandomReelStops(
        reels,
        reelStops,
        targetScatters, // Force 3, 4 or 5 scatters depending on tier
      )

      ctx.services.board.drawBoardWithForcedStops({
        reels,
        forcedStops: scatterReelStops,
      })

      const scatInvalid = ctx.services.board.isSymbolOnAnyReelMultipleTimes(scatter)
      const [scatCount] = ctx.services.board.countSymbolsOnBoard(scatter)

      if (scatCount !== targetScatters || scatInvalid) continue

      // featureSpin: guarantee at least one expanding wild reel on EVERY base
      // spin, including the ones that trigger a bonus.
      if (isFeatureSpin && hasFreeReelForWildReel && !boardHasWildReel(ctx)) continue

      break
    }
  } else {
    const isFeatureSpin = ctx.state.currentGameMode === "featureSpin"

    if (isFeatureSpin) {
      // featureSpin: guarantee at least one expanding wild reel somewhere on
      // the board by forcing one reel to stop on a WR position.
      while (true) {
        ctx.services.board.resetBoard()

        const wildReelStops = ctx.services.board.getReelStopsForSymbol(reels, wildReel)
        const eligibleReels = wildReelStops
          .map((stops, reelIndex) => ({ reelIndex, stops }))
          .filter(({ stops }) => stops.length > 0)

        if (eligibleReels.length > 0) {
          const chosen = ctx.services.rng.randomItem(eligibleReels)
          ctx.services.board.drawBoardWithForcedStops({
            reels,
            forcedStops: { [chosen.reelIndex]: ctx.services.rng.randomItem(chosen.stops) },
          })
        } else {
          ctx.services.board.drawBoardWithRandomStops(reels)
        }

        const scatInvalid = ctx.services.board.isSymbolOnAnyReelMultipleTimes(scatter)
        const [scatCount] = ctx.services.board.countSymbolsOnBoard(scatter)

        // Base validation: max 2 scatters (same rule as normal base game).
        if (scatCount > 2 || scatInvalid) continue
        if (!boardHasWildReel(ctx)) continue

        break
      }
    } else {
      // Normal base game - limit to max 2 scatters
      while (true) {
        ctx.services.board.resetBoard()
        ctx.services.board.drawBoardWithRandomStops(reels)

        const scatInvalid = ctx.services.board.isSymbolOnAnyReelMultipleTimes(scatter)
        const [scatCount] = ctx.services.board.countSymbolsOnBoard(scatter)

        // Base validation: max 2 scatters
        if (scatCount > 2 || scatInvalid) continue

        break
      }
    }
  }
}

function boardHasWildReel(ctx: Context): boolean {
  return ctx.services.board
    .getBoardReels()
    .some((reel) => reel.some((symbol) => symbol.properties.get("isWildReel")))
}

function countWildReels(ctx: Context): number {
  return ctx.services.board
    .getBoardReels()
    .reduce(
      (count, reel) =>
        count + (reel.some((symbol) => symbol.properties.get("isWildReel")) ? 1 : 0),
      0,
    )
}

// Expanding wild reel: a landed WR reel rolls ONE initial multiplier from the
// tier-appropriate pool and fills the whole reel with wilds. During free
// spins that multiplier is fixed/sticky for the rest of the feature — it
// never grows or re-rolls once set (see checkFreespins/endFreeSpins for the
// reset points).
function resolveWildReelMultipliers(ctx: Context, isFreeSpin: boolean): Map<number, number> {
  const boardReels = ctx.services.board.getBoardReels()
  const wildReelMultipliers = new Map<number, number>()
  const persistentWildReels = ctx.state.userData.persistentWildReels

  boardReels.forEach((reel, reelIndex) => {
    const hasWildReel = reel.some((symbol) => symbol.properties.get("isWildReel"))
    if (!hasWildReel) return

    if (isFreeSpin && persistentWildReels.has(reelIndex)) {
      // Sticky wild reel — keep its fixed initial multiplier.
      wildReelMultipliers.set(reelIndex, persistentWildReels.get(reelIndex)!)
      return
    }

    const mult = pickWeightedMultiplier(MULTIPLIER_TABLE, () => ctx.services.rng.randomFloat(0, 1))
    wildReelMultipliers.set(reelIndex, mult)

    if (isFreeSpin) {
      persistentWildReels.set(reelIndex, mult)
    }
  })

  return wildReelMultipliers
}

function capToMaxWin(ctx: Context, value: number) {
  return roundToDecimal(Math.min(value, ctx.config.maxWinX))
}

function hasReachedMaxWin(ctx: Context) {
  return roundToDecimal(ctx.services.wallet.getCurrentWin()) >= ctx.config.maxWinX
}

function getRemainingMaxWin(ctx: Context) {
  const remaining = ctx.config.maxWinX - ctx.services.wallet.getCurrentWin()
  return roundToDecimal(Math.max(0, remaining))
}

function trimWinsToMaxWin(
  wins: Array<{
    symbol: string
    kind: number
    win: number
    positions: Array<{ reel: number; row: number }>
    meta: {
      lineIndex: number
      multiplier: number
      winWithoutMult: number
      globalMult: number
      lineMultiplier: number
    }
  }>,
  remainingMaxWin: number,
) {
  if (remainingMaxWin <= 0 || wins.length === 0) return []

  let accumulated = 0
  const keptWins: typeof wins = []

  for (const win of wins) {
    const nextAccumulated = roundToDecimal(accumulated + win.win)

    if (nextAccumulated < remainingMaxWin) {
      keptWins.push(win)
      accumulated = nextAccumulated
      continue
    }

    if (nextAccumulated === remainingMaxWin) {
      keptWins.push(win)
      return keptWins
    }

    if (nextAccumulated > remainingMaxWin) {
      const triggerWinAmount = roundToDecimal(remainingMaxWin - accumulated)
      if (triggerWinAmount <= 0) return keptWins

      const originalWin = win.win <= 0 ? 1 : win.win
      const ratio = triggerWinAmount / originalWin

      keptWins.push(
        {
          ...win,
          win: triggerWinAmount,
          meta: {
            ...win.meta,
            winWithoutMult: roundToDecimal(win.meta.winWithoutMult * ratio),
          },
        },
      )

      return keptWins
    }
  }

  return keptWins
}

function scaleWinsToCap(
  wins: Array<{
    symbol: string
    kind: number
    win: number
    positions: Array<{ reel: number; row: number }>
    meta: {
      lineIndex: number
      multiplier: number
      winWithoutMult: number
      globalMult: number
      lineMultiplier: number
    }
  }>,
  rawTotal: number,
  cappedTotal: number,
) {
  if (rawTotal <= 0 || cappedTotal >= rawTotal) return wins

  const ratio = cappedTotal / rawTotal
  let accumulated = 0

  return wins.map((win, index) => {
    const isLast = index === wins.length - 1
    const cappedWin = isLast
      ? roundToDecimal(cappedTotal - accumulated)
      : roundToDecimal(win.win * ratio)

    accumulated = roundToDecimal(accumulated + cappedWin)

    return {
      ...win,
      win: cappedWin,
      meta: {
        ...win.meta,
        winWithoutMult: roundToDecimal(win.meta.winWithoutMult * ratio),
      },
    }
  })
}

function addRevealEvent(ctx: Context, wildReelMultipliers: Map<number, number>) {
  const boardReels = ctx.services.board.getBoardReels()
  const paddingTop = ctx.services.board.getPaddingTop()
  const paddingBottom = ctx.services.board.getPaddingBottom()
  const anticipation = ctx.services.board.getAnticipation()
  const wildReelSymbol = ctx.config.symbols.get("WR")!

  // Build the board data structure with symbol info, including padding
  // Each reel array contains: [paddingTop symbols, main symbols, paddingBottom symbols]
  const board = boardReels.map((reel, reelIndex) => {
    const isWildReelExpanded = wildReelMultipliers.has(reelIndex)
    const topPad = paddingTop[reelIndex] || []
    const bottomPad = paddingBottom[reelIndex] || []
    // Padding cells reflect the reel's true (unrelated) strip stop and can
    // otherwise still show a scatter even though the reel itself is fully
    // expanded to wild — force them to the wild reel symbol too so S/WR
    // can never visually share a reel.
    const allSymbols: GameSymbol[] = isWildReelExpanded
      ? [
          ...topPad.map(() => wildReelSymbol),
          ...reel,
          ...bottomPad.map(() => wildReelSymbol),
        ]
      : [...topPad, ...reel, ...bottomPad]
    const mult = wildReelMultipliers.get(reelIndex)

    return allSymbols.map((symbol: GameSymbol) => {
      const symbolData: Record<string, any> = {
        name: symbol.id,
      }

      // Add symbol properties if they exist
      if (symbol.properties.get("isWild")) {
        symbolData["Wild"] = true
      }
      if (symbol.properties.get("isWildReel")) {
        symbolData["Wild Reel"] = true
        if (mult !== undefined) symbolData["multiplier"] = mult
      }
      if (symbol.properties.get("isScatter")) {
        symbolData["Scatter"] = true
      }

      return symbolData
    })
  })

  // Get the padding positions (reel stops used for drawing)
  const paddingPositions = new Array(boardReels.length).fill(0)

  // Convert anticipation from boolean to 0/1
  const anticipationValues = anticipation.map((value) => (value ? 1 : 0))

  ctx.services.data.addBookEvent({
    type: "reveal",
    data: {
      board,
      paddingPositions,
      gameType: ctx.state.currentResultSet.criteria,
      anticipation: anticipationValues,
    },
  })
}

function handleAnticipation(ctx: Context) {
  const scatter = ctx.config.symbols.get("S")!
  const [_, scatterCount] = ctx.services.board.countSymbolsOnBoard(scatter)

  let count = 0

  for (const [i, reel] of ctx.services.board.getBoardReels().entries()) {
    // If we already have 2 scatters, set anticipation for remaining reels
    if (count >= 2) {
      ctx.services.board.setAnticipationForReel(i, true)
    }
    // Count scatters on this reel
    if (scatterCount[i] > 0) {
      count++
    }
  }
}

function handleWins(ctx: Context, wildReelMultipliers: Map<number, number>, isFreeSpin = false): number {
  const boardReels = ctx.services.board.getBoardReels()
  const wildReelSymbol = ctx.config.symbols.get("WR")!

  // Expand: any reel carrying a wild-reel multiplier becomes fully wild for
  // win evaluation (WR itself already reports isWild, but every row must be
  // wild for the whole reel to count, not just the row it physically landed on).
  const modifiedBoardReels = boardReels.map((reel, reelIndex) =>
    wildReelMultipliers.has(reelIndex) ? reel.map(() => wildReelSymbol) : reel,
  )

  // 5-reel x 4-row payline map: 4 straight lines, 3 adjacent-row-pair
  // zig-zags (2 lines each), and 2 V-shaped pairs (2 lines each) = 14 lines.
  const lines = new LinesWinType({
    ctx,
    lines: {
      1: [0, 0, 0, 0, 0],
      2: [1, 1, 1, 1, 1],
      3: [2, 2, 2, 2, 2],
      4: [3, 3, 3, 3, 3],
      5: [0, 1, 0, 1, 0],
      6: [1, 0, 1, 0, 1],
      7: [1, 2, 1, 2, 1],
      8: [2, 1, 2, 1, 2],
      9: [2, 3, 2, 3, 2],
      10: [3, 2, 3, 2, 3],
      11: [0, 1, 2, 1, 0],
      12: [1, 2, 3, 2, 1],
      13: [3, 2, 1, 2, 3],
      14: [2, 1, 0, 1, 2],
    },
    wildSymbol: { isWild: true },
  })

  const { winCombinations } = lines
    .evaluateWins(modifiedBoardReels)
    .getWins()

  let totalPayout = 0
  let processedWins = winCombinations.map((combo) => {
    // Sum the multipliers of every distinct wild reel touched by this line;
    // falls back to 1x if no wild reel is involved.
    const touchedReels = new Set<number>()
    combo.symbols.forEach((sym) => {
      if (wildReelMultipliers.has(sym.reelIndex)) touchedReels.add(sym.reelIndex)
    })

    const comboMultiplier = touchedReels.size > 0
      ? Array.from(touchedReels).reduce((sum, reelIndex) => sum + (wildReelMultipliers.get(reelIndex) ?? 1), 0)
      : 1

    const comboPayout = roundToDecimal(combo.payout * comboMultiplier)
    totalPayout += comboPayout

    return {
      symbol: combo.baseSymbol.id,
      kind: combo.kind,
      win: comboPayout,
      positions: combo.symbols.map((sym) => ({
        reel: sym.reelIndex,
        row: sym.posIndex,
      })),
      meta: {
        lineIndex: combo.lineNumber,
        multiplier: comboMultiplier,
        winWithoutMult: roundToDecimal(combo.payout),
        globalMult: 1,
        lineMultiplier: comboMultiplier,
      },
    }
  })

  totalPayout = roundToDecimal(totalPayout)

  const remainingMaxWin = getRemainingMaxWin(ctx)
  const cappedTotalPayout = capToMaxWin(ctx, Math.min(totalPayout, remainingMaxWin))

  if (totalPayout >= remainingMaxWin && cappedTotalPayout > 0) {
    processedWins = trimWinsToMaxWin(processedWins, remainingMaxWin)
  } else {
    processedWins = scaleWinsToCap(processedWins, totalPayout, cappedTotalPayout)
  }

  totalPayout = cappedTotalPayout

  if (totalPayout > 0 && processedWins.length > 0) {
    ctx.services.data.addBookEvent({
      type: "winInfo",
      data: {
        totalWin: totalPayout,
        wins: processedWins,
      },
    })

    const winLevel = calculateWinLevel(totalPayout)

    ctx.services.data.addBookEvent({
      type: "setWin",
      data: {
        amount: totalPayout,
        winLevel,
      },
    })

    if (isFreeSpin) {
      ctx.state.userData.totalFreeSpinsWin = capToMaxWin(
        ctx,
        ctx.state.userData.totalFreeSpinsWin + totalPayout,
      )
      ctx.services.data.addBookEvent({
        type: "setTotalWin",
        data: { amount: ctx.state.userData.totalFreeSpinsWin },
      })
    } else {
      ctx.services.data.addBookEvent({
        type: "setTotalWin",
        data: { amount: totalPayout },
      })
    }
  }

  ctx.services.wallet.addSpinWin(totalPayout)
  return totalPayout
}

function calculateWinLevel(payout: number): number {
  const multiplier = payout

  if (multiplier === 15000) return 6
  if (multiplier >= 200) return 5
  if (multiplier >= 50) return 4
  if (multiplier >= 25) return 3
  if (multiplier >= 15) return 2
  if (multiplier > 0) return 1

  return 0
}

function checkFreespins(ctx: Context) {
  const scatter = ctx.config.symbols.get("S")!
  const [scatCount] = ctx.services.board.countSymbolsOnBoard(scatter)

  let freespinsAwarded = ctx.services.game.getFreeSpinsForScatters(
    ctx.state.currentSpinType,
    scatCount,
  )

  if (freespinsAwarded <= 0) return

  // Determine the free-spin tier from the number of triggering scatters:
  //   3 scatters -> normal, 4 -> super, 5+ -> hidden.
  const isHiddenBonus = scatCount >= 5
  const isSuperBonus = !isHiddenBonus && scatCount >= 4
  const isTriggerSpin = ctx.state.currentSpinType === SPIN_TYPE.BASE_GAME
  const currentGameMode = ctx.state.currentGameMode

  // Fixed free-spin counts for specific bonus-buy modes, overriding the
  // shared scatter-count table above.
  if (isTriggerSpin) {
    if (currentGameMode === "bonusFeature" || currentGameMode === "superBonusFeature") {
      freespinsAwarded = 8
    } else if (currentGameMode === "mysteryBonusFeature" && isHiddenBonus) {
      freespinsAwarded = 8
    }
  }

  ctx.services.game.awardFreespins(freespinsAwarded)

  if (isTriggerSpin) {
    const positions: Array<{ reel: number; row: number }> = []
    const boardReels = ctx.services.board.getBoardReels()

    boardReels.forEach((reel, reelIndex) => {
      reel.forEach((symbol, rowIndex) => {
        if (symbol.properties.get("isScatter")) {
          positions.push({ reel: reelIndex, row: rowIndex })
        }
      })
    })

    const tier = isHiddenBonus ? "hidden" : isSuperBonus ? "super" : "normal"

    ctx.services.data.addBookEvent({
      type: "freeSpinTrigger",
      data: {
        totalFs: freespinsAwarded,
        positions,
        tier,
      },
    })

    // Initialize free spins state. Sticky wild reels start fresh for the
    // feature and keep their fixed multiplier across its spins (reset again
    // at endFreeSpins).
    ctx.state.userData.persistentWildReels = new Map()
    ctx.state.userData.isSuperFreeSpins = isSuperBonus
    ctx.state.userData.isFirstSuperFreeSpin = isSuperBonus
    ctx.state.userData.isHiddenFreeSpins = isHiddenBonus
    ctx.state.userData.isFirstHiddenFreeSpin = isHiddenBonus

    ctx.state.currentSpinType = SPIN_TYPE.FREE_SPINS
    playFreeSpins(ctx)
    return
  }

  // Free spins retrigger
  if (ctx.state.currentSpinType === SPIN_TYPE.FREE_SPINS) {
    const positions: Array<{ reel: number; row: number }> = []
    const boardReels = ctx.services.board.getBoardReels()

    boardReels.forEach((reel, reelIndex) => {
      reel.forEach((symbol, rowIndex) => {
        if (symbol.properties.get("isScatter")) {
          positions.push({ reel: reelIndex, row: rowIndex })
        }
      })
    })

    ctx.services.data.addBookEvent({
      type: "addAdditionalFreeSpins",
      data: {
        additionalFs: freespinsAwarded,
        remainingFs: ctx.state.currentFreespinAmount,
        totalFs: ctx.state.totalFreespinAmount,
        positions,
      },
    })
  }
}

function playFreeSpins(ctx: Context) {
  while (ctx.state.currentFreespinAmount > 0) {
    ctx.state.currentFreespinAmount--

    // Add updateFreeSpin event
    const currentSpin = ctx.state.totalFreespinAmount - ctx.state.currentFreespinAmount
    const totalSpins = ctx.state.totalFreespinAmount

    ctx.services.data.addBookEvent({
      type: "updateFreeSpin",
      data: {
        amount: currentSpin,
        total: totalSpins,
      },
    })

    drawBoard(ctx)
    const wildReelMultipliers = resolveWildReelMultipliers(ctx, true)
    addRevealEvent(ctx, wildReelMultipliers)
    handleWins(ctx, wildReelMultipliers, true)
    ctx.services.wallet.confirmSpinWin()

    if (hasReachedMaxWin(ctx)) {
      endFreeSpins(ctx)
      return
    }

    checkFreespins(ctx) // Check for retriggering
  }

  endFreeSpins(ctx)
}

function endFreeSpins(ctx: Context) {
  ctx.state.currentFreespinAmount = 0

  // Hidden tier guarantees a minimum 100x total win, topped up onto the
  // REAL wallet total (not just the display event) so it affects payout.
  const HIDDEN_MIN_WIN = 100
  if (
    ctx.state.userData.isHiddenFreeSpins &&
    ctx.state.userData.totalFreeSpinsWin < HIDDEN_MIN_WIN
  ) {
    const topUp = roundToDecimal(
      HIDDEN_MIN_WIN - ctx.state.userData.totalFreeSpinsWin,
    )
    ctx.services.wallet.addSpinWin(topUp)
    ctx.services.wallet.confirmSpinWin()
    ctx.state.userData.totalFreeSpinsWin = capToMaxWin(
      ctx,
      ctx.state.userData.totalFreeSpinsWin + topUp,
    )
    ctx.services.data.addBookEvent({
      type: "hiddenGuaranteeTopUp",
      data: { amount: topUp },
    })
  }

  // Free spins ended
  const totalWin = capToMaxWin(ctx, ctx.state.userData.totalFreeSpinsWin)
  const winLevel = calculateWinLevel(totalWin)

  ctx.services.data.addBookEvent({
    type: "freeSpinEnd",
    data: {
      amount: totalWin,
      winLevel,
    },
  })

  // Add final win event
  ctx.services.data.addBookEvent({
    type: "finalWin",
    data: {
      amount: totalWin,
    },
  })

  ctx.state.userData.persistentWildReels = new Map()
  ctx.state.userData.isSuperFreeSpins = false
  ctx.state.userData.isFirstSuperFreeSpin = false
  ctx.state.userData.isHiddenFreeSpins = false
  ctx.state.userData.isFirstHiddenFreeSpin = false
  ctx.state.userData.totalFreeSpinsWin = 0
}
