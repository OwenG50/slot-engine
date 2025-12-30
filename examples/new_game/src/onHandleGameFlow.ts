import { GameContext, GameSymbol, LinesWinType, SPIN_TYPE } from "@slot-engine/core"
import { GameModesType, SymbolsType, UserStateType } from ".."

type Context = GameContext<GameModesType, SymbolsType, UserStateType>

export function onHandleGameFlow(ctx: Context) {
  const isFreeSpin = ctx.state.currentSpinType === SPIN_TYPE.FREE_SPINS
  
  drawBoard(ctx)
  handleAnticipation(ctx)
  addRevealEvent(ctx)
  
  const wildReelMultipliers = isFreeSpin 
    ? handleExpandingWildsForFreeSpins(ctx)
    : handleExpandingWilds(ctx)
    
  handleWins(ctx, wildReelMultipliers, isFreeSpin)
  ctx.services.wallet.confirmSpinWin()
  
  const spinTypeBeforeCheck = ctx.state.currentSpinType
  checkFreespins(ctx)
  
  // Only add finalWin if we're in base game and free spins weren't triggered
  if (spinTypeBeforeCheck === SPIN_TYPE.BASE_GAME && ctx.state.currentSpinType === SPIN_TYPE.BASE_GAME) {
    const totalPayout = ctx.services.wallet.getCurrentWin()
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
  const isFreeSpin = ctx.state.currentSpinType === SPIN_TYPE.FREE_SPINS

  if (isFreeSpin) {
    // During free spins, handle persistent wild reels
    drawBoardWithPersistentReels(ctx, reels)
  } else if (ctx.state.currentResultSet.forceFreespins) {
    // Force scatter trigger in base game
    const criteria = ctx.state.currentResultSet.criteria
    const targetScatters = criteria === "hiddenfreespins" ? 5 : criteria === "superfreespins" ? 4 : 3
    
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

      if (scatCount === targetScatters && !scatInvalid) break
    }
  } else {
    // Normal base game - limit to max 2 scatters
    while (true) {
      ctx.services.board.resetBoard()
      ctx.services.board.drawBoardWithRandomStops(reels)

      const scatInvalid = ctx.services.board.isSymbolOnAnyReelMultipleTimes(scatter)
      const [scatCount] = ctx.services.board.countSymbolsOnBoard(scatter)

      if (scatCount <= 2 && !scatInvalid) break
    }
  }
}

function drawBoardWithPersistentReels(ctx: Context, reels: any) {
  ctx.services.board.resetBoard()
  
  const persistentReels = ctx.state.userData.persistentWildReels
  const wildSymbol = ctx.config.symbols.get("W")!
  const wildReelSymbol = ctx.config.symbols.get("WR")!
  
  // For first super/hidden free spin, guarantee a wild reel appears
  if (ctx.state.userData.isFirstSuperFreeSpin || ctx.state.userData.isFirstHiddenFreeSpin) {
    // Draw board until we get at least one wild reel
    while (true) {
      ctx.services.board.resetBoard()
      ctx.services.board.drawBoardWithRandomStops(reels)
      
      const boardReels = ctx.services.board.getBoardReels()
      const hasWildReel = boardReels.some((reel) => 
        reel.some((symbol) => symbol.properties.get("isWildReel"))
      )
      
      if (hasWildReel) break
    }
    
    ctx.state.userData.isFirstSuperFreeSpin = false
    ctx.state.userData.isFirstHiddenFreeSpin = false
  } else {
    // Draw all reels normally first
    ctx.services.board.drawBoardWithRandomStops(reels)
  }
  
  // Then restore persistent wild reels
  const boardReels = ctx.services.board.getBoardReels()
  
  persistentReels.forEach((multiplier: number, reelIndex: number) => {
    // Replace entire reel with wilds
    for (let rowIndex = 0; rowIndex < boardReels[reelIndex]!.length; rowIndex++) {
      boardReels[reelIndex]![rowIndex] = wildSymbol
    }
  })
}

