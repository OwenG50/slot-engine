import { GeneratedReelSet } from "@slot-engine/core"

const SYM_WEIGHTS = {
  base: {
    W: 10,
    WR: 5,
    H1: 15,
    H2: 20,
    H3: 25,
    H4: 30,
    L1: 40,
    L2: 50,
    L3: 60,
    L4: 70,
    L5: 80,
  },
} as const

export const GENERATORS = {
  base: new GeneratedReelSet({
    id: "base",
    overrideExisting: false,
    symbolWeights: SYM_WEIGHTS.base,
    limitSymbolsToReels: {
      WR: [1, 2, 3],
    },
    spaceBetweenSameSymbols: {
      WR: 5,
    },
    spaceBetweenSymbols: {
      W: { WR: 5},
    },
  }),
} as const
