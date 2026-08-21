import { GeneratedReelSet } from "@slot-engine/core"

const SYM_WEIGHTS = {
  base: {
    S: 3,
    SS: 3,
    WR: 8,
    H1: 35,
    H2: 35,
    H3: 40,
    H4: 40,
    L1: 50,
    L2: 50,
    L3: 50,
    L4: 55,
    L5: 60,
  },
  // freespin: normal-tier bonus reel, S only (never SS) — see forceScatterCombo.
  freespin: {
    S: 3,
    WR: 10,
    H1: 40,
    H2: 40,
    H3: 45,
    H4: 45,
    L1: 50,
    L2: 55,
    L3: 55,
    L4: 55,
    L5: 55,
  },
  // superfreespin: super-tier bonus reel, SS only (never S).
  superfreespin: {
    SS: 3,
    WR: 12,
    H1: 40,
    H2: 40,
    H3: 45,
    H4: 45,
    L1: 50,
    L2: 55,
    L3: 55,
    L4: 55,
    L5: 55,
  },
  // hiddenfreespin: richest tier by multiplier VALUE (see HIDDEN_MULTIPLIER_TABLE
  // in onHandleGameFlow.ts, 10x min floor) but kept at the same WR landing
  // frequency as freespin so hidden rounds don't compound too many expansions.
  // S+SS combined weight (1.5+1.5=3) matches freespin.S/superfreespin.SS's
  // single-type weight, so this tier doesn't get double the scatter density.
  hiddenfreespin: {
    S: 1.5,
    SS: 1.5,
    WR: 10,
    H1: 40,
    H2: 40,
    H3: 45,
    H4: 45,
    L1: 50,
    L2: 55,
    L3: 55,
    L4: 55,
    L5: 55,
  },
  // maxwin: start identical to hiddenfreespin for now; this dedicated strip
  // can be tuned independently later for max-win shaping.
  maxwin: {
    S: 3,
    WR: 18,
    H1: 50,
    H2: 50,
    H3: 45,
    H4: 45,
    L1: 40,
    L2: 35,
    L3: 35,
    L4: 35,
    L5: 35,
  },
  // featureSpin: identical to base except a bumped WR weight so the
  // guaranteed wild-reel forced onto every spin (see onHandleGameFlow) can
  // be found without excessive retries.
  featureSpin: {
    S: 3,
    SS: 3,
    WR: 20,
    H1: 35,
    H2: 35,
    H3: 40,
    H4: 40,
    L1: 50,
    L2: 50,
    L3: 50,
    L4: 55,
    L5: 60,
  },
} as const

export const GENERATORS = {
  base: new GeneratedReelSet({
    id: "base",
    overrideExisting: false,
    symbolWeights: SYM_WEIGHTS.base,
    limitSymbolsToReels: {

    },
    // Guarantees at least a couple of scatter stops on every reel so the
    // forced trigger draws (drawBoard's forceFreespins branch, which always
    // uses this "base" reel set for the trigger spin) never run out of
    // eligible reels for either scatter type, regardless of random weighted luck.
    symbolQuotas: {
      S: 1,
      SS: 1,
    },
    // Self-spacing keeps 2 of the same scatter off one reel strip; cross
    // spacing keeps S/SS off each other's reel, and both off WR's reel.
    spaceBetweenSameSymbols: {
      S: 4,
      SS: 4,
    },
    spaceBetweenSymbols: {
      S: { WR: 5, SS: 5 },
      SS: { WR: 5 },
    },
  }),
  // freespin: normal-tier bonus reel, only S can land (see forceScatterCombo).
  freespin: new GeneratedReelSet({
    id: "freespin",
    overrideExisting: false,
    symbolWeights: SYM_WEIGHTS.freespin,
    limitSymbolsToReels: {

    },
    spaceBetweenSameSymbols: {
      S: 4,
    },
    spaceBetweenSymbols: {
      S: { WR: 5 },
    },
  }),
  // superfreespin: super-tier bonus reel, only SS can land.
  superfreespin: new GeneratedReelSet({
    id: "superfreespin",
    overrideExisting: false,
    symbolWeights: SYM_WEIGHTS.superfreespin,
    limitSymbolsToReels: {

    },
    spaceBetweenSameSymbols: {
      SS: 4,
    },
    spaceBetweenSymbols: {
      SS: { WR: 5 },
    },
  }),
  // hiddenfreespin: both S and SS can land (see SYM_WEIGHTS.hiddenfreespin).
  hiddenfreespin: new GeneratedReelSet({
    id: "hiddenfreespin",
    overrideExisting: false,
    symbolWeights: SYM_WEIGHTS.hiddenfreespin,
    limitSymbolsToReels: {

    },
    spaceBetweenSameSymbols: {
      S: 4,
      SS: 4,
    },
    spaceBetweenSymbols: {
      S: { WR: 5, SS: 5 },
      SS: { WR: 5 },
    },
  }),
  maxwin: new GeneratedReelSet({
    id: "maxwin",
    overrideExisting: false,
    symbolWeights: SYM_WEIGHTS.maxwin,
    limitSymbolsToReels: {

    },
    spaceBetweenSameSymbols: {
      S: 4,
    },
    spaceBetweenSymbols: {
      S: { WR: 5 },
    },
  }),
  // featureSpin: guarantees at least one WR (and one of each scatter, for the
  // forced bonus trigger draws that also use this reel set) on every
  // physical reel so the guaranteed-wild-reel forcing logic in
  // onHandleGameFlow never runs out of eligible reels to pick from.
  featureSpin: new GeneratedReelSet({
    id: "featureSpin",
    overrideExisting: false,
    symbolWeights: SYM_WEIGHTS.featureSpin,
    limitSymbolsToReels: {

    },
    symbolQuotas: {
      S: 1,
      SS: 1,
      WR: 1,
    },
    spaceBetweenSameSymbols: {
      S: 4,
      SS: 4,
    },
    spaceBetweenSymbols: {
      S: { WR: 5, SS: 5 },
      SS: { WR: 5 },
    },
  }),
} as const
