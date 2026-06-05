import {
  ClusterWinType,
  GameContext,
  SPIN_TYPE,
} from "@slot-engine/core"
import { GameModesType, SymbolsType, UserStateType } from ".."

type Context = GameContext<GameModesType, SymbolsType, UserStateType>

/**
 * Instant-pay pool for Wild symbols.
 * A random value is drawn uniformly from this array each time a Wild lands.
 * The value is a multiplier of the bet paid directly before the Wild tumbles out.
 */
const WILD_PAY_POOL = [
  5, 10, 15, 20, 25, 50, 75, 100, 150, 200, 250,
  300, 350, 400, 450, 500, 600, 700, 800, 900, 1000,
] as const

function roundToDecimal(value: number, decimals: number = 1): number {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
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

  // Build the initial board
  drawBoard(ctx)

  // Set anticipation states based on scatters on board
  handleAnticipation(ctx)

  // Assign instant-pay values to any Wild symbols on the initial board so the
  // reveal event can display them before they are paid out.
  assignWildValues(ctx)

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
        amount: Math.min(ctx.services.wallet.getCurrentWin(), ctx.config.maxWinX),
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

// Returns the total payout accumulated across all tumbles for this spin.
function handleTumbles(ctx: Context): number {
  const cluster = new ClusterWinType({
    ctx,
  })

  let spinTotal = 0

  // Keep tumbling until no more wins
  while (true) {
    // ── Phase 1: process any Wild symbols present on the board ──────────────
    // Wilds are detected BEFORE cluster evaluation so they pay and tumble out
    // first. Any Wilds that drop in as replacements will be caught on the next
    // iteration of this loop.
    const boardReels = ctx.services.board.getBoardReels()
    const wildsOnBoard: Array<{ reel: number; row: number }> = []

    boardReels.forEach((reel, reelIdx) => {
      reel.forEach((symbol, rowIdx) => {
        if (symbol.id === "W") {
          wildsOnBoard.push({ reel: reelIdx, row: rowIdx })
        }
      })
    })

    if (wildsOnBoard.length > 0) {
      // Assign a pool value to every Wild that doesn't yet have one (i.e. it
      // tumbled in during a previous iteration and wasn't present at reveal).
      assignWildValues(ctx)

      // Collect the value entries for the Wilds currently on the board.
      const currentWildWins = ctx.state.userData.wildValues.filter((v) =>
        wildsOnBoard.some((w) => w.reel === v.reel && w.row === v.row),
      )

      // Apply board-position multiplier and global FS multiplier to each Wild,
      // mirroring the same mechanic used for cluster wins.
      const wildWinDetails = currentWildWins.map((w) => {
        const rawMult = ctx.state.userData.boardMultis[w.reel]?.[w.row] ?? 0
        const boardMult = rawMult >= 2 ? rawMult : 1
        const win = roundToDecimal(w.value * boardMult * ctx.state.userData.fsGlobalMulti)
        return { reel: w.reel, row: w.row, baseValue: w.value, boardMult, globalMult: ctx.state.userData.fsGlobalMulti, win }
      })

      const wildTotal = roundToDecimal(
        wildWinDetails.reduce((sum, w) => roundToDecimal(sum + w.win), 0),
      )

      spinTotal = roundToDecimal(spinTotal + wildTotal)

      ctx.services.wallet.addTumbleWin(wildTotal)

      ctx.services.data.addBookEvent({
        type: "wildPayout",
        data: {
          wilds: wildWinDetails,
          total: wildTotal,
        },
      })

      // Clear the paid Wild entries from userData.
      ctx.state.userData.wildValues = ctx.state.userData.wildValues.filter(
        (v) => !currentWildWins.some((w) => w.reel === v.reel && w.row === v.row),
      )

      // Tumble Wilds out so new symbols drop in.
      const symbolsToDelete = currentWildWins.map((w) => ({
        reelIdx: w.reel,
        rowIdx: w.row,
      }))
      const { newBoardSymbols } = ctx.services.board.tumbleBoard(symbolsToDelete)

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
        },
      })

      // Reached max win — stop early.
      if (wildTotal >= ctx.config.maxWinX) {
        ctx.state.triggeredMaxWin = true
        break
      }

      // Restart the loop: check for more Wilds or clusters on the updated board.
      continue
    }

    // ── Phase 2: evaluate cluster wins on the Wild-free board ───────────────
    const { payout: rawPayout, winCombinations } = cluster
      .evaluateWins(ctx.services.board.getBoardReels())
      .getWins()

    if (rawPayout === 0) break

    // For each cluster win, compute:
    //   boardMult  = sum of all active board-position multipliers (>=2) on the
    //                cluster's symbols; falls back to 1x when none are active.
    //   win        = basePayout × boardMult × fsGlobalMulti
    //   winWithoutMult = basePayout (base cluster value, no multipliers)
    // This mirrors cabin_fever's per-line win breakdown exactly.
    let totalPayout = 0
    const wins = winCombinations.map((wc) => {
      const clusterMultiplier = wc.symbols.reduce((sum, s) => {
        const mult = ctx.state.userData.boardMultis[s.reelIndex]![s.posIndex]!
        return mult >= 2 ? sum + mult : sum
      }, 0)
      const boardMult = Math.max(1, clusterMultiplier)
      const winAmount = roundToDecimal(wc.payout * boardMult * ctx.state.userData.fsGlobalMulti)
      totalPayout = roundToDecimal(totalPayout + winAmount)
      return {
        symbol: wc.baseSymbol.id,
        kind: wc.kind,
        win: winAmount,
        positions: wc.symbols.map((s) => ({ reel: s.reelIndex, row: s.posIndex })),
        meta: {
          multiplier: boardMult,
          winWithoutMult: roundToDecimal(wc.payout),
          globalMult: ctx.state.userData.fsGlobalMulti,
        },
      }
    })

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

    ctx.services.data.addBookEvent({
      type: "setWin",
      data: {
        amount: totalPayout,
        winLevel: calculateWinLevel(totalPayout),
      },
    })

    // Update board-position multipliers after wins are paid:
    //   0 (unvisited) → 2 (active: contributes 2x on next tumble win)
    //   2 → 4 → 8 → … up to the tier's multiCap.
    // Skipping the intermediate 1 state means multipliers apply from the
    // second win on a position, matching the intended Sugar Rush mechanic.
    const multiCap = getTierConfig(ctx.state.userData.fsTier).multiCap
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
    const { newBoardSymbols } =
      ctx.services.board.tumbleBoard(winSymbols)

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
      },
    })

    // Reached max win, stop win calculation
    if (totalPayout >= ctx.config.maxWinX) {
      ctx.state.triggeredMaxWin = true
      break
    }
  }

  return spinTotal
}

