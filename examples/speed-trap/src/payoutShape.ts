import { OptimizationTarget } from "@slot-engine/optimizer"
import { DESIGN, MODES } from "./settings"
import { MAX_WIN, ModeName } from "./types"

export const PAYOUT_BAND_CUTS = [
  0.01,
  1,
  2,
  5,
  10,
  20,
  50,
  100,
  200,
  500,
  1000,
  2000,
  5000,
  MAX_WIN,
]

// Equal-weight averages of ButchEm and PandaFeasting's published band probabilities
// and conditional means. Zero-probability bands are absent from bought modes.
export const REFERENCE_PAYOUT_SHAPES: Record<
  ModeName,
  Array<[probability: number, average: number]>
> = {
  base: [
    [0.09, 0.35],
    [0.0644673333373, 1.35],
    [0.0275020114556, 2.8],
    [0.00696168096096, 6],
    [0.00444468329846, 13.356625557],
    [0.00325532757205, 28.5764599246],
    [0.00146074718788, 72.09127131],
    [0.00106350714297, 127.54313262],
    [0.000746628078904, 281.119656123],
    [0.0000649181777153, 749.994999727],
    [0.0000258303739773, 1518.10621294],
    [0.000005754999663, 3402.68899812],
    [0.0000013274215762, 7138.39347536],
  ],
  extraChance: [
    [0.095, 0.430263157884],
    [0.065, 1.37307692308],
    [0.0480348760968, 3.5],
    [0.0124447803038, 7.5],
    [0.00412639380456, 16.0944303941],
    [0.0062559657369, 28.5906223776],
    [0.00201770352806, 76.2594764024],
    [0.00111309102506, 147.082243184],
    [0.000823666700495, 320.827525735],
    [0.000120506504739, 749.995000116],
    [0.0000497925182293, 1503.99093387],
    [0.0000104607696339, 3392.92906368],
    [0.00000245051553047, 7108.24267929],
  ],
  extraChance2: [
    [0.057, 0.451754385951],
    [0.04625, 1.5],
    [0.0898543180791, 3.19031148725],
    [0.0207897295003, 7],
    [0.00824752227404, 16.6214639838],
    [0.0106721213191, 29.8124099272],
    [0.00474781169597, 76.6545564645],
    [0.00261404957669, 147.897286954],
    [0.00188065457731, 327.599501069],
    [0.000290260657115, 749.995000098],
    [0.000122321110025, 1497.20125034],
    [0.0000249569798451, 3387.80274035],
    [0.00000589709903081, 7093.01724958],
  ],
  featureSpin: [
    [0.006, 0.495833333357],
    [0.018, 1.5],
    [0.15, 3.5],
    [0.185, 7],
    [0.118328045736, 13.834707784],
    [0.111671954264, 31.5474560091],
    [0.056, 70],
    [0.0460873642717, 141.023517739],
    [0.0327926357284, 324.034828687],
    [0.0165, 700],
    [0.0036, 1400],
    [0.00088, 2781.81818175],
    [0.000123333333352, 6000],
  ],
  bonusFeature: [
    [0, 0],
    [0.001, 1.495],
    [0.08, 3.495],
    [0.12, 7.495],
    [0.17, 14.995],
    [0.222704990499, 34.45046729],
    [0.17, 74.995],
    [0.135, 149.995],
    [0.08, 349.995],
    [0.017, 749.995],
    [0.003, 1499.995],
    [0.0009, 3499.995],
    [0.0003, 7499.995],
  ],
  superBonusFeature: [
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0.065, 14.995],
    [0.11, 34.995],
    [0.18, 74.995],
    [0.296721721722, 123.502020697],
    [0.24, 312.495],
    [0.065, 749.995],
    [0.028, 1499.995],
    [0.012, 3499.995],
    [0.003, 7499.995],
  ],
  hiddenBonusFeature: [
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0.13, 74.995],
    [0.22, 149.995],
    [0.233085427136, 324.379358615],
    [0.17, 749.995],
    [0.13, 1499.995],
    [0.09, 3499.995],
    [0.026, 7499.995],
  ],
}

export interface PayoutBand {
  name: string
  probability: number
  average: number
  range: [number, number]
}

export function payoutBands(mode: ModeName, maxProbability: number): PayoutBand[] {
  const settings = MODES[mode]
  const reference = REFERENCE_PAYOUT_SHAPES[mode]
  const referenceMass = reference.reduce((sum, [probability]) => sum + probability, 0)
  const massScale = (settings.hitRate - maxProbability) / referenceMass
  const bands: PayoutBand[] = reference.flatMap(([probability, average], index) =>
    probability === 0
      ? []
      : [
          {
            name: `payout_${PAYOUT_BAND_CUTS[index]}_${PAYOUT_BAND_CUTS[index + 1]}`,
            probability: probability * massScale,
            average,
            range: [PAYOUT_BAND_CUTS[index], PAYOUT_BAND_CUTS[index + 1] - 0.01] as [
              number,
              number,
            ],
          },
        ],
  )
  const expected = DESIGN.rtp * settings.cost - maxProbability * MAX_WIN
  // Scale reference means together, keeping them inside each payout band.
  // This accommodates Speed Trap's slightly different configured nonzero hit rates.
  const mean = (band: PayoutBand, scale: number) =>
    Math.max(band.range[0] + 0.01, Math.min(band.range[1] - 0.01, band.average * scale))
  const payout = (scale: number) =>
    bands.reduce((sum, band) => sum + band.probability * mean(band, scale), 0)
  if (!(payout(0) < expected && expected < payout(1e6)))
    throw new Error(`${mode}: reference payout shape cannot fund the configured RTP`)
  let low = 0
  let high = 1e6
  for (let iteration = 0; iteration < 100; iteration++) {
    const middle = (low + high) / 2
    if (payout(middle) < expected) low = middle
    else high = middle
  }
  for (const band of bands) band.average = mean(band, (low + high) / 2)
  return [
    ...(settings.hitRate < 1
      ? [
          {
            name: "loss",
            probability: 1 - settings.hitRate,
            average: 0,
            range: [0, 0] as [number, number],
          },
        ]
      : []),
    ...bands,
    {
      name: "max",
      probability: maxProbability,
      average: MAX_WIN,
      range: [MAX_WIN, MAX_WIN],
    },
  ]
}

export function payoutShapeTargets(
  bands: PayoutBand[],
): Record<string, OptimizationTarget> {
  return Object.fromEntries(
    bands.map((band) => [
      band.name,
      {
        match: { winRange: band.range },
        hitRate: 1 / band.probability,
        avgWin: band.average,
      },
    ]),
  )
}
