import {
  ClusterWinType,
  GameContext,
  GameSymbol,
  SPIN_TYPE,
} from "@slot-engine/core"
import { GameModesType, SymbolsType, UserStateType } from ".."

type Context = GameContext<GameModesType, SymbolsType, UserStateType>

/**
 * Lucky Wild destruction range. Once the board has no remaining clusters and no
 * more tumbles, every Wild ("W") on the board destroys ITSELF plus a random
 * number of other board positions in this inclusive range, drawn per Wild.
 */
const LUCKY_WILD_MIN_DESTROY = 5
const LUCKY_WILD_MAX_DESTROY = 10
const LUCKY_WILD_DESTROY_COUNTS = (() => {
  const counts: number[] = []
  for (let n = LUCKY_WILD_MIN_DESTROY; n <= LUCKY_WILD_MAX_DESTROY; n++) {
    counts.push(n)
  }
  return counts
})()

/**
 * Weighted multiplier table for the per-spin symbol multiplier in super free spins.
 * Lower multipliers are common; higher values are increasingly rare.
 */
const FS_SYMBOL_MULTI_WEIGHTS: Record<number, number> = {
  2: 20, 3: 16, 4: 13, 5: 11, 6: 9, 7: 7, 8: 6, 9: 5, 10: 4,
  15: 3, 20: 2.5, 25: 2, 30: 1.5, 35: 1.2, 40: 1, 45: 0.8, 50: 0.7,
  100: 0.5, 200: 0.3, 300: 0.2, 400: 0.15, 500: 0.1, 1000: 0.05,
}

/**
 * Weighted multiplier table for the per-spin symbol multiplier in hidden free spins.
 * Minimum value is 25x; very high values are rare but possible.
 */
const FS_HIDDEN_SYMBOL_MULTI_WEIGHTS: Record<number, number> = {
  25: 28, 30: 22, 35: 16, 40: 12, 45: 8, 50: 6,
  100: 4, 200: 2, 300: 1, 400: 0.5, 500: 0.3, 1000: 0.2,
}

/**
 * All cluster-paying symbols that can be selected as the per-spin feature symbol.
 * Excludes scatter (S) and wild (W).
 */
const FS_CLUSTER_SYMBOLS = ["H1", "H2", "H3", "H4", "L1", "L2", "L3"] as const

