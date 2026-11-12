import { createPanel } from "@slot-engine/panel"
import { game } from "./index"

createPanel({ games: [game] }).start()
