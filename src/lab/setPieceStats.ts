import type { MatchTeamStats } from "@/types/dayLogTypes";
import type { TeamRawStats } from "@/lab/types";

/**
 * Adds one side's set-piece stats (`.claude/rules/game-engine/set-pieces-play.md`) from a day-log
 * `MatchTeamStats` (quickSim recording) into the lab's raw team totals. The fields are optional on
 * the day log, so a missing one counts as 0.
 */
export function addDayLogSetPieces(dst: TeamRawStats, src: MatchTeamStats): void {
  dst.corners             += src.corners ?? 0;
  dst.freeKicks           += src.freeKicks ?? 0;
  dst.directFreeKickShots += src.directFreeKickShots ?? 0;
  dst.directFreeKickGoals += src.directFreeKickGoals ?? 0;
  dst.setPieceGoals       += src.setPieceGoals ?? 0;
}
