import { GameContext, GameSymbol, LinesWinType, Reels, SPIN_TYPE } from "@slot-engine/core"
import { GameModesType, SymbolsType, UserStateType } from ".."

type Context = GameContext<GameModesType, SymbolsType, UserStateType>

const INITIAL_FREE_SPINS = 10
// Retrigger awards during free spins, per landed scatter.
const RETRIGGER_SPINS_PER_S = 1
const RETRIGGER_SPINS_PER_SS = 2

// ─── WILD MULTIPLIER POOLS ─────────────────────────────────────────────────

// Tiered wilds roll uniformly from their tier's pool.
const WILD_TIER_POOLS: Record<number, number[]> = {
  1: [2, 3, 4, 5, 6, 7, 8, 9, 10],
  2: [12, 15, 20, 25, 30, 35, 40, 45, 50],
  3: [55, 75, 100, 125, 150, 175, 200, 225, 250],
}

// Wild reels roll from the full 2x-250x pool with decaying weights
// (higher multipliers are rarer). Tune the weights to shape volatility.
const WR_MULTIPLIER_WEIGHTS: Record<string, number> = {
  2: 100,
  3: 88,
  4: 77,
  5: 68,
  6: 60,
  7: 53,
  8: 46,
  9: 41,
  10: 36,
  12: 31,
  15: 27,
  20: 24,
  25: 21,
  30: 18,
  35: 16,
  40: 14,
  45: 12,
  50: 11,
  55: 9,
  75: 8,
  100: 7,
  125: 6,
  150: 5,
  175: 4,
  200: 3,
  225: 2,
  250: 1,
}

// ─── HELPERS ───────────────────────────────────────────────────────────────

// Round to 1 decimal place to avoid floating point precision issues.
function roundToDecimal(value: number, decimals: number = 1): number {
  const multiplier = Math.pow(10, decimals)
  return Math.round(value * multiplier) / multiplier
}

function posKey(reel: number, row: number): string {
  return `${reel}-${row}`
}

function reelFromKey(key: string): number {
  return Number(key.split("-")[0])
}

function getScatterCounts(ctx: Context): { sCount: number; ssCount: number } {
  const s = ctx.config.symbols.get("S")!
  const ss = ctx.config.symbols.get("SS")!
  const [sCount] = ctx.services.board.countSymbolsOnBoard(s)
  const [ssCount] = ctx.services.board.countSymbolsOnBoard(ss)
  return { sCount, ssCount }
}

// No reel may ever show more than one scatter cell (S or SS, any combo).
function hasScatterReelConflict(ctx: Context): boolean {
  return ctx.services.board
    .getBoardReels()
    .some((reel) => reel.filter((symbol) => symbol.properties.get("isScatter")).length > 1)
}

// Neither scatter type may ever land more than 3 times in one spin.
function isScatterCountValid(sCount: number, ssCount: number): boolean {
  return sCount <= 3 && ssCount <= 3
}

// normal: 3x S. super: 3x SS. hidden: mixed 3+2 split (checked first since
// it also contains a single-type count of 3).
function getBonusTier(sCount: number, ssCount: number): "normal" | "super" | "hidden" | null {
  if ((sCount === 2 && ssCount === 3) || (sCount === 3 && ssCount === 2)) return "hidden"
  if (sCount >= 3) return "normal"
  if (ssCount >= 3) return "super"
  return null
}

// A WR must never share a reel with a tiered wild (W1/W2/W3) or a scatter
// (S/SS) - an expanding WR would otherwise cover/eat the scatter.
// `extraWildReels` covers sticky WR positions restored after the draw.
function hasWildReelConflict(ctx: Context, extraWildReels: Set<number>): boolean {
  const boardReels = ctx.services.board.getBoardReels()
  return boardReels.some((reel, reelIndex) => {
    const hasWR = extraWildReels.has(reelIndex) || reel.some((s) => s.properties.get("isWildReel"))
    if (!hasWR) return false
    return reel.some(
      (s) => s.properties.get("wildTier") !== undefined || s.id === "S" || s.id === "SS",
    )
  })
}

function boardHasWildReel(ctx: Context): boolean {
  return ctx.services.board
    .getBoardReels()
    .some((reel) => reel.some((symbol) => symbol.properties.get("isWildReel")))
}

