import { GeneratedReelSet } from "@slot-engine/core"

const SYM_WEIGHTS = {
  base: {
    S: 8,
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
  freespin: {
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
  superfreespin: {
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
  hiddenfreespin: {
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
      S: 5
    },
    spaceBetweenSymbols: {
      W: { WR: 5},
      S: { WR: 5, W: 5},
    },
  }),
  freespin: new GeneratedReelSet({
    id: "freespin",
    overrideExisting: false,
    symbolWeights: SYM_WEIGHTS.freespin,
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
  superfreespin: new GeneratedReelSet({
    id: "superfreespin",
    overrideExisting: false,
    symbolWeights: SYM_WEIGHTS.superfreespin,
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
  hiddenfreespin: new GeneratedReelSet({
    id: "hiddenfreespin",
    overrideExisting: false,
    symbolWeights: SYM_WEIGHTS.hiddenfreespin,
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