function roundToDecimal(value: number, decimals: number = 1): number {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

function capToMaxWin(ctx: Context, value: number): number {
  return roundToDecimal(Math.min(value, ctx.config.maxWinX))
}

function getRemainingMaxWin(ctx: Context): number {
  const remaining =
    ctx.config.maxWinX -
    ctx.services.wallet.getCurrentWin() -
    ctx.services.wallet.getCurrentSpinWin()
  return roundToDecimal(Math.max(0, remaining))
}

function trimClusterWinsToMaxWin(
  wins: Array<{
    symbol: string
    kind: number
    win: number
    positions: Array<{ reel: number; row: number }>
    meta: {
      multiplier: number
      winWithoutMult: number
      symbolMult: number
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

  // For the guaranteed-board-multi buy modes, pre-fill every board position
  // with a random starting multiplier so the single paid spin is amplified
  // from the very first tumble. No-op for every other mode.
  applyGuaranteedBoardMultis(ctx)

  // Draw a feature symbol and multiplier for this base-game spin.
  drawGlobalSymbolMulti(ctx)

  // Build the initial board
  drawBoard(ctx)

  // Set anticipation states based on scatters on board
  handleAnticipation(ctx)

  // Create event to tell the client what to render
  addRevealEvent(ctx)

  // Tumble until no more wins.
  // This also creates event data for the frontend.
  const spinWin = handleTumbles(ctx)

  // Finalize this round's win
  ctx.services.wallet.confirmSpinWin()

  if (spinWin > 0) {
    ctx.services.data.addBookEvent({
      type: "finalWin",
      data: {
        amount: Math.min(roundToDecimal(ctx.services.wallet.getCurrentWin()), ctx.config.maxWinX),
      },
    })
  }

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

      const [scatCount] = ctx.services.board.countSymbolsOnBoard(scatter)

      if (scatCount == numScatters) break
    }
  } else if (
    // If spin should NOT trigger free spins, draw board with up to 2 scatters
    !ctx.state.currentResultSet.forceFreespins &&
    ctx.state.currentSpinType == SPIN_TYPE.BASE_GAME
  ) {
    while (true) {
      ctx.services.board.resetBoard()
      ctx.services.board.drawBoardWithRandomStops(reels)

      const [scatCount] = ctx.services.board.countSymbolsOnBoard(scatter)

      if (scatCount > ctx.config.anticipationTriggers[ctx.state.currentSpinType]) {
        continue
      }

      break
    }
  } else {
    // If no special ResultSet criteria, or we are in FS, draw board normally.
    // Cap scatters at 5 so 6 can never land (this also bounds free-spin
    // retriggers to the 3 / 4 / 5 scatter tiers).
    while (true) {
      ctx.services.board.resetBoard()
      ctx.services.board.drawBoardWithRandomStops(reels)

      const [scatCount] = ctx.services.board.countSymbolsOnBoard(scatter)

      if (scatCount <= 5) break
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

// Re-evaluates scatter anticipation after each tumble. Anticipation must be
// based on the scatters ALREADY locked on the board BEFORE the new tumble
// symbols drop in (`scattersAlreadyOnBoard`), NOT the post-tumble board: a
// scatter that lands during this very tumble must not retroactively trigger
// anticipation for the drop that just landed it. When 2 or more scatters were
// already present during a base-game spin, ALL reels enter anticipation so the
// player sees they are one scatter away from triggering free spins.
// Returns the updated anticipation array (1/0 per reel) for inclusion in
// tumbleSymbols events.
function refreshTumbleAnticipation(
  ctx: Context,
  scattersAlreadyOnBoard: number,
): number[] {
  if (ctx.state.currentSpinType === SPIN_TYPE.FREE_SPINS) {
    return ctx.services.board.getAnticipation().map((v) => (v ? 1 : 0))
  }

  if (scattersAlreadyOnBoard >= 2) {
    // 2+ scatters were already on the board — all reels enter anticipation so
    // players know a new scatter anywhere completes the trigger.
    ctx.services.board.getBoardReels().forEach((_, i) =>
      ctx.services.board.setAnticipationForReel(i, true),
    )
  } else {
    // Fewer than 2 scatters already present — clear any stale anticipation so we
    // don't carry forward all-true state from a previous tumble or spin.
    ctx.services.board.getBoardReels().forEach((_, i) =>
      ctx.services.board.setAnticipationForReel(i, false),
    )
  }

  return ctx.services.board.getAnticipation().map((v) => (v ? 1 : 0))
}

// Caps the number of scatter symbols on the board after each tumble drop by
// converting excess freshly-landed scatters into random regular cluster symbols
// (both on the board and in `newBoardSymbols` so emitted events stay accurate).
//
// The maximum allowed scatter count is determined per spin context:
//   • FREE_SPINS                              → 5 (global hard cap)
//   • BASE_GAME, non-bonus result set         → anticipationTriggers (2): near-miss
//                                               cap — a non-bonus spin can never
//                                               reach the 3-scatter trigger.
//   • BASE_GAME, forceFreespins "freespins"   → 3 (normal bonus buy tier)
//   • BASE_GAME, forceFreespins "superfreespins" → 4 (super bonus buy tier)
//   • BASE_GAME, forceFreespins "hiddenfreespins"/"maxwin" → 5 (global max)
//
// This prevents tumbling scatters from upgrading the player to a higher free-spin
// tier than they paid for (e.g. a super-buy landing 5 scatters via tumbles and
// silently triggering the hidden tier).
function capBaseScatters(
  ctx: Context,
  newBoardSymbols: Record<string, GameSymbol[]>,
) {
  const scatter = ctx.config.symbols.get("S")!
  const [totalScatters] = ctx.services.board.countSymbolsOnBoard(scatter)

  let maxScatters: number
  if (ctx.state.currentSpinType === SPIN_TYPE.FREE_SPINS) {
    // Global hard cap — free-spin retriggers must never exceed 5 scatters.
    maxScatters = 5
  } else if (!ctx.state.currentResultSet.forceFreespins) {
    // Non-bonus base spin: keep scatters below the trigger threshold so the
    // "3 scatters but no free spins" state can never occur.
    maxScatters = ctx.config.anticipationTriggers[SPIN_TYPE.BASE_GAME]
  } else {
    // Forced-freespins base spin (bonus buy or standard forced trigger): cap
    // tumble-in scatters to the tier the result set targets so tumbles can
    // never silently upgrade the player to a higher-value free-spin tier.
    const criteria = ctx.state.currentResultSet.criteria
    if (criteria === "freespins") {
      maxScatters = 3  // normal bonus buy
    } else if (criteria === "superfreespins") {
      maxScatters = 4  // super bonus buy
    } else {
      // hiddenfreespins (5) and maxwin (5): global max, no extra restriction.
      maxScatters = 5
    }
  }

  let excess = totalScatters - maxScatters
  if (excess <= 0) return

  // Only the freshly dropped-in symbols can be converted — pre-existing scatters
  // were already within the cap on the previous board. New symbols occupy the
  // top rows of each reel, so newBoardSymbols[reel][j] sits at board cell
  // [reel, j]. Convert excess new scatters (front of the array = topmost) into a
  // random regular symbol until the board is back within the cap.
  for (const [reelKey, symbols] of Object.entries(newBoardSymbols)) {
    if (excess <= 0) break
    const reelIdx = Number(reelKey)
    for (let rowIdx = 0; rowIdx < symbols.length; rowIdx++) {
      if (excess <= 0) break
      if (!symbols[rowIdx]!.properties.get("isScatter")) continue

      const replacementId = ctx.services.rng.randomItem([...FS_CLUSTER_SYMBOLS])
      const replacement = ctx.config.symbols.get(replacementId)!.clone()
      ctx.services.board.setSymbol(reelIdx, rowIdx, replacement)
      symbols[rowIdx] = replacement
      excess--
    }
  }
}

// Returns the total payout accumulated across all tumbles for this spin.
function handleTumbles(ctx: Context): number {
  const cluster = new ClusterWinType({
    ctx,
  })

  const scatter = ctx.config.symbols.get("S")!

  let spinTotal = 0

  // Keep tumbling until no more wins AND no Wilds remain on the board.
  while (true) {
    // ── Evaluate cluster wins ───────────────────────────────────────────────
    // Wilds ("W") are inert here: ClusterWinType is created without a
    // `wildSymbol`, and W has no `pays`, so it never forms or joins a cluster
    // and is never returned in winCombinations. Wilds simply sit on the board
    // while clusters resolve around them.
    const { payout: rawPayout, winCombinations } = cluster
      .evaluateWins(ctx.services.board.getBoardReels())
      .getWins()

    if (rawPayout === 0) {
      // No clusters remain. Now (and only now) resolve every Wild currently on
      // the board in a single LuckyWilds event. This removes the Wilds plus
      // 5-10 random positions per Wild, bumps those positions' multipliers as
      // if they had won, and tumbles fresh symbols in. If the resulting board
      // produces new clusters (or new Wilds tumble in) we loop again; Wilds are
      // never handled until the board has no winning connections left.
      const wildsProcessed = handleLuckyWilds(ctx)
      if (wildsProcessed) {
        if (ctx.state.triggeredMaxWin) break
        continue
      }
      break
    }

    // For each cluster win, compute:
    //   boardMult  = sum of all active board-position multipliers (>=2) on the
    //                cluster's symbols; falls back to 1x when none are active.
    //   win        = basePayout × boardMult × fsGlobalMulti
    //   winWithoutMult = basePayout (base cluster value, no multipliers)
    // This mirrors cabin_fever's per-line win breakdown exactly.
    let totalPayout = 0
    let wins = winCombinations.map((wc) => {
      const clusterMultiplier = wc.symbols.reduce((sum, s) => {
        const mult = ctx.state.userData.boardMultis[s.reelIndex]![s.posIndex]!
        return mult >= 2 ? sum + mult : sum
      }, 0)
      const boardMult = Math.max(1, clusterMultiplier)
      // Apply the per-spin symbol multiplier when this win's symbol matches the
      // active feature symbol (super/hidden free spins only). Falls back to 1x
      // (i.e. base game and normal free spins are unaffected).
      const globalSymbolMulti = ctx.state.userData.globalSymbolMulti
      const symbolMult = (globalSymbolMulti && wc.baseSymbol.id === globalSymbolMulti.symbol)
        ? globalSymbolMulti.multiplier
        : 1
      const winAmount = roundToDecimal(wc.payout * boardMult * symbolMult)
      totalPayout = roundToDecimal(totalPayout + winAmount)
      return {
        symbol: wc.baseSymbol.id,
        kind: wc.kind,
        win: winAmount,
        positions: wc.symbols.map((s) => ({ reel: s.reelIndex, row: s.posIndex })),
        meta: {
          multiplier: boardMult,
          winWithoutMult: roundToDecimal(wc.payout),
          symbolMult,
        },
      }
    })

    const remainingMaxWin = getRemainingMaxWin(ctx)
    const cappedTotalPayout = capToMaxWin(ctx, Math.min(totalPayout, remainingMaxWin))

    if (totalPayout > cappedTotalPayout) {
      wins = trimClusterWinsToMaxWin(wins, remainingMaxWin)
    }

    totalPayout = cappedTotalPayout
    if (totalPayout <= 0) {
      ctx.state.triggeredMaxWin = true
      break
    }

    spinTotal = roundToDecimal(spinTotal + totalPayout)

    // Deduplicate win symbols for board multiplier updates and tumbling.
    const winSymbols = ctx.services.game.dedupeWinSymbols(winCombinations)

    ctx.services.data.addBookEvent({
      type: "winInfo",
      data: {
        totalWin: totalPayout,
        wins,
      },
    })

    // `addTumbleWin` already calls `addSpinWin`, so no need to do it here.
    ctx.services.wallet.addTumbleWin(totalPayout)

    // As soon as this tumble reaches the cap, the round ends immediately.
    if (totalPayout >= remainingMaxWin) {
      ctx.state.triggeredMaxWin = true
      break
    }

    // Update board-position multipliers after wins are paid:
    //   0 (unvisited) → 2 (active: contributes 2x on next tumble win)
    //   2 → 4 → 8 → … up to the tier's multiCap.
    // Skipping the intermediate 1 state means multipliers apply from the
    // second win on a position, matching the intended Sugar Rush mechanic.
    const multiCap = getEffectiveMultiCap(ctx)
    for (const sym of winSymbols) {
      const current = ctx.state.userData.boardMultis[sym.reelIdx]![sym.rowIdx]!
      ctx.state.userData.boardMultis[sym.reelIdx]![sym.rowIdx] = current === 0
        ? 2
        : Math.min(current * 2, multiCap)
    }

    ctx.services.data.addBookEvent({
      type: "updateMultipliers",
      data: {
        multipliers: ctx.state.userData.boardMultis.map((reel) => [...reel]),
      },
    })

    // Tumbling the board drops new symbols into the vacated positions.
    // Count scatters already locked on the board BEFORE new symbols drop in;
    // anticipation reflects only those, never a scatter landing this tumble.
    const [scattersBeforeTumble] =
      ctx.services.board.countSymbolsOnBoard(scatter)
    const { newBoardSymbols } =
      ctx.services.board.tumbleBoard(winSymbols)

    // Cap tumble-in scatters to the limit for the current spin context.
    capBaseScatters(ctx, newBoardSymbols)

    const clusterTumbleAnticipation = refreshTumbleAnticipation(
      ctx,
      scattersBeforeTumble,
    )
    ctx.services.data.addBookEvent({
      type: "tumbleSymbols",
      data: {
        newBoardSymbols: Object.fromEntries(
          Object.entries(newBoardSymbols).map(([reelIdx, symbols]) => [
            reelIdx,
            symbols.map((s) => {
              const symbolData: Record<string, any> = { name: s.id }
              if (s.properties.get("isScatter")) symbolData["Scatter"] = true
              return symbolData
            }),
          ]),
        ),
        anticipation: clusterTumbleAnticipation,
      },
    })
  }

  if (spinTotal > 0) {
    ctx.services.data.addBookEvent({
      type: "setWin",
      data: {
        amount: spinTotal,
        winLevel: calculateWinLevel(spinTotal),
      },
    })
  }

  return spinTotal
}

// Resolves every Wild ("W") currently on the board in a single LuckyWilds event.
// Called only once the board has no remaining clusters. For each Wild we destroy
// the Wild itself plus 5-10 randomly chosen other positions (never scatters, so
// free-spin triggers and the scatter cap are unaffected, and never another Wild
// — every Wild is removed anyway). Each destroyed position has its board
// multiplier bumped as if it had been part of a win, then fresh symbols tumble
// in. Returns true if at least one Wild was processed (board changed), false if
// no Wilds were present.
function handleLuckyWilds(ctx: Context): boolean {
  const wild = ctx.config.symbols.get("W")!
  const [wildCount] = ctx.services.board.countSymbolsOnBoard(wild)
  if (wildCount === 0) return false

  const scatter = ctx.config.symbols.get("S")!
  const boardReels = ctx.services.board.getBoardReels()
  const reelsCount = boardReels.length

  const wildPositions: Array<{ reel: number; row: number }> = []
  boardReels.forEach((reel, reelIdx) => {
    reel.forEach((symbol, rowIdx) => {
      if (symbol.id === "W") wildPositions.push({ reel: reelIdx, row: rowIdx })
    })
  })

  const posKey = (p: { reel: number; row: number }) => `${p.reel}:${p.row}`

  // Returns the up/down/left/right neighbours that exist on the board.
  const getAdjacent = (reel: number, row: number): Array<{ reel: number; row: number }> => {
    const adj: Array<{ reel: number; row: number }> = []
    if (reel > 0) adj.push({ reel: reel - 1, row })
    if (reel < reelsCount - 1) adj.push({ reel: reel + 1, row })
    if (row > 0) adj.push({ reel, row: row - 1 })
    if (row < boardReels[reel]!.length - 1) adj.push({ reel, row: row + 1 })
    return adj
  }

  // Global claimed set starts with every Wild so two Wilds never expand into
  // each other's cells. Scatters are also ineligible and are skipped in the
  // frontier seed step below.
  const claimed = new Set<string>()
  for (const w of wildPositions) claimed.add(posKey(w))

  // Per-Wild BFS expansion. Each Wild grows a connected group starting from its
  // own cell: every added cell must be adjacent to at least one already-claimed
  // cell (the group is always contiguous). The Wild's own position is included
  // in clearedPositions so the event unambiguously lists every cell this Wild
  // is responsible for removing.
  const wildDetails = wildPositions.map((w) => {
    const desired = ctx.services.rng.randomItem(LUCKY_WILD_DESTROY_COUNTS)

    // frontier: eligible adjacent cells that could extend the group.
    // Use a parallel Set for O(1) deduplication and an Array for random access.
    const frontierSet = new Set<string>()
    const frontierArr: Array<{ reel: number; row: number }> = []

    const seedFrontier = (reel: number, row: number) => {
      for (const adj of getAdjacent(reel, row)) {
        const key = posKey(adj)
        const sym = boardReels[adj.reel]![adj.row]!
        if (!claimed.has(key) && !frontierSet.has(key) && !sym.properties.get("isScatter")) {
          frontierSet.add(key)
          frontierArr.push(adj)
        }
      }
    }

    seedFrontier(w.reel, w.row)

    const destroyedPositions: Array<{ reel: number; row: number }> = []
    while (destroyedPositions.length < desired && frontierArr.length > 0) {
      // Pick a random frontier cell (swap-with-last for O(1) removal).
      const idx = Math.min(
        Math.floor(ctx.services.rng.randomFloat(0, frontierArr.length)),
        frontierArr.length - 1,
      )
      const cell = frontierArr[idx]!
      frontierArr[idx] = frontierArr[frontierArr.length - 1]!
      frontierArr.pop()
      frontierSet.delete(posKey(cell))

      claimed.add(posKey(cell))
      destroyedPositions.push(cell)
      seedFrontier(cell.reel, cell.row)
    }

    // clearedPositions = Wild itself + all cells it destroyed. Listing the Wild
    // first makes it unambiguous which cell is the source.
    return {
      wildPosition: w,
      clearedPositions: [w, ...destroyedPositions],
    }
  })

  // Flat union of every cleared cell for the board operations below.
  const allRemoved: Array<{ reel: number; row: number }> = []
  for (const wd of wildDetails) {
    for (const p of wd.clearedPositions) allRemoved.push(p)
  }

  // Emit the LuckyWilds event before mutating the board so clients can animate.
  // Each entry in `wilds` lists the Wild's own position first in clearedPositions,
  // followed by the connected cells it destroyed.
  ctx.services.data.addBookEvent({
    type: "luckyWilds",
    data: {
      wilds: wildDetails,
    },
  })

  // Bump the board multiplier at every destroyed position exactly as a cluster
  // win would (0 -> 2, then doubling up to the active cap), then emit the update
  // so the higher multipliers apply to whatever tumbles in.
  const multiCap = getEffectiveMultiCap(ctx)
  for (const cell of allRemoved) {
    const current = ctx.state.userData.boardMultis[cell.reel]![cell.row]!
    ctx.state.userData.boardMultis[cell.reel]![cell.row] =
      current === 0 ? 2 : Math.min(current * 2, multiCap)
  }

  ctx.services.data.addBookEvent({
    type: "updateMultipliers",
    data: {
      multipliers: ctx.state.userData.boardMultis.map((reel) => [...reel]),
    },
  })

  // Tumble out every destroyed position so fresh symbols drop in.
  const [scattersBeforeTumble] = ctx.services.board.countSymbolsOnBoard(scatter)
  const { newBoardSymbols } = ctx.services.board.tumbleBoard(
    allRemoved.map((p) => ({ reelIdx: p.reel, rowIdx: p.row })),
  )

  // Cap tumble-in scatters to the limit for the current spin context.
  capBaseScatters(ctx, newBoardSymbols)

  const tumbleAnticipation = refreshTumbleAnticipation(ctx, scattersBeforeTumble)
  ctx.services.data.addBookEvent({
    type: "tumbleSymbols",
    data: {
      newBoardSymbols: Object.fromEntries(
        Object.entries(newBoardSymbols).map(([reelIdx, symbols]) => [
          reelIdx,
          symbols.map((s) => {
            const symbolData: Record<string, any> = { name: s.id }
            if (s.properties.get("isScatter")) symbolData["Scatter"] = true
            return symbolData
          }),
        ]),
      ),
      anticipation: tumbleAnticipation,
    },
  })

  return true
}

function checkFreespins(ctx: Context) {
  // Free spins are GATED on non-bonus ("0" / "basegame") base-game result sets:
  // they may only be triggered by a result set that explicitly forces them
  // (forceFreespins) or by a retrigger already inside the free-spin loop. This
  // is the safety net; the primary guarantee is the reel design — non-bonus
  // result sets use the scatter-free `baseNoScatter` reel, so scatters never
  // appear (and therefore never accumulate to 3+) on a non-bonus base spin.
  // Together these ensure 3 scatters only ever appear alongside a real bonus,
  // so the "3 scatters on screen but no free spins" state can never occur, with
  // zero acceptance-retry overhead. Forced result sets and FREE_SPINS
  // retriggers pass through unaffected.
  if (
    ctx.state.currentSpinType === SPIN_TYPE.BASE_GAME &&
    !ctx.state.currentResultSet.forceFreespins
  ) {
    return
  }

  const scatter = ctx.config.symbols.get("S")!
  const [rawScatCount] = ctx.services.board.countSymbolsOnBoard(scatter)

  // For bonus buy modes, extra scatters that tumble in during the base spin must
  // not upgrade the free-spin tier beyond what the player paid for:
  //   "freespins"      → bonus buy  → cap at 3 (normal tier)
  //   "superfreespins" → super buy  → cap at 4 (super tier)
  // "hiddenfreespins" maps to >=5 which is already the highest tier, no cap needed.
  // "maxwin" forces 5 scatters for reel-stop placement in ALL modes, but for
  // bonusFeature / superBonusFeature the player bought a specific tier — the
  // maxwin result set must not silently upgrade them to hidden tier.
  const scatCount = (() => {
    if (
      ctx.state.currentSpinType === SPIN_TYPE.BASE_GAME &&
      ctx.state.currentResultSet.forceFreespins
    ) {
      const criteriaScatterCap: Partial<Record<string, number>> = {
        freespins: 3,
        superfreespins: 4,
      }
      // Bonus-buy modes that lock a specific tier must also cap the maxwin
      // scatter count so the maxwin result set (which forces 5 scatters for
      // reel-stop placement) doesn't accidentally trigger the hidden tier.
      const modeName = ctx.services.game.getCurrentGameMode().name
      if (modeName === "bonusFeature") criteriaScatterCap["maxwin"] = 3
      else if (modeName === "superBonusFeature") criteriaScatterCap["maxwin"] = 4
      const cap = criteriaScatterCap[ctx.state.currentResultSet.criteria]
      if (cap !== undefined) return Math.min(rawScatCount, cap)
    }
    return rawScatCount
  })()

  // Fixed free-spin award looked up from `scatterToFreespins` config:
  //   BASE_GAME (trigger):   3/4/5 scatters -> 12 free spins
  //                          (Bonus / Super Bonus / Hidden Bonus tiers).
  //   FREE_SPINS (retrigger): 3 -> +3, 4 -> +5, 5 -> +8 free spins.
  // Returns 0 for fewer than 3 scatters, so nothing happens.
  const freespinsAwarded = ctx.services.game.getFreeSpinsForScatters(
    ctx.state.currentSpinType,
    scatCount,
  )

  if (freespinsAwarded <= 0) return

  ctx.services.game.awardFreespins(freespinsAwarded)

  // Ensure we only trigger free spins from base game.
  // Our playFreeSpins function handles the free spins loop already and we don't want recursion.
  if (ctx.state.currentSpinType == SPIN_TYPE.BASE_GAME) {
    // Determine the free-spin tier from the number of triggering scatters and
    // initialize the feature-wide global multiplier for that tier.
    //   3 scatters -> normal free spins
    //   4 scatters -> super free spins  (higher value)
    //   5 scatters -> hidden free spins (highest value)
    const tier = getTierForScatters(scatCount)
    ctx.state.userData.fsTier = tier
    ctx.state.userData.fsGlobalMulti = getTierConfig(tier).startMulti

    ctx.services.data.addBookEvent({
      type: "freeSpinTrigger",
      data: {
        totalFs: freespinsAwarded,
        positions: getScatterPositions(ctx),
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

    // For super/hidden free spins: pre-populate every board position with a random
    // starting multiplier so wins are amplified from the very first tumble.
    // For normal free spins: clear any multipliers that built up during the
    // triggering base-game spin so sticky multis only accumulate within FS.
    if (tier === "super" || tier === "hidden") {
      initBoardMultis(ctx, tier)

      ctx.services.data.addBookEvent({
        type: "boardMultiInit",
        data: {
          multipliers: ctx.state.userData.boardMultis.map((reel) => [...reel]),
        },
      })
    } else {
      ctx.state.userData.boardMultis = ctx.state.userData.boardMultis.map(
        (reel) => reel.map(() => 0),
      )
    }

    playFreeSpins(ctx)
    return
  }

  // ── Free-spin retrigger ───────────────────────────────────────────────────
  // Reached only while already inside the free-spin loop. The tier never
  // changes on a retrigger — we simply add the awarded spins to the running
  // feature (3 -> +3, 4 -> +5, 5 -> +8). awardFreespins above already topped
  // up the remaining spin count.
  ctx.services.data.addBookEvent({
    type: "addAdditionalFreeSpins",
    data: {
      additionalFs: freespinsAwarded,
      remainingFs: ctx.state.currentFreespinAmount,
      totalFs: ctx.state.totalFreespinAmount,
      positions: getScatterPositions(ctx),
    },
  })
}

function playFreeSpins(ctx: Context) {
  // Change spin type to free spins manually (Slot Engine does not do this automatically yet)
  ctx.state.currentSpinType = SPIN_TYPE.FREE_SPINS

  // Free spins loop
  while (ctx.state.currentFreespinAmount > 0) {
    ctx.state.currentFreespinAmount--

    const currentSpin = ctx.state.totalFreespinAmount - ctx.state.currentFreespinAmount

    ctx.services.data.addBookEvent({
      type: "updateFreeSpin",
      data: {
        amount: currentSpin,
        total: ctx.state.totalFreespinAmount,
      },
    })

    // Draw a feature symbol and multiplier before each free spin.
    drawGlobalSymbolMulti(ctx)

    drawBoard(ctx)
    handleAnticipation(ctx)

    addRevealEvent(ctx)

    const fsSpinWin = handleTumbles(ctx)

    // Add event before calling `confirmSpinWin()`, because the spin win will be reset.
    // For total-win UI, emit the full accumulated amount so far in this play:
    // confirmed total + current spin's pending win.
    if (fsSpinWin > 0) {
      const totalWinSoFar = roundToDecimal(
        ctx.services.wallet.getCurrentWin() + ctx.services.wallet.getCurrentSpinWin(),
      )

      ctx.services.data.addBookEvent({
        type: "setTotalWin",
        data: {
          amount: Math.min(totalWinSoFar, ctx.config.maxWinX),
        },
      })
    }

    ctx.services.wallet.confirmSpinWin()

    // We don't want to play more free spins if max win was reached
    if (ctx.state.triggeredMaxWin) break

    checkFreespins(ctx)
  }

  // All FS have been played at this point so we can send the total win amount using `getCurrentWin()`.
  const fsTotalWin = Math.min(roundToDecimal(ctx.services.wallet.getCurrentWin()), ctx.config.maxWinX)

  ctx.services.data.addBookEvent({
    type: "freeSpinEnd",
    data: {
      amount: fsTotalWin,
      winLevel: calculateWinLevel(fsTotalWin),
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
  // to 256x, no feature-wide global multiplier.
  normal: { startMulti: 1, ramp: 0, multiCap: 256 },
  // Super free spins (4 scatters): higher multiplier ceiling. Each spin a
  // random cluster symbol is assigned a random multiplier from FS_SYMBOL_MULTI_POOL;
  // all wins for that symbol during the spin (and its tumbles) are boosted.
  super: { startMulti: 1, ramp: 0, multiCap: 256 },
  // Hidden free spins (5 scatters): same as super but multiplier pool starts at
  // 10x minimum (FS_HIDDEN_SYMBOL_MULTI_POOL). Board positions also start with
  // random multipliers active.
  hidden: { startMulti: 1, ramp: 0, multiCap: 256 },
}

function getTierConfig(tier: FsTier) {
  return FS_TIERS[tier]
}

function getTierForScatters(scatCount: number): FsTier {
  if (scatCount >= 5) return "hidden"
  if (scatCount >= 4) return "super"
  return "normal"
}

// Weighted starting multiplier tables for pre-filled board positions.
// All tiers cap at 256x; higher values are heavily down-weighted so huge
// starting boards remain rare.
//   Super  (multiCap 256x): minimum 2x
//   Hidden (multiCap 256x): minimum 8x
const BOARD_MULTI_INIT_WEIGHTS: Record<FsTier, Record<number, number>> = {
  normal: {},
  super:  { 2: 35, 4: 28, 8: 18, 16: 9, 32: 5, 64: 3, 128: 1.5, 256: 0.5 },
  hidden: { 8: 38, 16: 26, 32: 16, 64: 9, 128: 5, 256: 4 },
}

// For super/hidden free spins: pre-populates every board position with a
// weighted-random starting multiplier so wins are amplified from the very first
// tumble. Low values are common; high values are rare but possible up to the
// tier's multiCap.
function initBoardMultis(ctx: Context, tier: FsTier) {
  const modeName = ctx.services.game.getCurrentGameMode().name
  const useSuperInitForGuaranteedHiddenFs =
    modeName === "guaranteedBoardMultis" &&
    ctx.state.currentSpinType === SPIN_TYPE.FREE_SPINS &&
    tier === "hidden"

  const weights = useSuperInitForGuaranteedHiddenFs
    ? BOARD_MULTI_INIT_WEIGHTS.super
    : BOARD_MULTI_INIT_WEIGHTS[tier]
  ctx.state.userData.boardMultis = ctx.state.userData.boardMultis.map((reel) =>
    reel.map(() => Number(ctx.services.rng.weightedRandom(weights))),
  )
}

// Weighted starting multiplier tables for the guaranteed-board-multi buy modes.
// On the single paid base spin every board position is pre-filled from these.
//   guaranteedBoardMultis:      2x → 256x
//   guaranteedBoardMultisHigh:  8x → 256x
// Lower values are common; higher values are increasingly rare.
const GUARANTEED_BOARD_MULTI_WEIGHTS: Record<string, Record<number, number>> = {
  guaranteedBoardMultis: { 2: 35, 4: 28, 8: 18, 16: 9, 32: 5, 64: 3, 128: 2, 256: 1 },
  guaranteedBoardMultisHigh: {
    8: 35, 16: 26, 32: 16, 64: 9, 128: 5, 256: 3,
  },
}

// For the guaranteed-board-multi buy modes, pre-fills every board position on
// the single paid base spin with a weighted-random starting multiplier (and
// emits a boardMultiInit event so the client can render it before the reveal).
// No-op for every other mode and for free spins.
function applyGuaranteedBoardMultis(ctx: Context) {
  if (ctx.state.currentSpinType !== SPIN_TYPE.BASE_GAME) return

  const modeName = ctx.services.game.getCurrentGameMode().name
  const weights = GUARANTEED_BOARD_MULTI_WEIGHTS[modeName]
  if (!weights) return

  ctx.state.userData.boardMultis = ctx.state.userData.boardMultis.map((reel) =>
    reel.map(() => Number(ctx.services.rng.weightedRandom(weights))),
  )

  ctx.services.data.addBookEvent({
    type: "boardMultiInit",
    data: {
      multipliers: ctx.state.userData.boardMultis.map((reel) => [...reel]),
    },
  })
}

// Returns the per-position doubling ceiling for the current spin.
// All tiers and modes share a 256x max board multiplier. The explicit Math.max
// guards remain for safety, but since every tier's multiCap is now 256 they
// are effectively no-ops.
function getEffectiveMultiCap(ctx: Context): number {
  const tierCap = getTierConfig(ctx.state.userData.fsTier).multiCap

  if (ctx.state.currentSpinType === SPIN_TYPE.BASE_GAME) {
    const modeName = ctx.services.game.getCurrentGameMode().name
    if (modeName === "guaranteedBoardMultisHigh") {
      return Math.max(tierCap, 256)
    }
    if (modeName === "guaranteedBoardMultis") {
      return Math.max(tierCap, 128)
    }
  }

  return tierCap
}

function getScatterWeights(key: string) {
  const SCATTER_WEIGHTS = {
    // Normal bonus: always exactly 3 scatters -> normal free-spin tier.
    freespins: {
      3: 1,
    },
    // Super bonus: always exactly 4 scatters -> super free-spin tier.
    superfreespins: {
      4: 1,
    },
    // Hidden bonus: always exactly 5 scatters -> hidden free-spin tier.
    // 6 scatters can never land.
    hiddenfreespins: {
      5: 1,
    },
    // Max-win forces 5 scatters (hidden tier). Never 6.
    maxwin: {
      5: 1,
    },
  }

  if (key in SCATTER_WEIGHTS) {
    return SCATTER_WEIGHTS[key as keyof typeof SCATTER_WEIGHTS]
  }

  return SCATTER_WEIGHTS.freespins
}

function makeInitialBoardMultis(ctx: Context) {
  const mode = ctx.services.game.getCurrentGameMode()

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
  // Per-spin symbol multiplier — reset at the start of each base round.
  ctx.state.userData.globalSymbolMulti = null
}

// Draws a random cluster symbol and multiplier for the current spin and stores
// it in userData.globalSymbolMulti. Fires the "globalSymbolMulti" book event so clients
// receive the draw before the board reveal. Called on every spin in all modes.
function drawGlobalSymbolMulti(ctx: Context) {
  const tier = ctx.state.userData.fsTier
  // The guaranteedBoardMultisHigh mode guarantees a 25x-minimum
  // symbol multiplier on its single paid BASE spin ONLY. Its free spins fall
  // back to the normal per-tier weight tables (like every other mode) so that
  // bonus-criteria books keep enough win variance for the optimizer to fit a
  // distribution. The hidden tier always uses the high-minimum table as before.
  const modeName = ctx.services.game.getCurrentGameMode().name
  const isHighGuaranteedBaseSpin =
    modeName === "guaranteedBoardMultisHigh" &&
    ctx.state.currentSpinType === SPIN_TYPE.BASE_GAME

  // guaranteedBoardMultis hidden FS is intentionally dampened so its hidden-tier
  // average aligns with base/bonusHunt rather than exploding from stacked highs.
  const isGuaranteedHiddenFsDampened =
    modeName === "guaranteedBoardMultis" &&
    ctx.state.currentSpinType === SPIN_TYPE.FREE_SPINS &&
    tier === "hidden"

  const useHighMulti = (tier === "hidden" && !isGuaranteedHiddenFsDampened) || isHighGuaranteedBaseSpin
  const weights = useHighMulti
    ? FS_HIDDEN_SYMBOL_MULTI_WEIGHTS
    : FS_SYMBOL_MULTI_WEIGHTS
  const multiplier = Number(ctx.services.rng.weightedRandom(weights))
  const symbol = ctx.services.rng.randomItem([...FS_CLUSTER_SYMBOLS])
  ctx.state.userData.globalSymbolMulti = { symbol, multiplier }
  ctx.services.data.addBookEvent({
    type: "globalSymbolMulti",
    data: { symbol, multiplier },
  })
}

// Builds the board event payload in cabin_fever format: each symbol is an object
// `{ name, Scatter?, multiplier? }`, with `paddingPositions` (always zeros for this game)
// and `anticipation` as a 0/1 array matching cabin_fever's reveal convention.
function addRevealEvent(ctx: Context) {
  const boardReels = ctx.services.board.getBoardReels()
  const anticipation = ctx.services.board.getAnticipation()

  const board = boardReels.map((reel, reelIndex) => {
    return reel.map((symbol, rowIndex) => {
      const symbolData: Record<string, any> = {
        name: symbol.id,
      }
      if (symbol.properties.get("isScatter")) {
        symbolData["Scatter"] = true
      }
      // Include the active board multiplier for this position when > 0
      const mult = ctx.state.userData.boardMultis?.[reelIndex]?.[rowIndex]
      if (mult !== undefined && mult > 0) {
        symbolData["multiplier"] = mult
      }
      return symbolData
    })
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

// Mirrors cabin_fever's win-level banding so client win presentation stays consistent.
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

// Collects scatter positions from the current board, matching cabin_fever's
// freeSpinTrigger / addAdditionalFreeSpins position payloads.
function getScatterPositions(ctx: Context): Array<{ reel: number; row: number }> {
  const positions: Array<{ reel: number; row: number }> = []
  const boardReels = ctx.services.board.getBoardReels()

  boardReels.forEach((reel, reelIndex) => {
    reel.forEach((symbol, rowIndex) => {
      if (symbol.properties.get("isScatter")) {
        positions.push({ reel: reelIndex, row: rowIndex })
      }
    })
  })

  return positions
}
