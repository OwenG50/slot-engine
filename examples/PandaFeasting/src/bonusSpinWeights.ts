/** Fits payout-band probabilities and means, optionally constraining bonus spin hits. */
export interface BonusSample {
  id: number
  payout: number
  spins: number
  hits: number
  weight: number
}
export interface BonusBand {
  name: string
  probability: number
  average: number
  samples: BonusSample[]
}

export interface BonusFitOptions {
  unsupportedTarget?: "error" | "nearest"
}

/** Exact linear extrema under each band's payout-mean constraint. A convex
 * envelope needs at most two books per band; it also handles endpoint targets
 * that cannot be reached by a finite exponential tilt. */
function extremeFit(bands: BonusBand[], target: number, maximize: boolean) {
  const weights = new Map<number, number>(
    bands.flatMap((band) => band.samples.map((sample) => [sample.id, 0] as const)),
  )
  let hits = 0,
    spins = 0
  for (const band of bands) {
    const points = band.samples
      .map((sample) => ({
        sample,
        x: sample.payout,
        y: (maximize ? -1 : 1) * (sample.hits - target * sample.spins),
      }))
      .sort((a, b) => a.x - b.x || a.y - b.y)
    const hull: typeof points = []
    for (const point of points) {
      if (hull.at(-1)?.x === point.x) continue
      while (hull.length >= 2) {
        const a = hull[hull.length - 2],
          b = hull[hull.length - 1]
        if ((b.x - a.x) * (point.y - b.y) - (b.y - a.y) * (point.x - b.x) > 0) break
        hull.pop()
      }
      hull.push(point)
    }
    const right = Math.max(
      0,
      hull.findIndex((point) => point.x >= band.average - 1e-10),
    )
    const b = hull[right],
      a = hull[Math.max(0, right - 1)]
    const fraction =
      a.x === b.x ? 0 : Math.max(0, Math.min(1, (band.average - a.x) / (b.x - a.x)))
    for (const [point, share] of [
      [a, 1 - fraction],
      [b, fraction],
    ] as const) {
      const weight = share * band.probability
      weights.set(point.sample.id, (weights.get(point.sample.id) ?? 0) + weight)
      hits += weight * point.sample.hits
      spins += weight * point.sample.spins
    }
  }
  return { weights, hitRate: hits / spins, moment: hits - target * spins }
}

function boundaryFit(bands: BonusBand[], target: number, maximize: boolean) {
  let fit = extremeFit(bands, target, maximize)
  for (let i = 0; i < 64; i++) {
    const next = extremeFit(bands, fit.hitRate, maximize)
    if (Math.abs(next.hitRate - fit.hitRate) < 1e-12) return next
    fit = next
  }
  throw new Error("Bonus hit-rate boundary did not converge")
}

export function fitBonusHitRate(
  bands: BonusBand[],
  target: number | undefined,
  options: BonusFitOptions = {},
) {
  if (target !== undefined && !(target > 0 && target < 1))
    throw new Error("Bonus spin hit rate must be between 0 and 1")
  const prepared = bands.map((band) => {
    if (!band.samples.length) throw new Error(`No bonus samples for ${band.name}`)
    const min = Math.min(...band.samples.map((s) => s.payout))
    const max = Math.max(...band.samples.map((s) => s.payout))
    if (band.average < min - 1e-8 || band.average > max + 1e-8)
      throw new Error(`Payout mean outside ${band.name} support`)
    const samples =
      min === max || band.average === min || band.average === max
        ? band.samples.filter((s) => Math.abs(s.payout - band.average) < 1e-8)
        : band.samples
    return {
      ...band,
      samples,
      values: samples.map((s) => ({
        y: (s.payout - band.average) / Math.max(1, max - min),
        d: target === undefined ? 0 : s.hits - target * s.spins,
        log: Math.log(Math.max(Number.MIN_VALUE, s.weight)),
      })),
    }
  })
  function evaluate(beta: number, retain = false) {
    let moment = 0,
      spins = 0,
      hits = 0
    const weights = new Map<number, number>()
    for (const band of prepared) {
      const distribution = (alpha: number, save = false) => {
        let peak = -Infinity
        for (const v of band.values)
          peak = Math.max(peak, v.log + alpha * v.y + beta * v.d)
        let mass = 0,
          y = 0,
          d = 0
        const ws: number[] = []
        for (const v of band.values) {
          const w = Math.exp(v.log + alpha * v.y + beta * v.d - peak)
          mass += w
          y += w * v.y
          d += w * v.d
          if (save) ws.push(w)
        }
        return { y: y / mass, d: d / mass, mass, ws }
      }
      let lo = -1,
        hi = 1
      while (distribution(lo).y > 1e-13 && lo > -1e6) lo *= 2
      while (distribution(hi).y < -1e-13 && hi < 1e6) hi *= 2
      for (let i = 0; i < 52; i++) {
        const mid = (lo + hi) / 2
        if (distribution(mid).y < 0) lo = mid
        else hi = mid
      }
      const result = distribution((lo + hi) / 2, retain)
      moment += band.probability * result.d
      if (retain)
        band.samples.forEach((sample, i) => {
          const weight = (band.probability * result.ws[i]) / result.mass
          weights.set(sample.id, weight)
          spins += weight * sample.spins
          hits += weight * sample.hits
        })
    }
    return { moment, weights, hitRate: hits / spins }
  }
  if (target === undefined)
    return {
      ...evaluate(0, true),
      target,
      targetReached: true,
      supportedRange: undefined,
    }
  let lo = -1,
    hi = 1
  while (evaluate(lo).moment > 0 && lo > -256) lo *= 2
  while (evaluate(hi).moment < 0 && hi < 256) hi *= 2
  if (evaluate(lo).moment > 1e-8 || evaluate(hi).moment < -1e-8) {
    const lower = boundaryFit(prepared, target, false)
    const upper = boundaryFit(prepared, target, true)
    const supportedRange = [lower.hitRate, upper.hitRate] as const
    if (target < lower.hitRate - 1e-10 || target > upper.hitRate + 1e-10) {
      if (options.unsupportedTarget !== "nearest")
        throw new Error(
          `Bonus spin hit-rate target is outside the sampled payout-constrained support (${lower.hitRate} to ${upper.hitRate}); regenerate broader samples`,
        )
      const nearest = target < lower.hitRate ? lower : upper
      return { ...nearest, target, targetReached: false, supportedRange }
    }
    // Feasible boundary or numerically stiff fit: interpolate exact extrema.
    const low = extremeFit(prepared, target, false)
    const high = extremeFit(prepared, target, true)
    const span = high.moment - low.moment
    const mix = span > 1e-14 ? Math.max(0, Math.min(1, -low.moment / span)) : 0
    const weights = new Map<number, number>()
    for (const band of prepared)
      for (const sample of band.samples)
        weights.set(
          sample.id,
          (1 - mix) * (low.weights.get(sample.id) ?? 0) +
            mix * (high.weights.get(sample.id) ?? 0),
        )
    return {
      weights,
      hitRate: target,
      moment: 0,
      target,
      targetReached: true,
      supportedRange,
    }
  }
  for (let i = 0; i < 45; i++) {
    const mid = (lo + hi) / 2
    if (evaluate(mid).moment < 0) lo = mid
    else hi = mid
  }
  return {
    ...evaluate((lo + hi) / 2, true),
    target,
    targetReached: true,
    supportedRange: undefined,
  }
}
