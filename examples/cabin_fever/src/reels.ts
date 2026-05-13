import { GeneratedReelSet } from "@slot-engine/core"

const SYM_WEIGHTS = {
  base: {
    S: 5,
    W: 7,
    H1: 30,
    H2: 35,
    H3: 40,
    H4: 45,
    L1: 50,
    L2: 55,
    L3: 60,
    L4: 65,
    L5: 70,
  },
  freespin: {
    S: 4,
    W: 7,
    H1: 30,
    H2: 35,
    H3: 40,
    H4: 45,
    L1: 50,
    L2: 55,
    L3: 60,
    L4: 65,
    L5: 70,
  },
  superfreespin: {
    S: 4,
    W: 7,
    H1: 30,
    H2: 35,
    H3: 40,
    H4: 45,
    L1: 50,
    L2: 55,
    L3: 60,
    L4: 65,
    L5: 70,
  }
} as const

export const GENERATORS = {
  base: new GeneratedReelSet({
    id: "base",
    overrideExisting: false,
    symbolWeights: SYM_WEIGHTS.base,
    limitSymbolsToReels: {

    },
    spaceBetweenSameSymbols: {
      S: 5
    },
    spaceBetweenSymbols: {

    },
  }),
  freespin: new GeneratedReelSet({
    id: "freespin",
    overrideExisting: false,
    symbolWeights: SYM_WEIGHTS.freespin,
    limitSymbolsToReels: {

    },
    spaceBetweenSameSymbols: {
      S: 5,
    },
    spaceBetweenSymbols: {

    },
  }),
  superfreespin: new GeneratedReelSet({
    id: "superfreespin",
    overrideExisting: false,
    symbolWeights: SYM_WEIGHTS.superfreespin,
    limitSymbolsToReels: {

    },
    spaceBetweenSameSymbols: {
      S: 5,
    },
    spaceBetweenSymbols: {

    },
  })
} as const
