import { GeneratedReelSet } from "@slot-engine/core"

// Shared spacing rules:
// - Same-scatter spacing 4 keeps two of the same scatter out of one visible
//   4-row board window.
// - S<->SS spacing 4 enforces "max one scatter of any type per reel".
// - WR<->W spacing 5 keeps wild reels off any reel showing a wild (covers
//   the padding rows too).
// - WR<->S/SS spacing 5 keeps wild reels off any reel showing a scatter, so
//   an expanding WR can never cover/eat a scatter symbol.
const SCATTER_SPACING = {
  S: 4,
  SS: 4,
} as const

const WILD_SPACING = {
  S: { SS: 4 },
  WR: { W: 5, S: 5, SS: 5 },
} as const

const SYM_WEIGHTS = {
  base: {
    S: 3,
    SS: 3,
    WR: 2,
    W: 5,
    H1: 30,
    H2: 32,
    H3: 34,
    H4: 36,
    H5: 38,
    L1: 45,
    L2: 48,
    L3: 50,
    L4: 52,
    L5: 55,
  },
  // Normal bonus reels: both scatters stay live (S = +1 spin, SS = +2 spins)
  // but are made very rare so retriggers stay uncommon.
  freespin: {
    S: 0.2,
    SS: 0.1,
    WR: 3,
    W: 6,
    H1: 30,
    H2: 32,
    H3: 34,
    H4: 36,
    H5: 38,
    L1: 45,
    L2: 48,
    L3: 50,
    L4: 52,
    L5: 55,
  },
  superfreespin: {
    S: 0.2,
    SS: 0.1,
    WR: 4,
    W: 7,
    H1: 30,
    H2: 32,
    H3: 34,
    H4: 36,
    H5: 38,
    L1: 45,
    L2: 48,
    L3: 50,
    L4: 52,
    L5: 55,
  },
  // Hidden bonus reels.
  hiddenfreespin: {
    S: 0.2,
    SS: 0.1,
    WR: 4,
    W: 5,
    H1: 30,
    H2: 32,
    H3: 34,
    H4: 36,
    H5: 38,
    L1: 45,
    L2: 48,
    L3: 50,
    L4: 52,
    L5: 55,
  },
  // featureSpin: no scatters at all (this mode never triggers a bonus).
  // Every spin forces >=1 WR and >=3 wilds via drawBoard, so WR/wild
  // weights are boosted for feasibility.
  featureSpin: {
    WR: 6,
    W: 8,
    H1: 28,
    H2: 30,
    H3: 32,
    H4: 34,
    H5: 36,
    L1: 40,
    L2: 42,
    L3: 44,
    L4: 46,
    L5: 48,
  },
  // featureSpin's forced-maxwin reel: no scatters, heavily boosted WR/W
  // density so a single spin can plausibly reach the 25000x cap.
  featureSpinMaxwin: {
    WR: 14,
    W: 20,
    H1: 15,
    H2: 16,
    H3: 17,
    H4: 18,
    H5: 19,
    L1: 22,
    L2: 23,
    L3: 24,
    L4: 25,
    L5: 26,
  },
} as const

export const GENERATORS = {
  base: new GeneratedReelSet({
    id: "base",
    overrideExisting: false,
    symbolWeights: SYM_WEIGHTS.base,
    // Guarantees every reel holds at least one S and one SS so the forced
    // bonus-trigger draws never run out of eligible reels.
    symbolQuotas: {
      S: 1,
      SS: 1,
    },
    spaceBetweenSameSymbols: SCATTER_SPACING,
    spaceBetweenSymbols: WILD_SPACING,
  }),
  freespin: new GeneratedReelSet({
    id: "freespin",
    overrideExisting: false,
    symbolWeights: SYM_WEIGHTS.freespin,
    spaceBetweenSameSymbols: SCATTER_SPACING,
    spaceBetweenSymbols: WILD_SPACING,
  }),
  superfreespin: new GeneratedReelSet({
    id: "superfreespin",
    overrideExisting: false,
    symbolWeights: SYM_WEIGHTS.superfreespin,
    // WR quota guarantees every reel has a WR stop for the guaranteed
    // wild reel on the first free spin of the super bonus.
    symbolQuotas: {
      WR: 1,
    },
    spaceBetweenSameSymbols: SCATTER_SPACING,
    spaceBetweenSymbols: WILD_SPACING,
  }),
  hiddenfreespin: new GeneratedReelSet({
    id: "hiddenfreespin",
    overrideExisting: false,
    symbolWeights: SYM_WEIGHTS.hiddenfreespin,
    symbolQuotas: {
      WR: 1,
    },
    spaceBetweenSameSymbols: SCATTER_SPACING,
    spaceBetweenSymbols: WILD_SPACING,
  }),
  featureSpin: new GeneratedReelSet({
    id: "featureSpin",
    overrideExisting: false,
    symbolWeights: SYM_WEIGHTS.featureSpin,
    // Quotas guarantee every reel has WR and W available so the guaranteed
    // >=1 WR / >=3 mushroom forcing always has stops to pick.
    symbolQuotas: {
      WR: 1,
      W: 1,
    },
    spaceBetweenSymbols: WILD_SPACING,
  }),
  // No WR<->wild spacing restriction here - the forced maxwin draw needs
  // both to coexist freely across the board to build a large multiplier.
  featureSpinMaxwin: new GeneratedReelSet({
    id: "featureSpinMaxwin",
    overrideExisting: false,
    symbolWeights: SYM_WEIGHTS.featureSpinMaxwin,
    symbolQuotas: {
      WR: 1,
      W: 1,
    },
  }),
} as const
