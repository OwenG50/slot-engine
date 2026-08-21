import { GameContext, GameSymbol, LinesWinType, Reels, SPIN_TYPE } from "@slot-engine/core"
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

function posKey(reel: number, row: number): string {
  return `${reel}-${row}`
}

// Sums every wild-reel multiplier currently sitting on one physical reel —
// this combined total is the effective multiplier for any winning line that
// touches that reel via a wild position.
function reelMultiplierTotal(wildPositions: Map<string, number>, reelIndex: number): number {
  let total = 0
  wildPositions.forEach((mult, key) => {
    if (Number(key.split("-")[0]) === reelIndex) total += mult
  })
  return total
}

const INITIAL_FREE_SPINS = 10

function getScatterCounts(ctx: Context): { sCount: number; ssCount: number } {
  const s = ctx.config.symbols.get("S")!
  const ss = ctx.config.symbols.get("SS")!
  const [sCount] = ctx.services.board.countSymbolsOnBoard(s)
  const [ssCount] = ctx.services.board.countSymbolsOnBoard(ss)
  return { sCount, ssCount }
}

// No reel may ever show more than one scatter-type cell, whether S, SS, or
// two of the same type.
function hasScatterReelConflict(ctx: Context): boolean {
  return ctx.services.board
    .getBoardReels()
    .some((reel) => reel.filter((symbol) => symbol.properties.get("isScatter")).length > 1)
}

// Neither scatter type may ever land more than 3 times in one spin.
function isScatterCountValid(sCount: number, ssCount: number): boolean {
  return sCount <= 3 && ssCount <= 3
}

// Normal: 3 S. Super: 3 SS. Hidden: a MIXED 2-of-one + 3-of-other split
// (checked first since it overlaps with the single-type 3 count otherwise).
function getBonusTier(sCount: number, ssCount: number): "normal" | "super" | "hidden" | null {
  if ((sCount === 2 && ssCount === 3) || (sCount === 3 && ssCount === 2)) return "hidden"
  if (sCount >= 3) return "normal"
  if (ssCount >= 3) return "super"
  return null
}

function collectScatterPositions(ctx: Context): Array<{ reel: number; row: number; type: "S" | "SS" }> {
  const positions: Array<{ reel: number; row: number; type: "S" | "SS" }> = []
  ctx.services.board.getBoardReels().forEach((reel, reelIndex) => {
    reel.forEach((symbol, rowIndex) => {
      if (symbol.id === "S" || symbol.id === "SS") {
        positions.push({ reel: reelIndex, row: rowIndex, type: symbol.id })
      }
    })
  })
  return positions
}

// Forces an exact (targetS, targetSS) scatter split onto disjoint reels —
// each reel can only ever be assigned to one of the two symbols.
function forceScatterCombo(
  ctx: Context,
  reels: Reels,
  targetS: number,
  targetSS: number,
): Record<string, number> {
  const scatterS = ctx.config.symbols.get("S")!
  const scatterSS = ctx.config.symbols.get("SS")!

  const sForced =
    targetS > 0
      ? ctx.services.board.getRandomReelStops(
          reels,
          ctx.services.board.getReelStopsForSymbol(reels, scatterS),
          targetS,
        )
      : {}

  const usedReels = new Set(Object.keys(sForced).map(Number))
  const ssStops = ctx.services.board
    .getReelStopsForSymbol(reels, scatterSS)
    .map((stops, reelIndex) => (usedReels.has(reelIndex) ? [] : stops))

  const ssForced = targetSS > 0 ? ctx.services.board.getRandomReelStops(reels, ssStops, targetSS) : {}

  return { ...sForced, ...ssForced }
}

