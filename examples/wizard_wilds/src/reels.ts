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
    S: 2,
    W: 8,
    H1: 35,
    H2: 40,
    H3: 50,
    H4: 50,
    L1: 50,
    L2: 55,
    L3: 60,
    L4: 65,
    L5: 70,
  },
  superfreespin: {
    S: 2,
    W: 8,
    H1: 35,
    H2: 40,
    H3: 50,
    H4: 50,
    L1: 50,
    L2: 55,
    L3: 60,
    L4: 65,
    L5: 70,
  },
  // hiddenfreespin: slightly richer wild weight to help guarantee at least one
  // dispenser lands on the first spin of the hidden bonus.
  hiddenfreespin: {
    S: 2,
    W: 10,
    H1: 35,
    H2: 40,
    H3: 50,
    H4: 50,
    L1: 50,
    L2: 55,
    L3: 60,
    L4: 65,
    L5: 70,
  },
  // guaranteedTwoWilds: similar to base but with ~2x wild weight for more
  // variety on base game spins. Slightly trimmed low-pays to compensate.
  guaranteedTwoWilds: {
    S: 5,
    W: 15,
    H1: 30,
    H2: 35,
    H3: 40,
    H4: 45,
    L1: 50,
    L2: 55,
    L3: 60,
    L4: 58,
    L5: 58,
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
  }),
  hiddenfreespin: new GeneratedReelSet({
    id: "hiddenfreespin",
    overrideExisting: false,
    symbolWeights: SYM_WEIGHTS.hiddenfreespin,
    limitSymbolsToReels: {

    },
    spaceBetweenSameSymbols: {
      S: 5,
    },
    spaceBetweenSymbols: {

    },
  }),
  // guaranteedTwoWilds: higher wild weight so the forced-2-wilds logic finds
  // valid stops quickly on every reel. spaceBetweenSameSymbols keeps wilds
  // spread across positions to avoid clustering.
  guaranteedTwoWilds: new GeneratedReelSet({
    id: "guaranteedTwoWilds",
    overrideExisting: false,
    symbolWeights: SYM_WEIGHTS.guaranteedTwoWilds,
    limitSymbolsToReels: {

    },
    spaceBetweenSameSymbols: {
      S: 5,
      W: 1,
    },
    spaceBetweenSymbols: {
      
    },
  })
} as const
