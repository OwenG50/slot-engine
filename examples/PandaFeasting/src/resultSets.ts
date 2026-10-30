import { ResultSet, SPIN_TYPE } from "@slot-engine/core"
import { bonusMinimum, optimizationBuckets } from "./math"
import { REEL_SET_IDS } from "./reels"
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
          targetMinimumPayout: bucket.range[0],
          sampleBaseLines:
            !bucket.tier && mode !== "featureSpin" && bucket.range[0] >= 50,
          tail: bucket.range[0] >= 2000,
        },
        reelWeights: {
          [SPIN_TYPE.BASE_GAME]: {
            [mode === "featureSpin" ? REEL_SET_IDS.bonus : REEL_SET_IDS.base]: 1,
          },
          [SPIN_TYPE.FREE_SPINS]: { [REEL_SET_IDS.bonus]: 1 },
        },
        evaluate: (ctx) =>
          !bucket.tier ||
          ctx.state.userData.bonusPayout >= bonusMinimum(mode, bucket.tier),
      }),
  )
}
