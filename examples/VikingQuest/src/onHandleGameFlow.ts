import { GameContext, GameSymbol, LinesWinType, SPIN_TYPE } from "@slot-engine/core"
import { GameModesType, SymbolsType, UserStateType } from ".."

type Context = GameContext<GameModesType, SymbolsType, UserStateType>

// Helper function to round to 1 decimal places to avoid floating point precision issues
function roundToDecimal(value: number, decimals: number = 1): number {
  const multiplier = Math.pow(10, decimals)
  return Math.round(value * multiplier) / multiplier
}

// Weighted multiplier tables — higher values have lower weights so they feel rarer.
// Values per the gameplay brief's "Wild Multiplier values" table. Weights follow a
// smooth geometric decay (~0.83x per step, flattened slightly from an earlier
// ~0.8x pass to give a bit more weight to the larger multiplier values) rather
// than tapering off then flattening out at a floor of 1 — this gives a gradual,
// continuous drop-off in likelihood all the way to the rarest value instead of
// a cliff followed by several tied "equally rare" entries.
const MULTIPLIER_TABLE: Array<{ value: number; weight: number }> = [
  { value: 2,   weight: 250 },
  { value: 3,   weight: 208 },
  { value: 4,   weight: 172 },
  { value: 5,   weight: 143 },
  { value: 6,   weight: 119 },
  { value: 7,   weight: 98  },
  { value: 8,   weight: 82  },
  { value: 9,   weight: 68  },
  { value: 10,  weight: 56  },
  { value: 15,  weight: 47  },
  { value: 20,  weight: 39  },
  { value: 25,  weight: 32  },
  { value: 35,  weight: 27  },
  { value: 40,  weight: 22  },
  { value: 45,  weight: 18  },
  { value: 50,  weight: 15  },
  { value: 75,  weight: 13  },
  { value: 100, weight: 11  },
]

// Super free spins table — minimum 5x multiplier, per the gameplay brief.
// Same shape as MULTIPLIER_TABLE (low-to-mid common, high values rare) shifted up,
// using a slightly steeper smooth decay (~0.78x per step, flattened slightly from
// an earlier ~0.75x pass to give a bit more weight to the larger multiplier
// values) so it still tapers off gradually with no repeated "floor" weights at
// the tail.
const SUPER_MULTIPLIER_TABLE: Array<{ value: number; weight: number }> = [
  { value: 5,   weight: 250 },
  { value: 6,   weight: 195 },
  { value: 7,   weight: 152 },
  { value: 8,   weight: 119 },
  { value: 9,   weight: 93  },
  { value: 10,  weight: 72  },
  { value: 15,  weight: 56  },
  { value: 20,  weight: 44  },
  { value: 25,  weight: 34  },
  { value: 35,  weight: 27  },
  { value: 40,  weight: 21  },
  { value: 45,  weight: 16  },
  { value: 50,  weight: 13  },
  { value: 75,  weight: 10  },
  { value: 100, weight: 8   },
]

// Hidden free spins table — keep the full 5x..100x value set available, but
// flatten the weight curve so larger multipliers land more frequently while
// lower values still remain possible (no hard pruning of low-end outcomes).
const HIDDEN_MULTIPLIER_TABLE: Array<{ value: number; weight: number }> = [
  { value: 5,   weight: 120 },
  { value: 6,   weight: 110 },
  { value: 7,   weight: 100 },
  { value: 8,   weight: 92  },
  { value: 9,   weight: 85  },
  { value: 10,  weight: 79  },
  { value: 15,  weight: 74  },
  { value: 20,  weight: 70  },
  { value: 25,  weight: 66  },
  { value: 35,  weight: 63  },
  { value: 40,  weight: 60  },
  { value: 45,  weight: 57  },
  { value: 50,  weight: 54  },
  { value: 75,  weight: 51  },
  { value: 100, weight: 48  },
]

// Builds the "reel-row" key used to track sticky wild positions during
// free spins (ctx.state.userData.stickyWildPositions).
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

// Selects which multiplier table an exploding wild rolls from based on the
// current tier: Hidden (richest) > Super > Normal.
function pickMultiplierTable(ctx: Context): Array<{ value: number; weight: number }> {
  if (ctx.state.userData.isHiddenFreeSpins) return HIDDEN_MULTIPLIER_TABLE
  if (ctx.state.userData.isSuperFreeSpins) return SUPER_MULTIPLIER_TABLE
  return MULTIPLIER_TABLE
}