// Counts tiered wild cells (W1+W2+W3 combined) currently on the board.
function countWildTierCells(ctx: Context): number {
  return ctx.services.board
    .getBoardReels()
    .reduce(
      (count, reel) =>
        count + reel.filter((symbol) => symbol.properties.get("wildTier") !== undefined).length,
      0,
    )
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

// Forces an exact (targetS, targetSS) scatter split onto disjoint reels.
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

// ─── MAIN GAME FLOW ────────────────────────────────────────────────────────

export function onHandleGameFlow(ctx: Context) {
  const isFreeSpin = ctx.state.currentSpinType === SPIN_TYPE.FREE_SPINS

  drawBoard(ctx)
  handleAnticipation(ctx)

  const { wrByPos, wildByPos } = resolveWildMultipliers(ctx, isFreeSpin)
  addRevealEvent(ctx, wrByPos, wildByPos)

  const currentSpinWin = handleWins(ctx, wrByPos, wildByPos, isFreeSpin)
  ctx.services.wallet.confirmSpinWin()

  const spinTypeBeforeCheck = ctx.state.currentSpinType

  if (spinTypeBeforeCheck === SPIN_TYPE.BASE_GAME) {
    ctx.state.userData.totalFreeSpinsWin = roundToDecimal(currentSpinWin)
  }

  if (hasReachedMaxWin(ctx)) {
    if (spinTypeBeforeCheck === SPIN_TYPE.BASE_GAME) {
      const totalPayout = capToMaxWin(ctx, ctx.services.wallet.getCurrentWin())
      if (totalPayout > 0) {
        ctx.services.data.addBookEvent({
          type: "finalWin",
          data: { amount: totalPayout },
        })
      }
    }
    return
  }

  checkFreespins(ctx)

  // Only add finalWin if we're in base game and free spins weren't triggered.
  if (spinTypeBeforeCheck === SPIN_TYPE.BASE_GAME && ctx.state.currentSpinType === SPIN_TYPE.BASE_GAME) {
    const totalPayout = capToMaxWin(ctx, ctx.services.wallet.getCurrentWin())
    if (totalPayout > 0) {
      ctx.services.data.addBookEvent({
        type: "finalWin",
        data: { amount: totalPayout },
      })
    }
  }
}

// ─── BOARD DRAWING ─────────────────────────────────────────────────────────

function drawBoard(ctx: Context) {
  const reels = ctx.services.board.getRandomReelset()
  const wildReel = ctx.config.symbols.get("WR")!
  const isFreeSpin = ctx.state.currentSpinType === SPIN_TYPE.FREE_SPINS

  if (isFreeSpin) {
    const sticky = ctx.state.userData.stickyWildReels
    const stickyReels = new Set(Object.keys(sticky).map(reelFromKey))
    // Set for super/hidden first spins and for all forced-maxwin rounds.
    const needGuaranteedWR = ctx.state.userData.isFirstBonusSpin

    while (true) {
      ctx.services.board.resetBoard()

      if (needGuaranteedWR) {
        // Force one reel to stop on a WR position.
        const wrStops = ctx.services.board.getReelStopsForSymbol(reels, wildReel)
        const eligible = wrStops
          .map((stops, reelIndex) => ({ reelIndex, stops }))
          .filter(({ stops }) => stops.length > 0)

        if (eligible.length > 0) {
          const chosen = ctx.services.rng.randomItem(eligible)
          ctx.services.board.drawBoardWithForcedStops({
            reels,
            forcedStops: { [chosen.reelIndex]: ctx.services.rng.randomItem(chosen.stops) },
          })
        } else {
          ctx.services.board.drawBoardWithRandomStops(reels)
        }
      } else {
        ctx.services.board.drawBoardWithRandomStops(reels)
      }

      if (hasScatterReelConflict(ctx)) continue
      const { sCount, ssCount } = getScatterCounts(ctx)
      if (!isScatterCountValid(sCount, ssCount)) continue
      if (hasWildReelConflict(ctx, stickyReels)) continue
      if (needGuaranteedWR && !boardHasWildReel(ctx)) continue

      break
    }

    if (ctx.state.userData.isFirstBonusSpin) {
      ctx.state.userData.isFirstBonusSpin = false
    }

    // Restore sticky wild-reel positions. Only the exact cell that landed
    // stays wild; every other cell on that reel is freshly drawn.
    const boardReels = ctx.services.board.getBoardReels()
    for (const key of Object.keys(sticky)) {
      const [reelIndex, row] = key.split("-").map(Number)
      const reel = boardReels[reelIndex!]
      if (!reel || reel[row!] === undefined) continue
      reel[row!] = wildReel
    }
  } else if (ctx.state.currentGameMode === "featureSpin") {
    // Single-spin buy mode, no scatters/no free spins. Every spin guarantees
    // >=1 WR and >=3 tiered wilds (mushrooms). forceMaxWin rounds use a
    // heavier reel + force more of each to make 25000x reachable in one
    // spin, and skip the normal WR-vs-wild same-reel separation rule.
    const isMaxwin = !!ctx.state.currentResultSet.forceMaxWin
    const wrTarget = isMaxwin ? 3 : 1
    const mushroomTarget = isMaxwin ? 2 : 3

    while (true) {
      ctx.services.board.resetBoard()

      const wrStops = ctx.services.board.getReelStopsForSymbol(reels, wildReel)
      const eligibleWR = wrStops
        .map((stops, reelIndex) => ({ reelIndex, stops }))
        .filter(({ stops }) => stops.length > 0)
      const chosenWR = ctx.services.rng.shuffle(eligibleWR).slice(0, wrTarget)
      const wrForced: Record<string, number> = {}
      for (const c of chosenWR) wrForced[c.reelIndex] = ctx.services.rng.randomItem(c.stops)

      const usedReels = new Set(Object.keys(wrForced).map(Number))
      const mushroomStops = ctx.services.board
        .combineReelStops(
          ctx.services.board.getReelStopsForSymbol(reels, ctx.config.symbols.get("W1")!),
          ctx.services.board.getReelStopsForSymbol(reels, ctx.config.symbols.get("W2")!),
          ctx.services.board.getReelStopsForSymbol(reels, ctx.config.symbols.get("W3")!),
        )
        .map((stops, reelIndex) => (usedReels.has(reelIndex) ? [] : stops))
      const mushroomForced = ctx.services.board.getRandomReelStops(reels, mushroomStops, mushroomTarget)

      ctx.services.board.drawBoardWithForcedStops({ reels, forcedStops: { ...wrForced, ...mushroomForced } })

      if (!boardHasWildReel(ctx)) continue
      if (countWildTierCells(ctx) < 3) continue
      if (!isMaxwin && hasWildReelConflict(ctx, new Set())) continue

      break
    }
  } else if (ctx.state.currentResultSet.forceFreespins) {
    // Force the exact scatter combo for this criteria's tier.
    const criteria = ctx.state.currentResultSet.criteria

    let targetS: number
    let targetSS: number

    if (criteria.includes("hidden")) {
      // Mixed 3+2 split, randomly assigned between S/SS.
      if (ctx.services.rng.randomFloat(0, 1) < 0.5) {
        targetS = 2
        targetSS = 3
      } else {
        targetS = 3
        targetSS = 2
      }
    } else if (
      criteria.includes("super") ||
      // maxwin rounds run as super tier, except in bonusFeature (a normal
      // bonus buy) where the trigger must stay normal tier.
      (criteria === "maxwin" && ctx.state.currentGameMode !== "bonusFeature")
    ) {
      targetS = 0
      targetSS = 3
    } else {
      targetS = 3
      targetSS = 0
    }

    while (true) {
      ctx.services.board.resetBoard()

      const forcedStops = forceScatterCombo(ctx, reels, targetS, targetSS)
      ctx.services.board.drawBoardWithForcedStops({ reels, forcedStops })

      if (hasScatterReelConflict(ctx)) continue
      const { sCount, ssCount } = getScatterCounts(ctx)
      if (sCount !== targetS || ssCount !== targetSS) continue
      if (hasWildReelConflict(ctx, new Set())) continue

      break
    }
  } else {
    // Organic base spin - never allow an accidental bonus trigger.
    while (true) {
      ctx.services.board.resetBoard()
      ctx.services.board.drawBoardWithRandomStops(reels)

      if (hasScatterReelConflict(ctx)) continue
      const { sCount, ssCount } = getScatterCounts(ctx)
      if (!isScatterCountValid(sCount, ssCount) || getBonusTier(sCount, ssCount)) continue
      if (hasWildReelConflict(ctx, new Set())) continue

      break
    }
  }
}

// ─── WILD MULTIPLIER RESOLUTION ────────────────────────────────────────────

// Rolls multipliers for every wild on the board.
// - WR cells roll from the WR pool; during free spins they become sticky
//   (fixed value, restored at the same position every remaining spin).
// - W1/W2/W3 cells roll from their tier pool and last this spin only.
function resolveWildMultipliers(
  ctx: Context,
  isFreeSpin: boolean,
): { wrByPos: Record<string, number>; wildByPos: Record<string, number> } {
  const boardReels = ctx.services.board.getBoardReels()
  const sticky = ctx.state.userData.stickyWildReels
  const wrByPos: Record<string, number> = {}
  const wildByPos: Record<string, number> = {}

  boardReels.forEach((reel, reelIndex) => {
    reel.forEach((symbol, row) => {
      const key = posKey(reelIndex, row)

      if (isFreeSpin && sticky[key] !== undefined) {
        wrByPos[key] = sticky[key]!
        return
      }

      if (symbol.properties.get("isWildReel")) {
        const mult = Number(ctx.services.rng.weightedRandom(WR_MULTIPLIER_WEIGHTS))
        wrByPos[key] = mult
        if (isFreeSpin) {
          sticky[key] = mult
        }
        return
      }

      const tier = symbol.properties.get("wildTier")
      if (tier !== undefined) {
        wildByPos[key] = ctx.services.rng.randomItem(WILD_TIER_POOLS[tier]!)
      }
    })
  })

  return { wrByPos, wildByPos }
}

// Sums every WR multiplier currently sitting on one physical reel.
function reelWRTotal(wrByPos: Record<string, number>, reelIndex: number): number {
  let total = 0
  for (const [key, mult] of Object.entries(wrByPos)) {
    if (reelFromKey(key) === reelIndex) total += mult
  }
  return total
}

// ─── MAX WIN CAPPING ───────────────────────────────────────────────────────

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

type ProcessedWin = {
  symbol: string
  kind: number
  win: number
  positions: Array<{ reel: number; row: number }>
  meta: {
    lineIndex: number
    multiplier: number
    winWithoutMult: number
  }
}

function trimWinsToMaxWin(wins: ProcessedWin[], remainingMaxWin: number) {
  if (remainingMaxWin <= 0 || wins.length === 0) return []

  let accumulated = 0
  const keptWins: ProcessedWin[] = []

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

    const triggerWinAmount = roundToDecimal(remainingMaxWin - accumulated)
    if (triggerWinAmount <= 0) return keptWins

    const originalWin = win.win <= 0 ? 1 : win.win
    const ratio = triggerWinAmount / originalWin

    keptWins.push({
      ...win,
      win: triggerWinAmount,
      meta: {
        ...win.meta,
        winWithoutMult: roundToDecimal(win.meta.winWithoutMult * ratio),
      },
    })

    return keptWins
  }

  return keptWins
}

