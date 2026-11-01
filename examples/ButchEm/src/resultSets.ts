import { ResultSet, SPIN_TYPE } from "@slot-engine/core"
import { BIG_ORDINARY_WIN_COVERAGE, MathBucket, bonusMinimum, mathBuckets } from "./math"
import { reelWeights } from "./reels"
import { MAX_WIN, ModeName } from "./types"

/** Quotas generate coverage; optimizer targets determine player probabilities.
 * Ordinary base-game wins are later split into about a dozen payout bands, so
 * they receive a matching share of books, plus dedicated 20x+ coverage for
 * bands too rare to appear among ordinary draws. */
const COVERAGE_SHARE: Record<string, number> = {
  baseWin: 9,
  [BIG_ORDINARY_WIN_COVERAGE.name]: 3,
}
export function createResultSets(mode: ModeName) {
  const buckets: MathBucket[] = mathBuckets(mode).flatMap((bucket) =>
    bucket.name === "baseWin" ? [bucket, BIG_ORDINARY_WIN_COVERAGE] : [bucket],
  )
  const share = (name: string) => COVERAGE_SHARE[name] ?? 1
  const totalShare = buckets.reduce((sum, bucket) => sum + share(bucket.name), 0)
  return buckets.map(
    (bucket) =>
      new ResultSet({
        criteria: bucket.name,
        quota: share(bucket.name) / totalShare,
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
          [SPIN_TYPE.FREE_SPINS]: { free_standard: 1 },
          evaluate: (ctx) => {
            const profile = ctx.state.userData.profile
            return reelWeights(
              profile,
              mode === "featureSpin"
                ? "bonus"
                : ctx.state.currentSpinType === SPIN_TYPE.FREE_SPINS
                  ? "free"
                  : "base",
            )
          },
        },
        evaluate: (ctx) =>
          !bucket.tier ||
          ctx.state.userData.bonusPayout >= bonusMinimum(mode, bucket.tier),
      }),
  )
}
