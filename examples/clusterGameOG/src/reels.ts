import { GeneratedReelSet } from "@slot-engine/core"

const SYM_WEIGHTS = {
  // Base game reels.
  // S weight 12 → ~9 scatters per 250-row reel column, ensuring every column
  // reliably has scatter positions for the forced-scatter draw in forceFreespins.
  base: {
    S: 12,
    H1: 30,
    H2: 35,
    H3: 40,
    H4: 45,
    L1: 50,
    L2: 55,
    L3: 60,
  },
  // Bonus (free-spin) reels: slightly more premium-heavy.
  // S is intentionally omitted so scatters never appear during free spins,
  // preventing any retrigger or additional free-spin award.
  bonus: {
    H1: 35,
    H2: 40,
    H3: 45,
    H4: 50,
    L1: 50,
    L2: 55,
    L3: 60,
  },
  // Super free-spin reels (4-5 scatters): premium-leaning so the super tier
  // consistently produces bigger clusters. S omitted (no retriggers).
  superBonus: {
    H1: 45,
    H2: 45,
    H3: 48,
    H4: 50,
    L1: 50,
    L2: 55,
    L3: 60,
  },
  // Hidden free-spin reels (6 scatters): the most premium-heavy profile for the
  // top tier. S omitted (no retriggers).
  hiddenBonus: {
    H1: 55,
    H2: 50,
    H3: 50,
    H4: 50,
    L1: 48,
    L2: 50,
    L3: 55,
  },
  // Max-win reels: heavy H1 for big clusters + enough S so every reel column
  // has scatter positions for the forced-scatter placement (forceFreespins is
  // also true on the maxwin result set, so getReelStopsForSymbol must return
  // non-empty arrays for all 6 reels).
  maxwin: {
    S: 12,
    H1: 200,
    H2: 30,
    H3: 20,
    H4: 15,
    L1: 10,
    L2: 8,
    L3: 5,
  },
} as const

export const REELS = {
  base: new GeneratedReelSet({
    id: "base",
    overrideExisting: true,
    symbolWeights: SYM_WEIGHTS.base,
    spaceBetweenSameSymbols: {
      S: 5,
    },
    spaceBetweenSymbols: {},
  }),
  bonus: new GeneratedReelSet({
    id: "bonus",
    overrideExisting: true,
    symbolWeights: SYM_WEIGHTS.bonus,
    spaceBetweenSameSymbols: {},
    spaceBetweenSymbols: {},
  }),
  superBonus: new GeneratedReelSet({
    id: "superBonus",
    overrideExisting: true,
    symbolWeights: SYM_WEIGHTS.superBonus,
    spaceBetweenSameSymbols: {},
    spaceBetweenSymbols: {},
  }),
  hiddenBonus: new GeneratedReelSet({
    id: "hiddenBonus",
    overrideExisting: true,
    symbolWeights: SYM_WEIGHTS.hiddenBonus,
    spaceBetweenSameSymbols: {},
    spaceBetweenSymbols: {},
  }),
  maxwin: new GeneratedReelSet({
    id: "maxwin",
    overrideExisting: true,
    symbolWeights: SYM_WEIGHTS.maxwin,
    spaceBetweenSameSymbols: {
      S: 5,
    },
    spaceBetweenSymbols: {},
  }),
} as const
