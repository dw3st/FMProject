import type { MatchTeamStats } from "@/types/dayLogTypes";
import type { TeamRawStats } from "@/lab/types";

/**
 * Adds one side's discipline stats from a day-log `MatchTeamStats` (quickSim recording) into the
 * lab's raw team totals. The fields are optional on the day log, so a missing one counts as 0.
 */
export function addDayLogDiscipline(dst: TeamRawStats, src: MatchTeamStats): void {
  dst.fouls            += src.fouls ?? 0;
  dst.yellowCards      += src.yellowCards ?? 0;
  dst.redCards         += src.redCards ?? 0;
  dst.offsides         += src.offsides ?? 0;
  dst.penaltiesAwarded += src.penaltiesAwarded ?? 0;
  dst.penaltyGoals     += src.penaltyGoals ?? 0;
}
