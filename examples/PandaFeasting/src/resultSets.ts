import { ResultSet, SPIN_TYPE } from "@slot-engine/core"
import { bonusMinimum, optimizationBuckets } from "./math"
import { MAX_WIN, ModeName } from "./types"

/** Quotas generate coverage; optimizer targets determine player probabilities. */
export function createResultSets(mode: ModeName) {
  const buckets = optimizationBuckets(mode)
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
          sampleBonusLines: !!bucket.tier,
          tail: bucket.range[0] >= 2000,
        },
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: {
            [mode === "featureSpin" ? "bonus_lines_v1" : "base_lines_v1"]: 1,
          },
          [SPIN_TYPE.FREE_SPINS]: { bonus_lines_v1: 1 },
        },
        evaluate: (ctx) =>
          !bucket.tier ||
          ctx.state.userData.bonusPayout >= bonusMinimum(mode, bucket.tier),
      }),
  )
}
