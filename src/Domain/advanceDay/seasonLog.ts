import type { RosterPlayer } from "@/types/playerTypes";
import { emptySeasonLog } from "@/types/playerTypes";

export function ensureSeasonLog(player: RosterPlayer): RosterPlayer {
  if (player.seasonLog) return player;
  return { ...player, seasonLog: emptySeasonLog() };
}
