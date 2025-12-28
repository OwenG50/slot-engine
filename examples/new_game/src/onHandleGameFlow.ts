import { GameContext, GameSymbol, LinesWinType } from "@slot-engine/core"
import { GameModesType, SymbolsType, UserStateType } from ".."

type Context = GameContext<GameModesType, SymbolsType, UserStateType>

export function onHandleGameFlow(ctx: Context) {
  drawBoard(ctx)
  addRevealEvent(ctx)
  handleAnticipation(ctx)
  const wildReelMultipliers = handleExpandingWilds(ctx)
  handleWins(ctx, wildReelMultipliers)
  ctx.services.wallet.confirmSpinWin()
}

function drawBoard(ctx: Context) {
  const reels = ctx.services.board.getRandomReelset()
  ctx.services.board.resetBoard()
  ctx.services.board.drawBoardWithRandomStops(reels)
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
      wildReelMultipliers.set(reelIndex, 1) // Start with base multiplier of 1
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
    const newWilds: Array<{ reel: number; row: number; mult: number }> = []
    wildReelIndices.forEach((reelIndex) => {
      boardReels[reelIndex]!.forEach((symbol, rowIndex) => {
        if (!symbol.properties.get("isWildReel")) {
          newWilds.push({
            reel: reelIndex,
            row: rowIndex,
            mult: 0,
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

function handleWins(ctx: Context, wildReelMultipliers: Map<number, number>) {
  const boardReels = ctx.services.board.getBoardReels()
  const wildSymbol = ctx.config.symbols.get("W")!

  // Create a modified board for win evaluation where WR reels are replaced with wilds
  const modifiedBoardReels = boardReels.map((reel, reelIndex) => {
    const hasWildReel = reel.some((symbol) => symbol.properties.get("isWildReel"))

    if (hasWildReel) {
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
    // Check if this win uses any wild reel positions and sum their multipliers
    let wildReelMultiplier = 1
    const usedWildReels = new Set<number>()

    combo.symbols.forEach((sym) => {
      if (wildReelMultipliers.has(sym.reelIndex)) {
        usedWildReels.add(sym.reelIndex)
      }
    })

    // If the win uses wild reels, sum all their multipliers
    if (usedWildReels.size > 0) {
      wildReelMultiplier = 0
      usedWildReels.forEach((reelIndex) => {
        wildReelMultiplier += wildReelMultipliers.get(reelIndex) || 0
      })
      // Ensure at least 1x if something went wrong
      if (wildReelMultiplier === 0) wildReelMultiplier = 1
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

    // Calculate win level (simple example based on win amount)
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

    // Add setTotalWin event
    ctx.services.data.addBookEvent({
      type: "setTotalWin",
      data: {
        amount: totalPayout,
      },
    })

    // Add finalWin event
    ctx.services.data.addBookEvent({
      type: "finalWin",
      data: {
        amount: totalPayout,
      },
    })
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