function scaleWinsToCap(wins: ProcessedWin[], rawTotal: number, cappedTotal: number) {
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

// ─── EVENTS ────────────────────────────────────────────────────────────────

function addRevealEvent(
  ctx: Context,
  wrByPos: Record<string, number>,
  wildByPos: Record<string, number>,
) {
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
      const mult = row !== null ? wrByPos[posKey(reelIndex, row)] : undefined
      if (mult !== undefined) symbolData["multiplier"] = mult
    }
    const tier = symbol.properties.get("wildTier")
    if (tier !== undefined) {
      symbolData["wildTier"] = tier
      const mult = row !== null ? wildByPos[posKey(reelIndex, row)] : undefined
      if (mult !== undefined) symbolData["multiplier"] = mult
    }
    if (symbol.properties.get("isScatter")) {
      symbolData["Scatter"] = true
    }

    return symbolData
  }

  const board = boardReels.map((reel, reelIndex) => {
    const topPad = paddingTop[reelIndex] || []
    const bottomPad = paddingBottom[reelIndex] || []

    return [
      ...topPad.map((symbol) => buildSymbolData(symbol, reelIndex, null)),
      ...reel.map((symbol, row) => buildSymbolData(symbol, reelIndex, row)),
      ...bottomPad.map((symbol) => buildSymbolData(symbol, reelIndex, null)),
    ]
  })

  const paddingPositions = new Array(boardReels.length).fill(0)
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
    // With 2 scatters landed (any type), set anticipation for remaining reels.
    if (count >= 2) {
      ctx.services.board.setAnticipationForReel(i, true)
    }
    if (reel.some((symbol) => symbol.properties.get("isScatter"))) {
      count++
    }
  }
}

