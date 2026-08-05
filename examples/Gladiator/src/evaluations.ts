import { GameContext } from "@slot-engine/core"
import { UserStateType } from ".."

// When a ResultSet is flagged with forceMaxWin, route it into the maxwin reel
// bucket so simulation produces enough 15000x candidates for optimizer fencing.
const MAXWIN_BUCKET = { maxwin: 1 } as const

export function maxwinReelsEvaluation(ctx: GameContext<any, any, UserStateType>) {
	if (ctx.state.currentResultSet.forceMaxWin) {
		return MAXWIN_BUCKET
	}
}