function checkFreespins(ctx: Context) {
  // No retriggers — scatters during free spins are ignored entirely.
  if (ctx.state.currentSpinType == SPIN_TYPE.FREE_SPINS) return

  const scatter = ctx.config.symbols.get("S")!
  const [scatCount] = ctx.services.board.countSymbolsOnBoard(scatter)

  // Require at least 3 scatters to trigger free spins
  if (scatCount < 3) return

  // Roll a d6 per scatter to determine free spin count.
  // 3 scatters: 3–18 spins | 4: 4–24 | 5: 5–30 | 6: 6–36
  const { rolls, total: freespinsAwarded } = rollFreespinDice(ctx, scatCount)

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
      type: "freeSpinTrigger",
      data: {
        totalFs: freespinsAwarded,
        rolls,
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

    // For hidden free spins: pre-populate every board position with a random
    // starting multiplier so wins are amplified from the very first tumble.
    if (tier === "hidden") {
      initHiddenBoardMultis(ctx)
    }

    playFreeSpins(ctx)
  }
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

    drawBoard(ctx)
    handleAnticipation(ctx)

    // Assign instant-pay values to any Wilds on the newly drawn board.
    assignWildValues(ctx)

    addRevealEvent(ctx)

    const fsSpinWin = handleTumbles(ctx)

    // Add event before calling `confirmSpinWin()`, because the spin win will be reset.
    if (fsSpinWin > 0) {
      ctx.services.data.addBookEvent({
        type: "setTotalWin",
        data: {
          amount: Math.min(ctx.services.wallet.getCurrentSpinWin(), ctx.config.maxWinX),
        },
      })
    }

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
        type: "updateGlobalMulti",
        data: {
          globalMulti: ctx.state.userData.fsGlobalMulti,
        },
      })
    }

    checkFreespins(ctx)
  }

  // All FS have been played at this point so we can send the total win amount using `getCurrentWin()`.
  const fsTotalWin = Math.min(ctx.services.wallet.getCurrentWin(), ctx.config.maxWinX)

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
  // to 128x, no feature-wide global multiplier.
  normal: { startMulti: 1, ramp: 0, multiCap: 128 },
  // Super free spins (4-5 scatters): higher multiplier ceiling and a global
  // multiplier that starts at 2x and grows by 1x every free spin.
  super: { startMulti: 2, ramp: 1, multiCap: 256 },
  // Hidden free spins (6 scatters): the most valuable tier. Every board position
  // starts with a random multiplier (2, 4, or 8) already active. Global multiplier
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

