import type { MatchTeamStats } from "@/types/dayLogTypes";
import type { TeamRawStats } from "@/lab/types";

/**
 * Adds one side's aerial stats (`.claude/rules/game-engine/aerial.md`) from a day-log
 * `MatchTeamStats` (quickSim recording) into the lab's raw team totals. The fields are optional on
 * the day log, so a missing one counts as 0.
 */
export function addDayLogAerial(dst: TeamRawStats, src: MatchTeamStats): void {
  dst.crosses            += src.crosses ?? 0;
  dst.crossesCompleted   += src.crossesCompleted ?? 0;
  dst.aerialDuels        += src.aerialDuels ?? 0;
  dst.aerialDuelsWon     += src.aerialDuelsWon ?? 0;
  dst.headerGoals        += src.headerGoals ?? 0;
  dst.longBalls          += src.longBalls ?? 0;
  dst.longBallsCompleted += src.longBallsCompleted ?? 0;
}
