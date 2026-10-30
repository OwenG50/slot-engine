import type { BonusTier, GameEvent } from "./types"

/** Counts actual bonus reveals, not the triggering spin or the chance that the whole buy pays. */
export function bonusSpinStats(events: readonly GameEvent[]) {
  let tier: BonusTier | undefined
  let spins = 0,
    hits = 0,
    highOnly = 0,
    maxStage = 1,
    highLines = 0,
    paidLines = 0
  let inSpin = false,
    won = false,
    low = false,
    high = false
  const finish = () => {
    if (!inSpin) return
    if (won) hits++
    if (high && !low) highOnly++
  }
  for (const event of events) {
    if (event.type === "freeSpinTrigger") tier = event.data.tier as BonusTier
    if (!tier) continue
    if (event.type === "reveal") {
      finish()
      inSpin = true
      won = low = high = false
      spins++
    } else if (event.type === "winInfo" && inSpin) {
      for (const win of event.data.wins as { win: number; symbol: string }[]) {
        if (win.win <= 0) continue
        paidLines++
        if (win.symbol.startsWith("H")) highLines++
        won = true
        low ||= win.symbol.startsWith("L")
        high ||= win.symbol.startsWith("H")
      }
    } else if (event.type === "newStageUnlocked") maxStage = Number(event.data.stage)
  }
  finish()
  return { tier, spins, hits, highOnly, maxStage, highLines, paidLines }
}
