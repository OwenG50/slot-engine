import { fitBonusHitRate, BonusBand, BonusSample } from "./bonusSpinWeights"

export interface FullScreenBand extends Omit<BonusBand, "samples"> {
  samples: (BonusSample & { fullScreens: number[] })[]
}

/** Adjust only full-screen book priors toward per-multiplier event masses; every
 * fit keeps exact payout-band constraints. Targets a band cannot fund are
 * approached as far as possible and reported as not achieved. */
export function fitFullScreenStages(
  bands: FullScreenBand[],
  targets: ReadonlyMap<number, number>,
  hitTarget?: number,
) {
  // An optional hits/spins target is held jointly; unsupported targets use the
  // nearest feasible rate.
  const solve = (fitBands: FullScreenBand[]) =>
    fitBonusHitRate(fitBands, hitTarget, { unsupportedTarget: "nearest" })
  const multipliers = [
    ...new Set(
      bands.flatMap((band) => band.samples.flatMap((sample) => sample.fullScreens)),
    ),
  ].sort((a, b) => a - b)
  const logs = new Map(multipliers.map((multiplier) => [multiplier, 0]))
  let fit = solve(bands)
  let masses = new Map<number, number>()
  const limit = 64
  for (let iteration = 0; iteration <= limit; iteration++) {
    masses = new Map(multipliers.map((multiplier) => [multiplier, 0]))
    for (const band of bands)
      for (const sample of band.samples)
        for (const multiplier of sample.fullScreens)
          masses.set(
            multiplier,
            masses.get(multiplier)! + (fit.weights.get(sample.id) ?? 0),
          )
    const errors = multipliers.map((multiplier) => {
      const target = targets.get(multiplier)
      if (!(target! > 0)) throw new Error(`Missing full-screen target for ${multiplier}x`)
      return Math.log(target!) - Math.log(masses.get(multiplier)!)
    })
    if (errors.every((error) => Math.abs(error) <= 0.01))
      return { ...fit, masses, iterations: iteration, achieved: true }
    if (iteration === limit) break
    multipliers.forEach((multiplier, i) =>
      logs.set(
        multiplier,
        Math.max(-40, Math.min(40, logs.get(multiplier)! + 0.75 * errors[i])),
      ),
    )
    fit = solve(
      bands.map((band) => ({
        ...band,
        samples: band.samples.map((sample) => ({
          ...sample,
          weight:
            sample.weight *
            Math.exp(
              sample.fullScreens.length
                ? Math.max(
                    ...sample.fullScreens.map((multiplier) => logs.get(multiplier)!),
                  )
                : 0,
            ),
        })),
      })),
    )
  }
  return { ...fit, masses, iterations: limit, achieved: false }
}
