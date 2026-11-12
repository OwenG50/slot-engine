import { ResultSet, SPIN_TYPE } from "@slot-engine/core"
import { bonusMinimum, optimizationBuckets, simulationBuckets } from "./math"
import { REEL_SET_IDS } from "./reels"
import { MAX_WIN, ModeName } from "./types"
import { MODES } from "./settings"

export function meetsBonusMinimum(ctx: {
  state: { userData: { bonusPayout: number; bonusMinimum: number } }
}) {
  return ctx.state.userData.bonusPayout >= ctx.state.userData.bonusMinimum
}

export function createResultSets(mode: ModeName) {
  const legacy = simulationBuckets(mode)
  const targets = optimizationBuckets(mode)
  const activeLegacy = legacy.filter((bucket) => targets.some((target) =>
    target.criteria.includes(bucket.name) &&
    Math.max(bucket.range[0], target.range[0]) <= Math.min(bucket.range[1], target.range[1]),
  ))
  const buckets = [
    ...activeLegacy,
    ...targets.filter((band) => !MODES[mode].boughtTier &&
      !activeLegacy.some((bucket) => bucket.name === band.name),
    ).map((band) => ({
      ...band,
      minimum: band.tier ? bonusMinimum(mode, band.tier) : undefined,
      minNewCars: undefined,
    })),
  ]
  return buckets.map(
    (bucket) =>
      new ResultSet({
        criteria: bucket.name,
        quota: 1 / buckets.length,
        multiplier: bucket.range,
        forceMaxWin: bucket.range[0] === MAX_WIN,
        forceFreespins: !!bucket.tier,
        userData: {
          tier: bucket.tier,
          minimum: bucket.minimum,
          minNewCars: bucket.minNewCars,
          sampleHighWins: bucket.range[0] >= 1000,
          ordinaryOnly: !bucket.tier && bucket.name !== "max" && bucket.name !== "max_tail",
        },
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: {
            [mode === "featureSpin" ? REEL_SET_IDS.bonus : REEL_SET_IDS.base]: 1,
          },
          [SPIN_TYPE.FREE_SPINS]: { [REEL_SET_IDS.bonus]: 1 },
        },
        evaluate: (ctx) => {
          if (ctx.state.userData.bonusPayout < ctx.state.userData.bonusMinimum)
            return false
          const tier = bucket.tier ??
            (bucket.name === "max" ? (mode === "featureSpin" ? "normal" : "hidden") :
              bucket.name === "max_tail" ? "hidden" : "none")
          if (ctx.state.userData.bonusTier !== tier) return false
          const win = ctx.services.wallet.getCurrentWin()
          return targets.some((target) => target.criteria.includes(bucket.name) &&
            win >= target.range[0] && win <= target.range[1])
        },
      }),
  )
}
