import { GeneratedReelSet } from "@slot-engine/core"

const SYM_WEIGHTS = {
  base: {
    S: 3,
    W: 8,
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
  freespin: {
    S: 3,
    W: 10,
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
  superfreespin: {
    S: 3,
    W: 12,
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
  // hiddenfreespin: richer wild weight than superfreespin so the Hidden bonus
  // (rarest, 5-scatter tier) feels like the biggest of the three FS tiers.
  // S kept >= freespin/superfreespin so forcing 5-of-6 scatter reels stays
  // solvable on every generated reel strip (S:1 previously starved some
  // reels of any scatter occurrence, crashing forced-scatter draws).
  hiddenfreespin: {
    S: 3,
    W: 15,
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
    W: 20,
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
  // featureSpin: identical to base except a bumped wild weight so the
  // guaranteed 2-5 wilds forced onto every spin (see onHandleGameFlow) can
  // be found and reach that count without excessive retries.
  featureSpin: {
    S: 3,
    W: 12,
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
    // forced 3/4/5-scatter bonus-trigger draws (drawBoard's forceFreespins
    // branch, which always uses this "base" reel set for the trigger spin)
    // never run out of eligible reels, regardless of random weighted luck.
    symbolQuotas: {
      S: 1,
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
  maxwin: new GeneratedReelSet({
    id: "maxwin",
    overrideExisting: false,
    symbolWeights: SYM_WEIGHTS.maxwin,
    limitSymbolsToReels: {

    },
    spaceBetweenSameSymbols: {
      S: 5,
    },
    spaceBetweenSymbols: {

    },
  }),
  // featureSpin: guarantees at least one W (and one S, for the forced
  // 3/4/5-scatter bonus trigger draws that also use this reel set) on
  // every physical reel so the guaranteed-2-to-5-wilds forcing logic in
  // onHandleGameFlow never runs out of eligible reels to pick from.
  featureSpin: new GeneratedReelSet({
    id: "featureSpin",
    overrideExisting: false,
    symbolWeights: SYM_WEIGHTS.featureSpin,
    limitSymbolsToReels: {

    },
    symbolQuotas: {
      S: 1,
      W: 1,
    },
    spaceBetweenSameSymbols: {
      S: 5,
    },
    spaceBetweenSymbols: {

    },
  }),
} as const
