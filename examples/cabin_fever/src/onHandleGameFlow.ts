import { GameContext, GameSymbol, LinesWinType, SPIN_TYPE } from "@slot-engine/core"
import { GameModesType, SymbolsType, UserStateType } from ".."

type Context = GameContext<GameModesType, SymbolsType, UserStateType>

// Helper function to round to 1 decimal places to avoid floating point precision issues
function roundToDecimal(value: number, decimals: number = 1): number {
  const multiplier = Math.pow(10, decimals)
  return Math.round(value * multiplier) / multiplier
}

// Weighted multiplier tables — higher values have lower weights so they feel rarer.
// Low-to-mid weights boosted significantly so high multipliers (30–50) are
// proportionally much rarer, reducing the frequency of max-win simulation books.
const MULTIPLIER_TABLE: Array<{ value: number; weight: number }> = [
  { value: 2,   weight: 250 },
  { value: 3,   weight: 200 },
  { value: 4,   weight: 150 },
  { value: 5,   weight: 120 },
  { value: 6,   weight: 90  },
  { value: 8,   weight: 50  },
  { value: 10,  weight: 25  },
  { value: 12,  weight: 10  },
  { value: 15,  weight: 5   },
  { value: 20,  weight: 2   },
  { value: 25,  weight: 1   },
  { value: 30,  weight: 1   },
  { value: 35,  weight: 1   },
  { value: 45,  weight: 1   },
  { value: 50,  weight: 1   },
]

// Super free spins table — minimum 5x multiplier.
// Same approach as MULTIPLIER_TABLE: low-to-mid weights boosted to dilute
// the probability of extreme multipliers and reduce max-win book frequency.
const SUPER_MULTIPLIER_TABLE: Array<{ value: number; weight: number }> = [
  { value: 5,   weight: 250 },
  { value: 6,   weight: 200 },
  { value: 8,   weight: 150 },
  { value: 10,  weight: 100 },
  { value: 12,  weight: 60  },
  { value: 15,  weight: 30  },
  { value: 20,  weight: 10  },
  { value: 25,  weight: 3   },
  { value: 30,  weight: 1   },
  { value: 35,  weight: 1   },
  { value: 45,  weight: 1   },
  { value: 50,  weight: 1   },
]