// Rolls a d6 for each scatter that landed and sums the results to determine
// the total number of free spins awarded (min = scatCount, max = scatCount × 6).
function rollFreespinDice(ctx: Context, scatCount: number): { rolls: number[]; total: number } {
  const dice = [1, 2, 3, 4, 5, 6] as const
  const rolls: number[] = []
  for (let i = 0; i < scatCount; i++) {
    rolls.push(ctx.services.rng.randomItem([...dice]))
  }
  return { rolls, total: rolls.reduce((sum, r) => sum + r, 0) }
}

// For hidden free spins: pre-populates every board position with a random
// starting multiplier (2, 4, or 8) so wins are amplified from the very first
// tumble of the very first free spin.
function initHiddenBoardMultis(ctx: Context) {
  const pool = [2, 4, 8] as const
  ctx.state.userData.boardMultis = ctx.state.userData.boardMultis.map((reel) =>
    reel.map(() => ctx.services.rng.randomItem([...pool])),
  )
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
  // Wild position values are paid and cleared during tumbling, but reset here
  // as a safety net for the start of each simulation run.
  ctx.state.userData.wildValues = []
}

// Assigns a random instant-pay value (drawn from WILD_PAY_POOL) to every Wild
// symbol currently on the board that does not yet have a value recorded in
// userData.wildValues.  Call this BEFORE addRevealEvent so the reveal payload
// can include the Wild's value, and again at the start of each tumble iteration
// so that newly dropped-in Wilds are covered.
function assignWildValues(ctx: Context) {
  const boardReels = ctx.services.board.getBoardReels()
  boardReels.forEach((reel, reelIdx) => {
    reel.forEach((symbol, rowIdx) => {
      if (symbol.id !== "W") return
      const alreadyAssigned = ctx.state.userData.wildValues.some(
        (v) => v.reel === reelIdx && v.row === rowIdx,
      )
      if (!alreadyAssigned) {
        const value = ctx.services.rng.randomItem([...WILD_PAY_POOL])
        ctx.state.userData.wildValues.push({ reel: reelIdx, row: rowIdx, value })
      }
    })
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
      // Include the instant-pay value for Wild symbols
      const wildEntry = ctx.state.userData.wildValues.find(
        (w) => w.reel === reelIndex && w.row === rowIndex,
      )
      if (wildEntry) {
        symbolData["wildValue"] = wildEntry.value
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

  if (multiplier === 15000) return 6
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