// ─── WIN EVALUATION ────────────────────────────────────────────────────────

function handleWins(
  ctx: Context,
  wrByPos: Record<string, number>,
  wildByPos: Record<string, number>,
  isFreeSpin = false,
): number {
  const boardReels = ctx.services.board.getBoardReels()
  const wildReelSymbol = ctx.config.symbols.get("WR")!

  const wildReels = new Set<number>()
  for (const key of Object.keys(wrByPos)) wildReels.add(reelFromKey(key))

  // Win evaluation treats any reel containing a WR as fully wild across
  // every row. The reveal event still shows the real per-cell layout.
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

  const { winCombinations } = lines.evaluateWins(modifiedBoardReels).getWins()

  let totalPayout = 0
  let processedWins: ProcessedWin[] = winCombinations.map((combo) => {
    // Sum ALL wild multipliers involved in this line:
    // - each WR reel the line crosses contributes that reel's combined WR total
    // - each tiered wild cell on the line contributes its own rolled value
    let multSum = 0
    const countedReels = new Set<number>()

    combo.symbols.forEach((sym) => {
      if (wildReels.has(sym.reelIndex)) {
        if (!countedReels.has(sym.reelIndex)) {
          multSum += reelWRTotal(wrByPos, sym.reelIndex)
          countedReels.add(sym.reelIndex)
        }
        return
      }
      const wildMult = wildByPos[posKey(sym.reelIndex, sym.posIndex)]
      if (wildMult !== undefined) multSum += wildMult
    })

    const comboMultiplier = multSum > 0 ? multSum : 1
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
  if (payout === 25000) return 6
  if (payout >= 200) return 5
  if (payout >= 50) return 4
  if (payout >= 25) return 3
  if (payout >= 15) return 2
  if (payout > 0) return 1

  return 0
}

// ─── FREE SPINS ────────────────────────────────────────────────────────────

function checkFreespins(ctx: Context) {
  const isTriggerSpin = ctx.state.currentSpinType === SPIN_TYPE.BASE_GAME
  const { sCount, ssCount } = getScatterCounts(ctx)

  if (isTriggerSpin) {
    // Bonuses only ever come from forced result sets (organic draws are
    // redrawn until they don't trigger, see drawBoard).
    if (!ctx.state.currentResultSet.forceFreespins) return

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

    ctx.state.userData.stickyWildReels = {}
    ctx.state.userData.bonusTier = tier
    // Guaranteed first-spin WR for super/hidden, for forced-maxwin rounds,
    // and for forced big-win rounds (multiplier floor >= 2000) - makes
    // reaching those payouts feasible in sims.
    const rs = ctx.state.currentResultSet
    const multiplierFloor = Array.isArray(rs.multiplier) ? rs.multiplier[0]! : 0
    ctx.state.userData.isFirstBonusSpin =
      tier === "super" || tier === "hidden" || !!rs.forceMaxWin || multiplierFloor >= 2000

    ctx.state.currentSpinType = SPIN_TYPE.FREE_SPINS
    playFreeSpins(ctx)
    return
  }

  // Mid-feature retriggers (all tiers): +1 spin per S, +2 spins per SS.
  const additionalFs = sCount * RETRIGGER_SPINS_PER_S + ssCount * RETRIGGER_SPINS_PER_SS
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
    const { wrByPos, wildByPos } = resolveWildMultipliers(ctx, true)
    addRevealEvent(ctx, wrByPos, wildByPos)
    handleWins(ctx, wrByPos, wildByPos, true)
    ctx.services.wallet.confirmSpinWin()

    if (hasReachedMaxWin(ctx)) {
      endFreeSpins(ctx)
      return
    }

    checkFreespins(ctx) // Check for retriggers
  }

  endFreeSpins(ctx)
}

function endFreeSpins(ctx: Context) {
  ctx.state.currentFreespinAmount = 0

  const totalWin = capToMaxWin(ctx, ctx.state.userData.totalFreeSpinsWin)
  const winLevel = calculateWinLevel(totalWin)

  ctx.services.data.addBookEvent({
    type: "freeSpinEnd",
    data: {
      amount: totalWin,
      winLevel,
    },
  })

  ctx.services.data.addBookEvent({
    type: "finalWin",
    data: {
      amount: totalWin,
    },
  })

  ctx.state.userData.stickyWildReels = {}
  ctx.state.userData.bonusTier = ""
  ctx.state.userData.isFirstBonusSpin = false
  ctx.state.userData.totalFreeSpinsWin = 0
}
