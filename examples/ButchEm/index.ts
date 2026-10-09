import { availableParallelism } from "node:os"
import {
  GameMode,
  GameSymbol,
  SPIN_TYPE,
  createSlotGame,
  defineGameModes,
  defineSymbols,
  defineUserState,
  InferGameType,
} from "@slot-engine/core"
import { DESIGN, MODES, SIM_RUNS } from "./src/settings"
import { optimizationTargets } from "./src/math"
import { PAYTABLE } from "./src/paytable"
import { createReelSets, BoardProfile } from "./src/reels"
import { createResultSets } from "./src/resultSets"
import { onHandleGameFlow } from "./src/onHandleGameFlow"
import {
  FREE_SPINS,
  HEIGHT,
  MAX_WIN,
  ModeName,
  PAYING_SYMBOLS,
  SymbolId,
  WIDTH,
} from "./src/types"

export const userState = defineUserState({
  bonusPayout: 0,
  profile: "standard" as BoardProfile,
})
export const symbols = defineSymbols<Record<SymbolId, GameSymbol>>({
  ...Object.fromEntries(
    PAYING_SYMBOLS.map((id) => [id, new GameSymbol({ id, pays: PAYTABLE[id] })]),
  ),
  W: new GameSymbol({ id: "W", properties: { isWild: true } }),
  S: new GameSymbol({ id: "S", properties: { isScatter: true } }),
} as Record<SymbolId, GameSymbol>)

export const gameModes = defineGameModes(
  Object.fromEntries(
    Object.entries(MODES).map(([key, settings]) => {
      const mode = key as ModeName
      return [
        mode,
        new GameMode({
          name: mode,
          cost: settings.cost,
          rtp: DESIGN.rtp,
          reelsAmount: WIDTH,
          symbolsPerReel: Array(WIDTH).fill(HEIGHT),
          isBonusBuy: !!settings.boughtTier,
          reelSets: createReelSets(),
          resultSets: createResultSets(mode),
        }),
      ]
    }),
  ) as Record<ModeName, GameMode>,
)
export type GameType = InferGameType<typeof gameModes, typeof symbols, typeof userState>

export const game = createSlotGame<GameType>({
  id: "butch-em",
  name: "ButchEm",
  maxWinX: MAX_WIN,
  padSymbols: 0,
  gameModes,
  symbols,
  userState,
  hooks: { onHandleGameFlow },
  scatterToFreespins: {
    [SPIN_TYPE.BASE_GAME]: { 3: FREE_SPINS, 4: FREE_SPINS, 5: FREE_SPINS },
    [SPIN_TYPE.FREE_SPINS]: {},
  },
  rootDir: __dirname,
})

const modes = Object.keys(MODES) as ModeName[]
const simRunEnvironmentVariables = {
  base: "BUTCH_SIM_RUNS_BASE",
  extraChance: "BUTCH_SIM_RUNS_EXTRA_CHANCE",
  extraChance2: "BUTCH_SIM_RUNS_EXTRA_CHANCE_2",
  featureSpin: "BUTCH_SIM_RUNS_FEATURE_SPIN",
  bonusFeature: "BUTCH_SIM_RUNS_BONUS_FEATURE",
  superBonusFeature: "BUTCH_SIM_RUNS_SUPER_BONUS_FEATURE",
  hiddenBonusFeature: "BUTCH_SIM_RUNS_HIDDEN_BONUS_FEATURE",
} satisfies Record<ModeName, string>
const simRunsAmount = Object.fromEntries(
  modes.map((mode) => {
    const environmentVariable = simRunEnvironmentVariables[mode]
    const value = Number(
      process.env[environmentVariable] ?? process.env.BUTCH_SIM_RUNS ?? SIM_RUNS[mode],
    )
    if (!Number.isSafeInteger(value) || value < 100)
      throw new Error(
        `${environmentVariable}, BUTCH_SIM_RUNS, or SIM_RUNS.${mode} must be an integer of at least 100`,
      )
    return [mode, value]
  }),
) as Record<ModeName, number>

const concurrency = Number(
  process.env.BUTCH_SIM_CONCURRENCY ?? Math.max(2, Math.min(24, availableParallelism())),
)
if (!Number.isSafeInteger(concurrency) || concurrency < 2)
  throw new Error("BUTCH_SIM_CONCURRENCY must be an integer of at least 2")

game.configureSimulation({
  simRunsAmount,
  concurrency,
  makeUncompressedBooks: true,
})
game.configureOptimization(
  Object.fromEntries(modes.map((mode) => [mode, { targets: optimizationTargets(mode) }])),
)

const task = process.argv.includes("--simulate-only")
  ? "simulate"
  : process.argv.includes("--optimize-only")
    ? "optimize"
    : process.argv.includes("--analyze-only")
      ? "analyze"
      : "build"
// Slot Engine's --slot-engine-run guard keeps panel imports side-effect free.
void game
  .runTasks({
    analysisOpts: {
      gameModes: modes,
      tagStats: [
        { groupBy: ["symbolId", "kind", "spinType"] },
        { groupBy: ["criteria"] },
        { groupBy: ["bonusTier"] },
      ],
    },
    doSimulation: task === "build" || task === "simulate",
    doOptimization: task === "build" || task === "optimize",
    doAnalysis: task === "build" || task === "optimize" || task === "analyze",
  })
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