function posKey(reel: number, row: number): string {
  return `${reel}-${row}`
}

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

  const wildMultipliers = resolveWildMultipliers(ctx)
  addRevealEvent(ctx, wildMultipliers)

  const currentSpinWin = handleWins(ctx, wildMultipliers, isFreeSpin)
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
  const wild = ctx.config.symbols.get("W")!
  const isFreeSpin = ctx.state.currentSpinType === SPIN_TYPE.FREE_SPINS

  if (isFreeSpin) {
    const persistentWilds = ctx.state.userData.persistentWilds

    // Keep redrawing until max 4 scatters land (no 5-scatter hidden bonus in free spins)
    while (true) {
      ctx.services.board.resetBoard()
      ctx.services.board.drawBoardWithRandomStops(reels)

      const scatInvalid = ctx.services.board.isSymbolOnAnyReelMultipleTimes(scatter)
      const [scatCount] = ctx.services.board.countSymbolsOnBoard(scatter)

      if (scatCount > 4 || scatInvalid) continue
      break
    }

    // Restore sticky wilds at their saved positions
    if (persistentWilds.size > 0) {
      const boardReels = ctx.services.board.getBoardReels()
      persistentWilds.forEach((_multiplier, key) => {
        const [reelStr, rowStr] = key.split("-")
        const reel = parseInt(reelStr!)
        const row = parseInt(rowStr!)
        if (boardReels[reel] !== undefined && row < boardReels[reel]!.length) {
          boardReels[reel]![row] = wild
        }
      })
    }
  } else if (ctx.state.currentResultSet.forceFreespins) {
    // Force scatter trigger in base game
    const criteria = ctx.state.currentResultSet.criteria
    const targetScatters = criteria.includes("super") ? 4 : 3
    const isGuaranteedWilds = ctx.state.currentGameMode === "guaranteedTwoWilds"

    while (true) {
      ctx.services.board.resetBoard()

      const reelStops = ctx.services.board.getReelStopsForSymbol(reels, scatter)
      const scatterReelStops = ctx.services.board.getRandomReelStops(
        reels,
        reelStops,
        targetScatters, // Force 3 or 4 scatters depending on mode
      )

      ctx.services.board.drawBoardWithForcedStops({
        reels,
        forcedStops: scatterReelStops,
      })

      const scatInvalid = ctx.services.board.isSymbolOnAnyReelMultipleTimes(scatter)
      const [scatCount] = ctx.services.board.countSymbolsOnBoard(scatter)

      if (scatCount !== targetScatters || scatInvalid) continue

      // guaranteedTwoWilds: also ensure at least 2 wilds land alongside scatters
      if (isGuaranteedWilds) {
        const [wildCount] = ctx.services.board.countSymbolsOnBoard(wild)
        if (wildCount < 2) continue
      }

      break
    }
  } else {
    const isGuaranteedWilds = ctx.state.currentGameMode === "guaranteedTwoWilds"

    if (isGuaranteedWilds) {
      // guaranteedTwoWilds: force exactly 2 wild positions on every base spin.
      // The higher W weight in the guaranteedTwoWilds reel ensures enough stops
      // exist on each reel for getRandomReelStops to pick from quickly.
      while (true) {
        ctx.services.board.resetBoard()

        const wildReelStops = ctx.services.board.getReelStopsForSymbol(reels, wild)
        const forcedWildStops = ctx.services.board.getRandomReelStops(reels, wildReelStops, 2)
        ctx.services.board.drawBoardWithForcedStops({
          reels,
          forcedStops: forcedWildStops,
        })

        const scatInvalid = ctx.services.board.isSymbolOnAnyReelMultipleTimes(scatter)
        const [scatCount] = ctx.services.board.countSymbolsOnBoard(scatter)

        if (scatCount > 2 || scatInvalid) continue
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

function resolveWildMultipliers(ctx: Context): Map<string, number> {
  const boardReels = ctx.services.board.getBoardReels()
  const wildMultipliers = new Map<string, number>()
  const persistentWilds = ctx.state.userData.persistentWilds
  const isFreeSpin = ctx.state.currentSpinType === SPIN_TYPE.FREE_SPINS
  const isGuaranteedWilds = ctx.state.currentGameMode === "guaranteedTwoWilds"
  const table = (ctx.state.userData.isSuperFreeSpins || (!isFreeSpin && isGuaranteedWilds))
    ? SUPER_MULTIPLIER_TABLE
    : MULTIPLIER_TABLE

  boardReels.forEach((reel, reelIndex) => {
    reel.forEach((symbol, rowIndex) => {
      if (!symbol.properties.get("isWild")) return

      const key = posKey(reelIndex, rowIndex)

      if (persistentWilds.has(key)) {
        // Sticky wild — carry its accumulated multiplier into this spin
        wildMultipliers.set(key, persistentWilds.get(key)!)
      } else {
        // Newly landed wild — assign a fresh random multiplier.
        // Do NOT write to persistentWilds here; that happens after wins resolve
        // so the reveal multiplier is never prematurely committed.
        const mult = pickWeightedMultiplier(table, () => ctx.services.rng.randomFloat(0, 1))
        wildMultipliers.set(key, mult)
      }
    })
  })

  return wildMultipliers
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

function addRevealEvent(ctx: Context, wildMultipliers: Map<string, number>) {
  const boardReels = ctx.services.board.getBoardReels()
  const paddingTop = ctx.services.board.getPaddingTop()
  const paddingBottom = ctx.services.board.getPaddingBottom()
  const anticipation = ctx.services.board.getAnticipation()

  // Build the board data structure with symbol info, including padding
  // Each reel array contains: [paddingTop symbols, main symbols, paddingBottom symbols]
  const board = boardReels.map((reel, reelIndex) => {
    const topPad = paddingTop[reelIndex] || []
    const allSymbols: GameSymbol[] = [
      ...topPad,
      ...reel,
      ...(paddingBottom[reelIndex] || []),
    ]
    const topPadLen = topPad.length

    return allSymbols.map((symbol: GameSymbol, symbolIndex: number) => {
      const symbolData: Record<string, any> = {
        name: symbol.id,
      }

      // Add symbol properties if they exist
      if (symbol.properties.get("isWild")) {
        symbolData["Wild"] = true
        // Include multiplier for main-board wilds
        const mainRow = symbolIndex - topPadLen
        if (mainRow >= 0 && mainRow < reel.length) {
          const mult = wildMultipliers.get(posKey(reelIndex, mainRow))
          if (mult !== undefined) symbolData["multiplier"] = mult
        }
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

function handleWins(ctx: Context, wildMultipliers: Map<string, number>, isFreeSpin = false): number {
  const boardReels = ctx.services.board.getBoardReels()

  const lines = new LinesWinType({
    ctx,
    lines: {
      1: [0, 0, 0, 0, 0],
      2: [1, 1, 1, 1, 1],
      3: [2, 2, 2, 2, 2],
      4: [3, 3, 3, 3, 3],
      5: [4, 4, 4, 4, 4],
      6: [0, 1, 0, 1, 0],
      7: [1, 2, 1, 2, 1],
      8: [2, 3, 2, 3, 2],
      9: [3, 4, 3, 4, 3],
      10: [1, 0, 1, 0, 1],
      11: [2, 1, 2, 1, 2],
      12: [3, 2, 3, 2, 3],
      13: [4, 3, 4, 3, 4],
      14: [0, 1, 2, 3, 4],
      15: [4, 3, 2, 1, 0],
    },
    wildSymbol: { isWild: true },
  })

  const { winCombinations } = lines
    .evaluateWins(boardReels)
    .getWins()

  // Track how many winning combos each wild position participated in (for post-win growth)
  const wildWinCount = new Map<string, number>()

  let totalPayout = 0
  let processedWins = winCombinations.map((combo) => {
    // Collect wild positions used in this combo and sum their multipliers
    const wildsInCombo: string[] = []
    combo.symbols.forEach((sym) => {
      const key = posKey(sym.reelIndex, sym.posIndex)
      if (wildMultipliers.has(key)) wildsInCombo.push(key)
    })

    // Sum of all wild multipliers in this line; falls back to 1x if no wilds
    const comboMultiplier = wildsInCombo.length > 0
      ? wildsInCombo.reduce((sum, key) => sum + (wildMultipliers.get(key) ?? 1), 0)
      : 1

    // Count each wild's participation for post-win multiplier growth
    wildsInCombo.forEach((key) => {
      wildWinCount.set(key, (wildWinCount.get(key) ?? 0) + 1)
    })

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

  // Post-win phase: grow multipliers now (wins already used the reveal-time values),
  // but HOLD the event — it fires after winInfo/setWin/setTotalWin below.
  //
  // Growth is ADDITIVE: if a wild had 5x and wins one line that rolls a 10, the new
  // stored value is 15x. Each winning line participation earns one extra roll on top.
  // Non-winning new wilds are still registered as sticky (finalMult = currentMult).
  let incrementedWilds: Array<{ reel: number; row: number; addedMult: number; mult: number }> = []
  if (isFreeSpin) {
    const persistentWilds = ctx.state.userData.persistentWilds
    const table = ctx.state.userData.isSuperFreeSpins ? SUPER_MULTIPLIER_TABLE : MULTIPLIER_TABLE

    wildMultipliers.forEach((currentMult, key) => {
      const winCount = wildWinCount.get(key) ?? 0
      // Start from the wild's current accumulated value and add growth on top
      let addedMult = 0
      let finalMult = currentMult
      for (let i = 0; i < winCount; i++) {
        const roll = pickWeightedMultiplier(table, () => ctx.services.rng.randomFloat(0, 1))
        addedMult += roll
        finalMult += roll
      }

      // Always write back — registers new wilds as sticky, updates grown sticky wilds
      wildMultipliers.set(key, finalMult)
      persistentWilds.set(key, finalMult)

      // Only include in the event if the multiplier actually grew this spin
      if (winCount > 0) {
        const [reelStr, rowStr] = key.split("-")
        incrementedWilds.push({ reel: parseInt(reelStr!), row: parseInt(rowStr!), addedMult, mult: finalMult })
      }
    })
  }

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

  // Emit incrementWildMultipliers AFTER all win events (winInfo → setWin → setTotalWin)
  // and BEFORE the next spin's updateFreeSpin event.
  if (incrementedWilds.length > 0) {
    ctx.services.data.addBookEvent({
      type: "incrementWildMultipliers",
      data: { wilds: incrementedWilds },
    })
  }

  ctx.services.wallet.addSpinWin(totalPayout)
  return totalPayout
}

function calculateWinLevel(payout: number): number {
  const multiplier = payout

  if (multiplier >= 250) return 5
  if (multiplier >= 100) return 4
  if (multiplier >= 25) return 3
  if (multiplier >= 5) return 2
  if (multiplier > 0) return 1

  return 0
}

function checkFreespins(ctx: Context) {
  const scatter = ctx.config.symbols.get("S")!
  const [scatCount] = ctx.services.board.countSymbolsOnBoard(scatter)

  const freespinsAwarded = ctx.services.game.getFreeSpinsForScatters(
    ctx.state.currentSpinType,
    scatCount,
  )

  if (freespinsAwarded <= 0) return

  ctx.services.game.awardFreespins(freespinsAwarded)

  if (ctx.state.currentSpinType === SPIN_TYPE.BASE_GAME) {
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
      type: "freeSpinTrigger",
      data: {
        totalFs: freespinsAwarded,
        positions,
      },
    })

    // Initialize free spins state
    ctx.state.userData.persistentWilds = new Map()
    ctx.state.userData.isSuperFreeSpins = scatCount >= 4

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
    const wildMultipliers = resolveWildMultipliers(ctx)
    addRevealEvent(ctx, wildMultipliers)
    handleWins(ctx, wildMultipliers, true)
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

  ctx.state.userData.persistentWilds = new Map()
  ctx.state.userData.isSuperFreeSpins = false
  ctx.state.userData.totalFreeSpinsWin = 0
}