function addRevealEvent(ctx: Context) {
  const boardReels = ctx.services.board.getBoardReels()
  const paddingTop = ctx.services.board.getPaddingTop()
  const paddingBottom = ctx.services.board.getPaddingBottom()
  const anticipation = ctx.services.board.getAnticipation()

  // Build the board data structure with symbol info, including padding
  // Each reel array contains: [paddingTop symbols, main symbols, paddingBottom symbols]
  const board = boardReels.map((reel, reelIndex) => {
    const allSymbols: GameSymbol[] = [
      ...(paddingTop[reelIndex] || []),
      ...reel,
      ...(paddingBottom[reelIndex] || []),
    ]

    return allSymbols.map((symbol: GameSymbol) => {
      const symbolData: Record<string, any> = {
        name: symbol.id,
      }

      // Add symbol properties if they exist
      if (symbol.properties.get("isWild")) {
        symbolData["Wild"] = true
      }
      if (symbol.properties.get("isScatter")) {
        symbolData["Scatter"] = true
      }
      if (symbol.properties.get("isWildReel")) {
        symbolData["Wild Reel"] = true
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

function handleExpandingWilds(ctx: Context): Map<number, number> {
  const boardReels = ctx.services.board.getBoardReels()
  const wildReelMultipliers = new Map<number, number>()
  const MULTIPLIER_VALUES = [2, 3, 4, 5, 6, 8, 10, 15, 20, 25]

  // Find all wild reel positions
  const wildReelIndices: number[] = []
  boardReels.forEach((reel, reelIndex) => {
    const hasWildReel = reel.some((symbol) => symbol.properties.get("isWildReel"))
    if (hasWildReel) {
      wildReelIndices.push(reelIndex)
      wildReelMultipliers.set(reelIndex, 0) // Start at 0, will add collected multipliers
    }
  })

  // Find all regular wild positions
  const regularWilds: Array<{ reel: number; row: number; collectibleMult: number }> = []
  boardReels.forEach((reel, reelIndex) => {
    reel.forEach((symbol, rowIndex) => {
      if (
        symbol.properties.get("isWild") &&
        !symbol.properties.get("isWildReel")
      ) {
        regularWilds.push({
          reel: reelIndex,
          row: rowIndex,
          collectibleMult: 0, // Will be assigned if wild reels are present
        })
      }
    })
  })

  // If both wild reels and regular wilds exist, assign multipliers
  let totalMultiplier = 0
  if (wildReelIndices.length > 0 && regularWilds.length > 0) {
    // Assign random multipliers to each regular wild
    regularWilds.forEach((wild) => {
      const randomMult =
        MULTIPLIER_VALUES[
          Math.floor(ctx.services.rng.randomFloat(0, 1) * MULTIPLIER_VALUES.length)
        ]!
      wild.collectibleMult = randomMult
      totalMultiplier += randomMult
    })

    // Assign total multiplier to all wild reels
    wildReelIndices.forEach((reelIndex) => {
      wildReelMultipliers.set(reelIndex, totalMultiplier)
    })

    // Create expanding wilds with multipliers
    const expandingWilds: Array<{ reel: number; row: number; mult: number }> = []
    wildReelIndices.forEach((reelIndex) => {
      boardReels[reelIndex]!.forEach((symbol, rowIndex) => {
        if (!symbol.properties.get("isWildReel")) {
          expandingWilds.push({
            reel: reelIndex,
            row: rowIndex,
            mult: totalMultiplier,
          })
        }
      })
    })

    // Add incrementExpandingWildMultipliers event
    ctx.services.data.addBookEvent({
      type: "incrementExpandingWildMultipliers",
      data: {
        expandingWilds,
        wilds: regularWilds,
      },
    })
  } else {
    // No multipliers, just record positions with mult: 0
    // Wild reels without collected wilds should be 1x
    wildReelIndices.forEach((reelIndex) => {
      wildReelMultipliers.set(reelIndex, 1)
    })
    
    const newWilds: Array<{ reel: number; row: number; mult: number }> = []
    wildReelIndices.forEach((reelIndex) => {
      boardReels[reelIndex]!.forEach((symbol, rowIndex) => {
        if (!symbol.properties.get("isWildReel")) {
          newWilds.push({
            reel: reelIndex,
            row: rowIndex,
            mult: 1,
          })
        }
      })
    })

    // Add expanding wilds event if any wilds were created
    if (newWilds.length > 0) {
      ctx.services.data.addBookEvent({
        type: "newExpandingWilds",
        data: {
          newWilds,
        },
      })
    }
  }

  return wildReelMultipliers
}

function handleWins(ctx: Context, wildReelMultipliers: Map<number, number>, isFreeSpin = false) {
  const boardReels = ctx.services.board.getBoardReels()
  const wildSymbol = ctx.config.symbols.get("W")!

  // Create a modified board for win evaluation where WR reels are replaced with wilds
  const modifiedBoardReels = boardReels.map((reel, reelIndex) => {
    const hasWildReel = reel.some((symbol) => symbol.properties.get("isWildReel"))

    if (hasWildReel || wildReelMultipliers.has(reelIndex)) {
      // Replace all symbols on this reel with wild symbols for win calculation
      return reel.map(() => wildSymbol)
    }

    return reel
  })

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

  const { payout, winCombinations } = lines
    .evaluateWins(modifiedBoardReels)
    .getWins()

  // Apply wild reel multipliers to wins
  let totalPayout = 0
  const processedWins = winCombinations.map((combo) => {
    // Check if this win uses any wild reel positions and add their multipliers
    let wildReelMultiplier = 1
    const usedWildReels: number[] = []

    combo.symbols.forEach((sym) => {
      if (wildReelMultipliers.has(sym.reelIndex)) {
        usedWildReels.push(sym.reelIndex)
      }
    })

    // If the win uses wild reels, add all their multipliers together
    if (usedWildReels.length > 0) {
      wildReelMultiplier = 0
      usedWildReels.forEach((reelIndex) => {
        const mult = wildReelMultipliers.get(reelIndex) || 1
        // Treat 0 as 1 for calculation (wild reel with no collected multipliers)
        wildReelMultiplier += mult === 0 ? 1 : mult
      })
    }

    const multipliedPayout = combo.payout * wildReelMultiplier
    totalPayout += multipliedPayout

    return {
      symbol: combo.baseSymbol.id,
      kind: combo.kind,
      win: multipliedPayout,
      positions: combo.symbols.map((sym) => ({
        reel: sym.reelIndex,
        row: sym.posIndex,
      })),
      meta: {
        lineIndex: combo.lineNumber,
        multiplier: wildReelMultiplier,
        winWithoutMult: combo.payout,
        globalMult: 1,
        lineMultiplier: wildReelMultiplier,
      },
    }
  })

  // Add winInfo event if there are any wins
  if (totalPayout > 0 && processedWins.length > 0) {
    ctx.services.data.addBookEvent({
      type: "winInfo",
      data: {
        totalWin: totalPayout,
        wins: processedWins,
      },
    })

    // Calculate win level
    const currentGameMode = ctx.services.game.getCurrentGameMode()
    const winLevel = calculateWinLevel(totalPayout, currentGameMode.cost)

    // Add setWin event
    ctx.services.data.addBookEvent({
      type: "setWin",
      data: {
        amount: totalPayout,
        winLevel,
      },
    })

    // Update total win tracking
    if (isFreeSpin) {
      ctx.state.userData.totalFreeSpinsWin += totalPayout
      
      // Add setTotalWin event with accumulated total
      ctx.services.data.addBookEvent({
        type: "setTotalWin",
        data: {
          amount: ctx.state.userData.totalFreeSpinsWin,
        },
      })
    } else {
      // Add setTotalWin event for base game - finalWin comes later if no free spins triggered
      ctx.services.data.addBookEvent({
        type: "setTotalWin",
        data: {
          amount: totalPayout,
        },
      })
    }
  }

  ctx.services.wallet.addSpinWin(totalPayout)
}

function calculateWinLevel(payout: number, betCost: number): number {
  const multiplier = payout / betCost

  if (multiplier >= 1000) return 5
  if (multiplier >= 100) return 4
  if (multiplier >= 10) return 3
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

  // No freespins, return early
  if (freespinsAwarded <= 0) return

  // Determine the free spins type based on scatter count
  const isSuperFreeSpins = scatCount === 4
  const isHiddenFreeSpins = scatCount === 5

  ctx.services.game.awardFreespins(freespinsAwarded)

  if (ctx.state.currentSpinType === SPIN_TYPE.BASE_GAME) {
    // Find scatter positions for the trigger event
    const positions: Array<{ reel: number; row: number }> = []
    const boardReels = ctx.services.board.getBoardReels()
    
    boardReels.forEach((reel, reelIndex) => {
      reel.forEach((symbol, rowIndex) => {
        if (symbol.properties.get("isScatter")) {
          positions.push({ reel: reelIndex, row: rowIndex })
        }
      })
    })

    // Add freeSpinTrigger event
    ctx.services.data.addBookEvent({
      type: "freeSpinTrigger",
      data: {
        totalFs: freespinsAwarded,
        positions,
      },
    })

    // Initialize free spins state
    ctx.state.userData.persistentWildReels = new Map()
    ctx.state.userData.totalFreeSpinsWin = 0
    ctx.state.userData.isSuperFreeSpins = isSuperFreeSpins
    ctx.state.userData.isFirstSuperFreeSpin = isSuperFreeSpins
    ctx.state.userData.isHiddenFreeSpins = isHiddenFreeSpins
    ctx.state.userData.isFirstHiddenFreeSpin = isHiddenFreeSpins

    ctx.state.currentSpinType = SPIN_TYPE.FREE_SPINS
    playFreeSpins(ctx) // Play free spins immediately
    return
  }

  // Free spins retrigger (if needed in future)
  if (ctx.state.currentSpinType === SPIN_TYPE.FREE_SPINS) {
    // TODO: Handle retrigger if needed
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
    handleAnticipation(ctx)
    addRevealEvent(ctx)
    const wildReelMultipliers = handleExpandingWildsForFreeSpins(ctx)
    handleWins(ctx, wildReelMultipliers, true)
    ctx.services.wallet.confirmSpinWin()
    checkFreespins(ctx) // Check for retriggering
  }

  // Free spins ended
  const totalWin = ctx.state.userData.totalFreeSpinsWin
  const currentGameMode = ctx.services.game.getCurrentGameMode()
  const winLevel = calculateWinLevel(totalWin, currentGameMode.cost)

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

  // Clear persistent state
  ctx.state.userData.persistentWildReels = new Map()
  ctx.state.userData.totalFreeSpinsWin = 0
  ctx.state.userData.isSuperFreeSpins = false
  ctx.state.userData.isFirstSuperFreeSpin = false
  ctx.state.userData.isHiddenFreeSpins = false
  ctx.state.userData.isFirstHiddenFreeSpin = false
}

function handleExpandingWildsForFreeSpins(ctx: Context): Map<number, number> {
  const boardReels = ctx.services.board.getBoardReels()
  const wildReelMultipliers = new Map<number, number>()
  // Use higher minimum multipliers for hidden free spins (5x min instead of 2x)
  const MULTIPLIER_VALUES = ctx.state.userData.isHiddenFreeSpins 
    ? [5, 6, 8, 10, 15, 20, 25]
    : [2, 3, 4, 5, 6, 8, 10, 15, 20, 25]
  
  // Start with existing persistent wild reels and their multipliers
  const persistentReels = ctx.state.userData.persistentWildReels
  persistentReels.forEach((multiplier: number, reelIndex: number) => {
    wildReelMultipliers.set(reelIndex, multiplier)
  })
  
  // Find NEW wild reel positions (not already persistent)
  const newWildReelIndices: number[] = []
  boardReels.forEach((reel, reelIndex) => {
    if (persistentReels.has(reelIndex)) return // Skip already persistent reels
    
    const hasWildReel = reel.some((symbol) => symbol.properties.get("isWildReel"))
    if (hasWildReel) {
      newWildReelIndices.push(reelIndex)
      wildReelMultipliers.set(reelIndex, 0) // Start at 0, will add collected multipliers
      persistentReels.set(reelIndex, 0) // Add to persistent reels
    }
  })
  
  // Find all regular wild positions
  const regularWilds: Array<{ reel: number; row: number; collectibleMult: number }> = []
  boardReels.forEach((reel, reelIndex) => {
    // Skip persistent wild reels when looking for regular wilds
    if (persistentReels.has(reelIndex)) return
    
    reel.forEach((symbol, rowIndex) => {
      if (
        symbol.properties.get("isWild") &&
        !symbol.properties.get("isWildReel")
      ) {
        regularWilds.push({
          reel: reelIndex,
          row: rowIndex,
          collectibleMult: 0,
        })
      }
    })
  })
  
  // If we have any wild reels (new or persistent) and regular wilds, collect multipliers
  if (wildReelMultipliers.size > 0 && regularWilds.length > 0) {
    // Assign random multipliers to each regular wild
    let totalNewMultiplier = 0
    regularWilds.forEach((wild) => {
      const randomMult =
        MULTIPLIER_VALUES[
          Math.floor(ctx.services.rng.randomFloat(0, 1) * MULTIPLIER_VALUES.length)
        ]!
      wild.collectibleMult = randomMult
      totalNewMultiplier += randomMult
    })
    
    // Add the new multiplier to ALL wild reels (accumulate)
    wildReelMultipliers.forEach((currentMult, reelIndex) => {
      // Treat multiplier of 1 as 0 for first collection (wild reel that never collected before)
      const baseMult = currentMult === 1 ? 0 : currentMult
      const newMult = baseMult + totalNewMultiplier
      wildReelMultipliers.set(reelIndex, newMult)
      persistentReels.set(reelIndex, newMult) // Update persistent state
    })
    
    // Create expanding wilds for NEW wild reels only
    const expandingWilds: Array<{ reel: number; row: number; mult: number }> = []
    newWildReelIndices.forEach((reelIndex) => {
      const finalMult = wildReelMultipliers.get(reelIndex) || 0
      boardReels[reelIndex]!.forEach((symbol, rowIndex) => {
        if (!symbol.properties.get("isWildReel")) {
          expandingWilds.push({
            reel: reelIndex,
            row: rowIndex,
            mult: finalMult,
          })
        }
      })
    })
    
    // Add event for multiplier increment
    ctx.services.data.addBookEvent({
      type: "incrementExpandingWildMultipliers",
      data: {
        expandingWilds,
        wilds: regularWilds,
      },
    })
  } else if (newWildReelIndices.length > 0) {
    // New wild reels appeared but no regular wilds to collect
    // Set them to 1x multiplier since they have no collected wilds
    newWildReelIndices.forEach((reelIndex) => {
      wildReelMultipliers.set(reelIndex, 1)
      persistentReels.set(reelIndex, 1)
    })
    
    const newWilds: Array<{ reel: number; row: number; mult: number }> = []
    newWildReelIndices.forEach((reelIndex) => {
      boardReels[reelIndex]!.forEach((symbol, rowIndex) => {
        if (!symbol.properties.get("isWildReel")) {
          newWilds.push({
            reel: reelIndex,
            row: rowIndex,
            mult: 1,
          })
        }
      })
    })
    
    if (newWilds.length > 0) {
      ctx.services.data.addBookEvent({
        type: "newExpandingWilds",
        data: {
          newWilds,
        },
      })
    }
  }
  
  return wildReelMultipliers
}
