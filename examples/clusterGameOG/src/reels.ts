import { StaticReelSet } from "@slot-engine/core"

export const REELS = {
  base: new StaticReelSet({ id: "base", csvPath: "./static-reels/reels_base.csv" }),
  bonus: new StaticReelSet({ id: "bonus", csvPath: "./static-reels/reels_bonus.csv" }),
  maxwin: new StaticReelSet({ id: "maxwin", csvPath: "./static-reels/reels_maxwin.csv" }),
} as const
