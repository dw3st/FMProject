import type { Fixture, LeagueSeasonMeta } from "@/types/calendarTypes";
import type { LiveStage } from "@/types/rivalsTypes";

/** Where a fixture stands in its competition, for the line above a friend's live game. Null when unknown. */
export function liveStageOf(meta: LeagueSeasonMeta | null | undefined, fixture: Pick<Fixture, "round" | "leg" | "home">): LiveStage | null {
  if (!meta) return null;
  if (meta.cup) {
    const stage = meta.cup.stages.find((s) => s.round === fixture.round);
    return stage ? { kind: "cup", stage: stage.name } : null;
  }
  if (meta.continental) {
    const stage = meta.continental.stages.find((s) => s.rounds.includes(fixture.round));
    if (!stage) return null;
    if (stage.name === "group") {
      const group = meta.continental.groups.find((g) => g.clubs.includes(fixture.home));
      return group ? { kind: "group", group: group.name, round: stage.rounds.indexOf(fixture.round) + 1 } : null;
    }
    return { kind: "continental", stage: stage.name, ...(fixture.leg ? { leg: fixture.leg } : {}) };
  }
  return { kind: "round", round: fixture.round };
}
