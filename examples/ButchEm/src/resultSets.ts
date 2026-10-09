import { ResultSet, SPIN_TYPE } from "@slot-engine/core"
import { bonusMinimum, mathBuckets } from "./math"
import { reelWeights } from "./reels"
import { MAX_WIN, ModeName } from "./types"

/** Quotas generate coverage; optimizer targets determine player probabilities. */
export function createResultSets(mode: ModeName) {
  const buckets = mathBuckets(mode)
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
          profile: bucket.name.endsWith("_max") ? "maxwin" : bucket.profile,
          startingUpgradeCount: bucket.startingUpgradeCount,
        },
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: { base_standard: 1 },
          [SPIN_TYPE.FREE_SPINS]: { bonus_standard: 1 },
          evaluate: (ctx) => {
            const profile = ctx.state.userData.profile
            return reelWeights(
              profile,
              mode === "featureSpin" ||
                ctx.state.currentSpinType === SPIN_TYPE.FREE_SPINS,
            )
          },
        },
        evaluate: (ctx) =>
          !bucket.tier ||
          ctx.state.userData.bonusPayout >= bonusMinimum(mode, bucket.tier),
      }),
  )
}
