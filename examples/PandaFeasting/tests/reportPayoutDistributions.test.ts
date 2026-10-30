import { describe, expect, it } from "vitest"
import { PAYOUT_CUTS, rangeLabel, summarize } from "../scripts/reportPayoutDistributions"

describe("payout distribution report", () => {
  it("summarizes weighted payouts into conditional and per-paid-round odds", () => {
    const rows = [
      { payout: 0, weight: 6 },
      { payout: 3, weight: 3 },
      { payout: 10000, weight: 1 },
    ]
    const summary = summarize(rows, 20, 2)!
    expect(summary.entryProbability).toBeCloseTo(0.5, 12)
    expect(summary.mean).toBeCloseTo(1000.9, 10)
    expect(summary.hitRate).toBeCloseTo(0.4, 12)
    expect(summary.atLeastCost).toBeCloseTo(0.4, 12)
    expect(summary.median).toBe(0)
    const byRange = new Map(summary.ranges.map((r) => [r.range, r]))
    expect(byRange.get("0 (loss)")!.probability).toBeCloseTo(0.6, 12)
    expect(byRange.get("2-5")!.perPaidRoundOneIn).toBeCloseTo(20 / 3, 12)
    expect(byRange.get("10000 (max)")!.oneIn).toBeCloseTo(10, 12)
    expect(summary.ranges.reduce((s, r) => s + r.probability, 0)).toBeCloseTo(1, 12)
    expect(summary.ranges.reduce((s, r) => s + r.rtpShare, 0)).toBeCloseTo(1, 12)
  })
  it("labels every payout band and returns nothing for empty groups", () => {
    expect(PAYOUT_CUTS.slice(0, -1).map((c, i) => rangeLabel(c, PAYOUT_CUTS[i + 1]))).toEqual([
      "0 (loss)", "0-1", "1-2", "2-5", "5-10", "10-20", "20-50", "50-100", "100-200",
      "200-500", "500-1000", "1000-2000", "2000-5000", "5000-10000", "10000 (max)",
    ])
    expect(summarize([], 1, 1)).toBeUndefined()
  })
})
