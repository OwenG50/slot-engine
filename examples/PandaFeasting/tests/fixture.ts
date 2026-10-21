import { RandomNumberGenerator } from "@slot-engine/core"
import { game } from ".."
import { Context, onHandleGameFlow } from "../src/onHandleGameFlow"
import { Board, BonusTier, GameEvent, ModeName, SymbolId } from "../src/types"
import { MODES } from "../src/settings"

export const fullBoard = (symbol: SymbolId = "H1"): Board =>
  Array.from({ length: 5 }, () => Array(3).fill(symbol))
export const losingBoard = (): Board =>
  ["H1", "H2", "H3", "H4", "H5"].map((symbol) => Array(3).fill(symbol))

export function fixture(
  mode: ModeName,
  source: () => Board = fullBoard,
  tier: BonusTier | undefined = MODES[mode].boughtTier,
  seed = 4,
) {
  const config = game.getConfig()
  const events: GameEvent[] = []
  const rng = new RandomNumberGenerator()
  rng.setSeed(seed)
  let board = fullBoard().map((r) => r.map((id) => config.symbols.get(id)!))
  let spinWin = 0,
    totalWin = 0
  const state = {
    currentGameMode: mode,
    currentSpinType: "basegame",
    currentResultSet: { userData: { tier } },
    userData: { bonusPayout: 0 },
    currentFreespinAmount: 0,
    totalFreespinAmount: 0,
    triggeredMaxWin: false,
    triggeredFreespins: false,
  }
  const draw = () => {
    board = source().map((r) => r.map((id) => config.symbols.get(id)!))
  }
  const ctx = {
    config,
    state,
    services: {
      rng,
      board: {
        getRandomReelset: () => [],
        drawBoardWithRandomStops: draw,
        getReelStopsForSymbol: () => Array.from({ length: 5 }, () => [0]),
        getRandomReelStops(_reels: unknown, _stops: number[][], amount: number) {
          return Object.fromEntries(
            Array.from({ length: amount }, (_, reel) => [reel, 0]),
          )
        },
        drawBoardWithForcedStops({
          forcedStops,
        }: {
          forcedStops: Record<number, number>
        }) {
          draw()
          for (const reel of Object.keys(forcedStops))
            board[Number(reel)][0] = config.symbols.get("S")!
        },
        getBoardReels: () => board,
        setSymbol(x: number, y: number, symbol: (typeof board)[number][number]) {
          board[x][y] = symbol
        },
      },
      wallet: {
        addSpinWin(amount: number) {
          spinWin += amount
        },
        confirmSpinWin() {
          totalWin += spinWin
          spinWin = 0
        },
        getCurrentWin: () => totalWin,
      },
      game: {
        getCurrentGameMode: () => config.gameModes[mode],
        awardFreespins(amount: number) {
          state.currentFreespinAmount += amount
          state.totalFreespinAmount += amount
          state.triggeredFreespins = true
        },
      },
      data: {
        addBookEvent(event: GameEvent) {
          events.push(structuredClone(event))
        },
        tag() {},
        tagSymbolOccurrence() {},
      },
    },
  } as unknown as Context
  return {
    ctx,
    events,
    run() {
      onHandleGameFlow(ctx)
      return { ctx, events }
    },
  }
}
