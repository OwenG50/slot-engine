import type { BonusBand, BonusSample } from "./bonusSpinWeights"

export interface ProgressionBand extends Omit<BonusBand, "samples"> {
  samples: Array<BonusSample & { stage: number }>
}

/** Maximum-entropy fit: exact band mass/mean, optional spin-hit moment, soft cumulative
 * stage targets. Damped Newton solves the convex dual; no books are rewritten. */
export function fitBonusProgression(
  bands: ProgressionBand[],
  target: number | undefined,
  reach: readonly number[],
  stagePayouts: readonly number[] = [],
  constrainReach = true,
) {
  if (
    (target !== undefined && !(target > 0 && target < 1)) ||
    reach.length !== 6 ||
    reach[0] !== 1 ||
    reach.some((value, i) => value < 0 || value > 1 || (i > 0 && value > reach[i - 1])) ||
    (stagePayouts.length !== 0 && stagePayouts.length !== 6) ||
    stagePayouts.some((value) => !Number.isFinite(value) || value <= 0)
  ) {
    throw new Error("Invalid bonus progression targets")
  }
  const hitDimensions = target === undefined ? 0 : 1
  const reachDimensions = constrainReach ? 5 : 0
  const globals = hitDimensions + reachDimensions + stagePayouts.length
  const dimension = bands.length + globals
  const penalty = 1e-7
  const prepared = bands.map((band, b) => {
    if (!band.samples.length) throw new Error(`No bonus samples for ${band.name}`)
    const payouts = band.samples.map((sample) => sample.payout)
    const min = Math.min(...payouts),
      max = Math.max(...payouts)
    if (band.average < min - 1e-8 || band.average > max + 1e-8)
      throw new Error(`Payout mean outside ${band.name} support`)
    const samples =
      band.average === min || band.average === max
        ? band.samples.filter((sample) => Math.abs(sample.payout - band.average) < 1e-8)
        : band.samples
    return {
      ...band,
      b,
      samples,
      values: samples.map((sample) => ({
        log: Math.log(Math.max(Number.MIN_VALUE, sample.weight)),
        y: (sample.payout - band.average) / Math.max(1, max - min),
        x: [
          ...(target === undefined ? [] : [(sample.hits - target * sample.spins) / 30]),
          ...(constrainReach
            ? reach.slice(1).map((_, i) => Number(sample.stage >= i + 2))
            : []),
          ...stagePayouts.map((mean, i) =>
            sample.stage === i + 1 ? (sample.payout - mean) / mean : 0,
          ),
        ],
      })),
    }
  })

  function evaluate(parameters: number[], curvature: boolean, retain = false) {
    let objective = 0,
      hits = 0,
      spins = 0
    const gradient = Array(dimension).fill(0) as number[]
    const hessian = Array.from(
      { length: dimension },
      () => Array(dimension).fill(0) as number[],
    )
    const weights = new Map<number, number>()
    for (const band of prepared) {
      const scores = band.values.map(
        (v) =>
          v.log +
          parameters[band.b] * v.y +
          v.x.reduce((sum, value, i) => sum + parameters[bands.length + i] * value, 0),
      )
      const peak = Math.max(...scores)
      const ws = scores.map((score) => Math.exp(score - peak))
      const total = ws.reduce((sum, weight) => sum + weight, 0)
      objective += band.probability * (peak + Math.log(total))
      const means = Array(globals + 1).fill(0) as number[]
      const moments = Array.from(
        { length: globals + 1 },
        () => Array(globals + 1).fill(0) as number[],
      )
      band.values.forEach((v, index) => {
        const weight = ws[index] / total
        const values = [v.y, ...v.x]
        for (let i = 0; i < values.length; i++) {
          means[i] += weight * values[i]
          if (curvature)
            for (let j = 0; j <= i; j++) moments[i][j] += weight * values[i] * values[j]
        }
        if (retain) {
          const mass = band.probability * weight
          weights.set(band.samples[index].id, mass)
          hits += mass * band.samples[index].hits
          spins += mass * band.samples[index].spins
        }
      })
      const indices = [
        band.b,
        ...Array.from({ length: globals }, (_, i) => bands.length + i),
      ]
      indices.forEach((i, a) => {
        gradient[i] += band.probability * means[a]
        if (curvature)
          for (let b = 0; b <= a; b++) {
            const j = indices[b]
            const value = band.probability * (moments[a][b] - means[a] * means[b])
            hessian[i][j] += value
            if (i !== j) hessian[j][i] += value
          }
      })
    }
    for (let i = hitDimensions; i < globals; i++) {
      const index = bands.length + i
      const isReach = i - hitDimensions < reachDimensions
      const momentTarget = isReach ? reach[i - hitDimensions + 1] : 0
      // Payout curves are gentle preferences. Scale their penalty by the
      // stage's probability so rare stages receive comparable relative guidance.
      const stage = i - hitDimensions - reachDimensions
      const regularization = isReach
        ? penalty
        : (stage >= 4 ? 0.0001 : 0.01) *
          Math.max(1e-6, reach[stage] - (reach[stage + 1] ?? 0))
      objective +=
        (regularization * parameters[index] ** 2) / 2 - parameters[index] * momentTarget
      gradient[index] += regularization * parameters[index] - momentTarget
      hessian[index][index] += regularization
    }
    return { objective, gradient, hessian, weights, hitRate: hits / spins }
  }

  let parameters = Array(dimension).fill(0) as number[]
  for (let iteration = 0; iteration < 120; iteration++) {
    const state = evaluate(parameters, true)
    if (
      state.gradient.every(
        (value, i) =>
          Math.abs(value) / (i < bands.length ? bands[i].probability : 1) < 1e-10,
      )
    )
      break
    let accepted = false
    for (const ridge of [1e-12, 1e-9, 1e-6, 1e-3]) {
      const matrix = state.hessian.map((row, i) => [
        ...row.map((value, j) => value + (i === j ? ridge : 0)),
        -state.gradient[i],
      ])
      // Partial-pivot Gaussian elimination on the small dual Hessian.
      for (let i = 0; i < dimension; i++) {
        let pivot = i
        for (let j = i + 1; j < dimension; j++)
          if (Math.abs(matrix[j][i]) > Math.abs(matrix[pivot][i])) pivot = j
        ;[matrix[i], matrix[pivot]] = [matrix[pivot], matrix[i]]
        for (let j = i + 1; j < dimension; j++) {
          const ratio = matrix[j][i] / matrix[i][i]
          for (let k = i; k <= dimension; k++) matrix[j][k] -= ratio * matrix[i][k]
        }
      }
      const step = Array(dimension).fill(0) as number[]
      for (let i = dimension - 1; i >= 0; i--)
        step[i] =
          (matrix[i][dimension] -
            matrix[i]
              .slice(i + 1, dimension)
              .reduce((sum, value, k) => sum + value * step[i + 1 + k], 0)) /
          matrix[i][i]
      const slope = step.reduce((sum, value, i) => sum + value * state.gradient[i], 0)
      if (!Number.isFinite(slope) || slope >= 0) continue
      for (let scale = 1; scale >= 1 / 65536; scale /= 2) {
        const next = parameters.map((value, i) => value + scale * step[i])
        if (
          evaluate(next, false).objective <=
          state.objective + 1e-4 * scale * slope + 1e-12
        ) {
          parameters = next
          accepted = true
          break
        }
      }
      if (accepted) break
    }
    if (!accepted) break
  }
  const result = evaluate(parameters, false, true)
  if (
    (target !== undefined && Math.abs(result.hitRate - target) > 1e-7) ||
    result.gradient
      .slice(0, bands.length)
      .some((value, i) => Math.abs(value) / bands[i].probability > 1e-8)
  )
    throw new Error(
      "Progression fit cannot preserve payout means and requested hit rate on these samples",
    )
  const stageReach = reach.map((_, i) =>
    bands.reduce(
      (sum, band) =>
        sum +
        band.samples.reduce(
          (mass, sample) =>
            mass + (sample.stage >= i + 1 ? (result.weights.get(sample.id) ?? 0) : 0),
          0,
        ),
      0,
    ),
  )
  return {
    weights: result.weights,
    hitRate: result.hitRate,
    moment: 0,
    target,
    targetReached: true,
    supportedRange: undefined,
    stageReach,
  }
}
