import { GeneratedReelSet } from "@slot-engine/core"

const SYM_WEIGHTS = {
  base: {
    S: 5,
    W: 15,
    WR: 10,
    H1: 35,
    H2: 40,
    H3: 45,
    H4: 50,
    L1: 50,
    L2: 50,
    L3: 60,
    L4: 70,
    L5: 80,
  },
  guaranteedWildReelAndWild: {
    W: 15,
    WR: 10,
    H1: 20,
    H2: 25,
    H3: 30,
    H4: 35,
    L1: 40,
    L2: 50,
    L3: 60,
    L4: 70,
    L5: 80,
  },
  freespin: {
    W: 12,
    WR: 10,
    H1: 35,
    H2: 40,
    H3: 45,
    H4: 50,
    L1: 50,
    L2: 50,
    L3: 60,
    L4: 60,
    L5: 70,
  },
  freespin2: {
    W: 25,
    WR: 15,
    H1: 45,
    H2: 42,
    H3: 45,
    H4: 50,
    L1: 50,
    L2: 50,
    L3: 60,
    L4: 60,
    L5: 70,
  },
  freespin3: {
    W: 8,
    WR: 10,
    H1: 20,
    H2: 25,
    H3: 30,
    H4: 35,
    L1: 45,
    L2: 50,
    L3: 60,
    L4: 60,
    L5: 70,
  },
  superfreespin: {
    W: 12,
    WR: 10,
    H1: 35,
    H2: 40,
    H3: 45,
    H4: 50,
    L1: 50,
    L2: 50,
    L3: 50,
    L4: 55,
    L5: 60,
  },
  hiddenfreespin: {
    W: 15,
    WR: 10,
    H1: 35,
    H2: 40,
    H3: 45,
    H4: 50,
    L1: 50,
    L2: 50,
    L3: 50,
    L4: 55,
    L5: 60,
  },
  maxwin: {
    W: 180,
    WR: 80,
    H1: 100,
    H2: 95,
    H3: 80,
    H4: 70,
    L1: 0,
    L2: 0,
    L3: 0,
    L4: 0,
    L5: 0,
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
  guaranteedWildReelAndWild: new GeneratedReelSet({
    id: "guaranteedWildReelAndWild",
    overrideExisting: false,
    symbolWeights: SYM_WEIGHTS.guaranteedWildReelAndWild,
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
  freespin2: new GeneratedReelSet({
    id: "freespin2",
    overrideExisting: false,
    symbolWeights: SYM_WEIGHTS.freespin2,
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
  freespin3: new GeneratedReelSet({
    id: "freespin3",
    overrideExisting: false,
    symbolWeights: SYM_WEIGHTS.freespin3,
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
  maxwin: new GeneratedReelSet({
    id: "maxwin",
    overrideExisting: false,
    symbolWeights: SYM_WEIGHTS.maxwin,
    limitSymbolsToReels: {
      WR: [1, 2, 3],
    },
    spaceBetweenSameSymbols: {
      WR: 5,
    },
    spaceBetweenSymbols: {
      W: { WR: 5 },
    },
  }),
} as const
