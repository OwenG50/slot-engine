import { fitBonusHitRate, BonusBand, BonusSample } from "./bonusSpinWeights"

export interface FullScreenBand extends Omit<BonusBand, "samples"> {
  samples: (BonusSample & { fullScreens: number[]; multiplier?: number })[]
}

/** Adjust book priors toward full-screen masses and optional FeatureSpin stage
 * shares/median anchors, keeping exact payout-band constraints. Targets a band cannot fund are
 * approached as far as possible and reported as not achieved. */
export function fitFullScreenStages(
  bands: FullScreenBand[],
  targets: ReadonlyMap<number, number>,
  hitTarget?: number,
  stageTargets: readonly { multiplier: number; probability: number; median: number }[] = [],
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
  const stageLogs = stageTargets.map(() => 0)
  const medianLogs = stageTargets.map(() => 0)
  for (const target of stageTargets)
    if (!bands.some((band) => band.samples.some((sample) => sample.multiplier === target.multiplier)))
      throw new Error(`Missing FeatureSpin stage support for ${target.multiplier}x`)
  let fit = solve(bands)
  let masses = new Map<number, number>()
  const limit = stageTargets.length ? 256 : 64
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
    const stageMasses = stageTargets.map((target) => {
      let mass = 0, below = 0
      for (const band of bands)
        for (const sample of band.samples)
          if (sample.multiplier === target.multiplier) {
            const weight = fit.weights.get(sample.id) ?? 0
            mass += weight
            if (sample.payout <= target.median) below += weight
          }
      return { multiplier: target.multiplier, probability: mass, belowMedian: below / mass }
    })
    const stageErrors = stageMasses.map((mass, i) =>
      Math.log(stageTargets[i].probability / mass.probability),
    )
    const medianErrors = stageMasses.map((mass) =>
      Math.log(0.5 / mass.belowMedian),
    )
    if ([...errors, ...stageErrors, ...medianErrors].every(
      (error) => Math.abs(error) <= (stageTargets.length ? 0.005 : 0.01),
    ))
      return { ...fit, masses, stageMasses, iterations: iteration, achieved: true }
    if (iteration === limit) break
    multipliers.forEach((multiplier, i) =>
      logs.set(
        multiplier,
        Math.max(-40, Math.min(40, logs.get(multiplier)! + 0.75 * errors[i])),
      ),
    )
    stageTargets.forEach((_, i) => {
      stageLogs[i] = Math.max(-40, Math.min(40, stageLogs[i] + 0.75 * stageErrors[i]))
      medianLogs[i] = Math.max(-40, Math.min(40, medianLogs[i] + 0.75 * medianErrors[i]))
    })
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
            ) *
            Math.exp(
              stageTargets.reduce(
                (sum, target, i) =>
                  sum + (sample.multiplier === target.multiplier
                    ? stageLogs[i] + (sample.payout <= target.median ? medianLogs[i] : 0)
                    : 0),
                0,
              ),
            ),
        })),
      })),
    )
  }
  return { ...fit, masses, stageMasses: [], iterations: limit, achieved: false }
}
