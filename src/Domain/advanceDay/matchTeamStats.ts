import type { TeamStats as EngineTeamStats } from "@/GameEngine/Domain/Statistics";
import type { MatchTeamStats } from "@/types/dayLogTypes";

/** Engine team stats -> day-log team stats (discipline included). Shared with the live recording. */
export function toMatchTeamStats(t: EngineTeamStats): MatchTeamStats {
  return {
    shots: t.shots,
    passesCompleted: t.passesCompleted,
    passesAttempted: t.passesAttempted,
    tackles: t.tackles,
    interceptions: t.interceptions,
    fouls: t.fouls,
    yellowCards: t.yellowCards,
    redCards: t.redCards,
    offsides: t.offsides,
    penaltiesAwarded: t.penaltiesAwarded,
  };
}