export function onHandleGameFlow(ctx: Context) {
  const isFreeSpin = ctx.state.currentSpinType === SPIN_TYPE.FREE_SPINS

  drawBoard(ctx)
  handleAnticipation(ctx)

  const wildPositions = resolveWildReelMultipliers(ctx, isFreeSpin)
  addRevealEvent(ctx, wildPositions)

  const currentSpinWin = handleWins(ctx, wildPositions, isFreeSpin)
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
  const wildReel = ctx.config.symbols.get("WR")!
  const isFreeSpin = ctx.state.currentSpinType === SPIN_TYPE.FREE_SPINS

  if (isFreeSpin) {
    // Scatters remain fully live during free spins (each landed S/SS grants
    // +1 extra spin, see checkFreespins) — just keep the universal caps.
    while (true) {
      ctx.services.board.resetBoard()
      ctx.services.board.drawBoardWithRandomStops(reels)

      if (hasScatterReelConflict(ctx)) continue
      const { sCount, ssCount } = getScatterCounts(ctx)
      if (!isScatterCountValid(sCount, ssCount)) continue

      if (ctx.state.userData.isFirstSuperFreeSpin && countWildReels(ctx) < 1) continue

      break
    }

    if (ctx.state.userData.isFirstSuperFreeSpin) {
      ctx.state.userData.isFirstSuperFreeSpin = false
    }
    if (ctx.state.userData.isFirstHiddenFreeSpin) {
      ctx.state.userData.isFirstHiddenFreeSpin = false
    }

    // Restore sticky wild-reel positions with their fixed multiplier — only
    // the exact cell that landed stays wild; every other cell on that reel
    // (including other rows of the same reel) is still freshly drawn.
    const persistentWildPositions = ctx.state.userData.persistentWildReels
    if (persistentWildPositions.size > 0) {
      const boardReels = ctx.services.board.getBoardReels()
      persistentWildPositions.forEach((_multiplier, key) => {
        const [reelIndex, row] = key.split("-").map(Number)
        const reel = boardReels[reelIndex]
        if (!reel || reel[row] === undefined) return
        reel[row] = wildReel
      })
    }
  } else if (ctx.state.currentResultSet.forceFreespins) {
    // Force the exact scatter combo needed for this criteria's tier.
    const criteria = ctx.state.currentResultSet.criteria
    const isFeatureSpin = ctx.state.currentGameMode === "featureSpin"

    let targetS: number
    let targetSS: number

    if (criteria.includes("hidden")) {
      // Mixed 2-and-3 split, randomly assigned between S/SS.
      if (ctx.services.rng.randomFloat(0, 1) < 0.5) {
        targetS = 2
        targetSS = 3
      } else {
        targetS = 3
        targetSS = 2
      }
    } else if (criteria.includes("super")) {
      targetS = 0
      targetSS = 3
    } else {
      targetS = 3
      targetSS = 0
    }

    // With scatters forbidden from sharing a reel, a wild reel can only land
    // on a reel NOT forced to a scatter — impossible once every reel is
    // forced (hidden tier forces all 5), so the guarantee only applies when
    // at least one reel is left free.
    const hasFreeReelForWildReel = targetS + targetSS < reels.length

    while (true) {
      ctx.services.board.resetBoard()

      const forcedStops = forceScatterCombo(ctx, reels, targetS, targetSS)

      ctx.services.board.drawBoardWithForcedStops({
        reels,
        forcedStops,
      })

      if (hasScatterReelConflict(ctx)) continue
      const { sCount, ssCount } = getScatterCounts(ctx)
      if (sCount !== targetS || ssCount !== targetSS) continue

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

        if (hasScatterReelConflict(ctx)) continue
        const { sCount, ssCount } = getScatterCounts(ctx)
        // Base validation: never let an organic spin accidentally trigger a bonus.
        if (!isScatterCountValid(sCount, ssCount) || getBonusTier(sCount, ssCount)) continue
        if (!boardHasWildReel(ctx)) continue

        break
      }
    } else {
      // Normal base game — never let an organic spin accidentally trigger a bonus.
      while (true) {
        ctx.services.board.resetBoard()
        ctx.services.board.drawBoardWithRandomStops(reels)

        if (hasScatterReelConflict(ctx)) continue
        const { sCount, ssCount } = getScatterCounts(ctx)
        if (!isScatterCountValid(sCount, ssCount) || getBonusTier(sCount, ssCount)) continue

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

// Wild reels now land per-position — more than one can occupy the same
// physical reel. Returns a map of "reel-row" -> that cell's own rolled
// multiplier. During free spins, once a cell rolls its multiplier it becomes
// sticky and is restored (same value, same position) every subsequent spin;
// every other cell on that reel is still redrawn normally each spin.
function resolveWildReelMultipliers(ctx: Context, isFreeSpin: boolean): Map<string, number> {
  const boardReels = ctx.services.board.getBoardReels()
  const wildPositions = new Map<string, number>()
  const persistentWildPositions = ctx.state.userData.persistentWildReels

  boardReels.forEach((reel, reelIndex) => {
    reel.forEach((symbol, row) => {
      const key = posKey(reelIndex, row)

      if (isFreeSpin && persistentWildPositions.has(key)) {
        // Sticky wild position — keep its fixed initial multiplier.
        wildPositions.set(key, persistentWildPositions.get(key)!)
        return
      }

      if (!symbol.properties.get("isWildReel")) return

      const mult = pickWeightedMultiplier(MULTIPLIER_TABLE, () => ctx.services.rng.randomFloat(0, 1))
      wildPositions.set(key, mult)

      if (isFreeSpin) {
        persistentWildPositions.set(key, mult)
      }
    })
  })

  return wildPositions
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

function addRevealEvent(ctx: Context, wildPositions: Map<string, number>) {
  const boardReels = ctx.services.board.getBoardReels()
  const paddingTop = ctx.services.board.getPaddingTop()
  const paddingBottom = ctx.services.board.getPaddingBottom()
  const anticipation = ctx.services.board.getAnticipation()

  const buildSymbolData = (symbol: GameSymbol, reelIndex: number, row: number | null) => {
    const symbolData: Record<string, any> = {
      name: symbol.id,
    }

    if (symbol.properties.get("isWild")) {
      symbolData["Wild"] = true
    }
    if (symbol.properties.get("isWildReel")) {
      symbolData["Wild Reel"] = true
      const mult = row !== null ? wildPositions.get(posKey(reelIndex, row)) : undefined
      if (mult !== undefined) symbolData["multiplier"] = mult
    }
    if (symbol.properties.get("isScatter")) {
      symbolData["Scatter"] = true
    }

    return symbolData
  }

  // Build the board data structure with symbol info, including padding
  // Each reel array contains: [paddingTop symbols, main symbols, paddingBottom symbols]
  const board = boardReels.map((reel, reelIndex) => {
    const topPad = paddingTop[reelIndex] || []
    const bottomPad = paddingBottom[reelIndex] || []

    return [
      ...topPad.map((symbol) => buildSymbolData(symbol, reelIndex, null)),
      ...reel.map((symbol, row) => buildSymbolData(symbol, reelIndex, row)),
      ...bottomPad.map((symbol) => buildSymbolData(symbol, reelIndex, null)),
    ]
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
  let count = 0

  for (const [i, reel] of ctx.services.board.getBoardReels().entries()) {
    // If we already have 2 scatters (either type, combined), set anticipation for remaining reels
    if (count >= 2) {
      ctx.services.board.setAnticipationForReel(i, true)
    }
    // Count scatters (S or SS) on this reel
    if (reel.some((symbol) => symbol.properties.get("isScatter"))) {
      count++
    }
  }
}

function handleWins(ctx: Context, wildPositions: Map<string, number>, isFreeSpin = false): number {
  const boardReels = ctx.services.board.getBoardReels()
  const wildReelSymbol = ctx.config.symbols.get("WR")!

  const wildReels = new Set<number>()
  wildPositions.forEach((_mult, key) => wildReels.add(Number(key.split("-")[0])))

  // Win evaluation treats any reel containing a wild position as fully wild
  // across every row (not just the landed cell) — the reveal event still
  // shows the real per-cell layout, this expansion is evaluation-only.
  const modifiedBoardReels = boardReels.map((reel, reelIndex) =>
    wildReels.has(reelIndex) ? reel.map(() => wildReelSymbol) : reel,
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
    // A line touches a reel's wild multiplier if that reel has any wild
    // position on it at all; the reel's combined total (every wild position
    // on that reel summed) is then used as the multiplier.
    const touchedReels = new Set<number>()
    combo.symbols.forEach((sym) => {
      if (wildReels.has(sym.reelIndex)) touchedReels.add(sym.reelIndex)
    })

    const comboMultiplier = touchedReels.size > 0
      ? Array.from(touchedReels).reduce((sum, reelIndex) => sum + reelMultiplierTotal(wildPositions, reelIndex), 0)
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

  if (multiplier === 25000) return 6
  if (multiplier >= 200) return 5
  if (multiplier >= 50) return 4
  if (multiplier >= 25) return 3
  if (multiplier >= 15) return 2
  if (multiplier > 0) return 1

  return 0
}

function checkFreespins(ctx: Context) {
  const isTriggerSpin = ctx.state.currentSpinType === SPIN_TYPE.BASE_GAME
  const { sCount, ssCount } = getScatterCounts(ctx)

  if (isTriggerSpin) {
    const tier = getBonusTier(sCount, ssCount)
    if (!tier) return

    ctx.services.game.awardFreespins(INITIAL_FREE_SPINS)

    const positions = collectScatterPositions(ctx)

    ctx.services.data.addBookEvent({
      type: "freeSpinTrigger",
      data: {
        totalFs: INITIAL_FREE_SPINS,
        positions,
        tier,
      },
    })

    // Initialize free spins state. Sticky wild-reel positions start fresh for
    // the feature and keep their fixed multiplier across its spins (reset
    // again at endFreeSpins).
    ctx.state.userData.persistentWildReels = new Map()
    ctx.state.userData.isSuperFreeSpins = tier === "super"
    ctx.state.userData.isFirstSuperFreeSpin = tier === "super"
    ctx.state.userData.isHiddenFreeSpins = tier === "hidden"
    ctx.state.userData.isFirstHiddenFreeSpin = tier === "hidden"

    ctx.state.currentSpinType = SPIN_TYPE.FREE_SPINS
    playFreeSpins(ctx)
    return
  }

  // Mid-feature: every landed scatter of the relevant type(s) for this tier
  // grants +1 free spin each, with no cap on the number of retriggers.
  //   normal tier (S only reel) -> count S
  //   super tier  (SS only reel) -> count SS
  //   hidden tier (both on reel) -> count S + SS
  const additionalFs = ctx.state.userData.isHiddenFreeSpins
    ? sCount + ssCount
    : ctx.state.userData.isSuperFreeSpins
      ? ssCount
      : sCount

  if (additionalFs <= 0) return

  ctx.services.game.awardFreespins(additionalFs)

  const positions = collectScatterPositions(ctx)

  ctx.services.data.addBookEvent({
    type: "addAdditionalFreeSpins",
    data: {
      additionalFs,
      remainingFs: ctx.state.currentFreespinAmount,
      totalFs: ctx.state.totalFreespinAmount,
      positions,
    },
  })
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
    const wildPositions = resolveWildReelMultipliers(ctx, true)
    addRevealEvent(ctx, wildPositions)
    handleWins(ctx, wildPositions, true)
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

  ctx.state.userData.persistentWildReels = new Map()
  ctx.state.userData.isSuperFreeSpins = false
  ctx.state.userData.isFirstSuperFreeSpin = false
  ctx.state.userData.isHiddenFreeSpins = false
  ctx.state.userData.isFirstHiddenFreeSpin = false
  ctx.state.userData.totalFreeSpinsWin = 0
}