export function onHandleGameFlow(ctx: Context) {
  const isFreeSpin = ctx.state.currentSpinType === SPIN_TYPE.FREE_SPINS

  // Reel multipliers (and sticky wild positions) are never sticky in the
  // base game — every base spin starts from a clean slate. During free
  // spins they persist/accumulate across the whole feature (reset happens
  // in checkFreespins/endFreeSpins).
  if (!isFreeSpin) {
    ctx.state.userData.reelMultipliers = new Map()
    ctx.state.userData.stickyWildPositions = new Map()
  }

  drawBoard(ctx)
  handleAnticipation(ctx)
  addRevealEvent(ctx)

  // Wilds explode once all reels have landed, adding their rolled value to
  // that reel's multiplier — BEFORE any win lines are evaluated.
  resolveWildExplosions(ctx)

  const currentSpinWin = handleWins(ctx, isFreeSpin)
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
    // Keep redrawing until max 4 scatters land (the 5-scatter Hidden bonus
    // can only be triggered from the base game, never as an FS retrigger).
    while (true) {
      ctx.services.board.resetBoard()
      ctx.services.board.drawBoardWithRandomStops(reels)

      const scatInvalid = ctx.services.board.isSymbolOnAnyReelMultipleTimes(scatter)
      const [scatCount] = ctx.services.board.countSymbolsOnBoard(scatter)

      if (scatCount > 4 || scatInvalid) continue
      break
    }

    // Restore wilds that have already exploded (collected their value) at
    // their saved positions — during free spins those wilds stay sticky on
    // the board for the rest of the feature instead of disappearing, but no
    // longer roll/collect again (see resolveWildExplosions).
    const stickyWildPositions = ctx.state.userData.stickyWildPositions
    if (stickyWildPositions.size > 0) {
      const boardReels = ctx.services.board.getBoardReels()
      stickyWildPositions.forEach((_collected, key) => {
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
    const targetScatters = criteria.includes("hidden") ? 5 : criteria.includes("super") ? 4 : 3
    const isFeatureSpin = ctx.state.currentGameMode === "featureSpin"

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

      // featureSpin: this mode guarantees 2-5 wilds on EVERY base spin,
      // including the ones that happen to trigger a bonus.
      if (isFeatureSpin) {
        const [wildCount] = ctx.services.board.countSymbolsOnBoard(wild)
        if (wildCount < 2 || wildCount > 5) continue
      }

      break
    }
  } else {
    const isFeatureSpin = ctx.state.currentGameMode === "featureSpin"

    if (isFeatureSpin) {
      // featureSpin: force at least 2 wild reels on every base spin (the
      // featureSpin reel set's bumped W weight, plus the other unforced
      // reels landing naturally, keeps the final count within 2-5 without
      // excessive retries). Bonus trigger odds are otherwise untouched —
      // this only shapes which wilds land, not the scatter count.
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
        const [wildCount] = ctx.services.board.countSymbolsOnBoard(wild)

        // Base validation: max 2 scatters (same rule as normal base game).
        if (scatCount > 2 || scatInvalid) continue
        // Guaranteed wilds: must land between 2 and 5 (inclusive).
        if (wildCount < 2 || wildCount > 5) continue

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

// Exploding wilds: once all reels have landed, every NEWLY landed wild on
// the board "explodes", rolling a weighted multiplier value that is ADDED to
// that reel's running total (ctx.state.userData.reelMultipliers). In the
// base game the wild symbol itself is never sticky (board redraws fresh
// every spin, nothing to restore). During free spins, once a wild has
// exploded it becomes sticky at that exact position — drawBoard restores it
// on every subsequent free-spin draw — but it does NOT roll/collect again;
// this function skips any position already present in
// ctx.state.userData.stickyWildPositions. The exploded value stays with the
// reel for the rest of the current feature — persisting/accumulating across
// free-spin rounds, reset fresh at the start of every base-game spin (see
// onHandleGameFlow) and when a new bonus is triggered/ends (see
// checkFreespins/endFreeSpins). Emits a "wildExplode" event listing each new
// explosion so the client can play the explosion FX before wins are shown.
function resolveWildExplosions(ctx: Context) {
  const boardReels = ctx.services.board.getBoardReels()
  const table = pickMultiplierTable(ctx)
  const reelMultipliers = ctx.state.userData.reelMultipliers
  const stickyWildPositions = ctx.state.userData.stickyWildPositions
  const isFreeSpin = ctx.state.currentSpinType === SPIN_TYPE.FREE_SPINS

  const explosions: Array<{ reel: number; row: number; addedMult: number; reelMultiplier: number }> = []

  boardReels.forEach((reel, reelIndex) => {
    reel.forEach((symbol, rowIndex) => {
      if (!symbol.properties.get("isWild")) return

      const key = posKey(reelIndex, rowIndex)
      // Already collected on a previous free spin — stays on the board (via
      // drawBoard's restore) but does not roll/add again.
      if (isFreeSpin && stickyWildPositions.has(key)) return

      const addedMult = pickWeightedMultiplier(table, () => ctx.services.rng.randomFloat(0, 1))
      const reelMultiplier = roundToDecimal((reelMultipliers.get(reelIndex) ?? 0) + addedMult)
      reelMultipliers.set(reelIndex, reelMultiplier)

      if (isFreeSpin) {
        stickyWildPositions.set(key, true)
      }

      explosions.push({ reel: reelIndex, row: rowIndex, addedMult, reelMultiplier })
    })
  })

  if (explosions.length > 0) {
    ctx.services.data.addBookEvent({
      type: "wildExplode",
      data: { explosions },
    })
  }
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

function addRevealEvent(ctx: Context) {
  const boardReels = ctx.services.board.getBoardReels()
  const paddingTop = ctx.services.board.getPaddingTop()
  const paddingBottom = ctx.services.board.getPaddingBottom()
  const anticipation = ctx.services.board.getAnticipation()
  const reelMultipliers = ctx.state.userData.reelMultipliers

  // Build the board data structure with symbol info, including padding
  // Each reel array contains: [paddingTop symbols, main symbols, paddingBottom symbols]
  const board = boardReels.map((reel, reelIndex) => {
    const topPad = paddingTop[reelIndex] || []
    const allSymbols: GameSymbol[] = [
      ...topPad,
      ...reel,
      ...(paddingBottom[reelIndex] || []),
    ]

    return allSymbols.map((symbol: GameSymbol) => {
      const symbolData: Record<string, any> = {
        name: symbol.id,
      }

      // Add symbol properties if they exist. No multiplier is attached
      // here — the explosion (and its added value, for newly landed wilds)
      // happens after reveal, via the separate "wildExplode" event. During
      // free spins a wild may also be on the board because it's sticky
      // (already collected on a prior spin) — the reveal payload doesn't
      // need to distinguish that, the client already knows from the
      // (absence of a) matching wildExplode entry this spin.
      if (symbol.properties.get("isWild")) {
        symbolData["Wild"] = true
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

  // Starting (pre-explosion) reel multiplier values for this spin, so the
  // client can render each reel's current multiplier meter before the
  // wildExplode event applies this spin's new explosions on top.
  const reelMultiplierValues = boardReels.map((_, reelIndex) => reelMultipliers.get(reelIndex) ?? 0)

  ctx.services.data.addBookEvent({
    type: "reveal",
    data: {
      board,
      paddingPositions,
      gameType: ctx.state.currentResultSet.criteria,
      anticipation: anticipationValues,
      reelMultipliers: reelMultiplierValues,
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

function handleWins(ctx: Context, isFreeSpin = false): number {
  const boardReels = ctx.services.board.getBoardReels()
  const reelMultipliers = ctx.state.userData.reelMultipliers

  // 6-reel x 5-row payline map
  const lines = new LinesWinType({
    ctx,
    lines: {
      1: [0, 0, 0, 0, 0, 0],
      2: [1, 1, 1, 1, 1, 1],
      3: [2, 2, 2, 2, 2, 2],
      4: [3, 3, 3, 3, 3, 3],
      5: [4, 4, 4, 4, 4, 4],
      6: [0, 1, 0, 1, 0, 1],
      7: [1, 0, 1, 0, 1, 0],
      8: [1, 2, 1, 2, 1, 2],
      9: [2, 1, 2, 1, 2, 1],
      10: [3, 2, 3, 2, 3, 2],
      11: [2, 3, 2, 3, 2, 3],
      12: [3, 4, 3, 4, 3, 4],
      13: [4, 3, 4, 3, 4, 3],
    },
    wildSymbol: { isWild: true },
  })

  const { winCombinations } = lines
    .evaluateWins(boardReels)
    .getWins()

  let totalPayout = 0
  let processedWins = winCombinations.map((combo) => {
    // Any win line "uses" whichever reels its matched symbols occupy. The
    // multiplier applied to that line is the SUM of those reels' accumulated
    // exploded-wild values — regardless of whether a wild itself is part of
    // the winning combo (per brief: applied to "any win lines that occur
    // using that reel"). Falls back to 1x if none of the reels involved have
    // an explosion yet.
    const reelsInCombo = new Set(combo.symbols.map((sym) => sym.reelIndex))
    let sumMult = 0
    reelsInCombo.forEach((reelIndex) => {
      sumMult += reelMultipliers.get(reelIndex) ?? 0
    })
    const comboMultiplier = sumMult > 0 ? sumMult : 1

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

    // Determine the free-spin tier from the number of triggering scatters:
    //   3 scatters -> normal, 4 -> super, 5+ -> hidden. This "tier" field is
    // read by scripts/analyze-build.ts to break down FS stats per tier.
    const isHiddenBonus = scatCount >= 5
    const isSuperBonus = !isHiddenBonus && scatCount >= 4
    const tier = isHiddenBonus ? "hidden" : isSuperBonus ? "super" : "normal"

    ctx.services.data.addBookEvent({
      type: "freeSpinTrigger",
      data: {
        totalFs: freespinsAwarded,
        positions,
        tier,
      },
    })

    // Initialize free spins state. Reel multipliers (and sticky wild
    // positions) start fresh for the feature and accumulate across its
    // spins (reset again at endFreeSpins).
    ctx.state.userData.reelMultipliers = new Map()
    ctx.state.userData.stickyWildPositions = new Map()
    ctx.state.userData.isSuperFreeSpins = isSuperBonus
    ctx.state.userData.isHiddenFreeSpins = isHiddenBonus

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
    addRevealEvent(ctx)
    resolveWildExplosions(ctx)
    handleWins(ctx, true)
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

  ctx.state.userData.reelMultipliers = new Map()
  ctx.state.userData.stickyWildPositions = new Map()
  ctx.state.userData.isSuperFreeSpins = false
  ctx.state.userData.isHiddenFreeSpins = false
  ctx.state.userData.totalFreeSpinsWin = 0
}
