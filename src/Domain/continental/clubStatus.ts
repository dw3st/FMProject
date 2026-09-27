import type { ContinentalMetaData, ContinentalStageName, Fixture } from "@/types/calendarTypes";

export type ContinentalClubStatus =
  | { kind: "group"; group: string; opponentIds: string[] }
  | { kind: "eliminatedGroup" }
  | { kind: "drawn"; stage: ContinentalStageName; opponentId: string; firstLegDate: string; venue: "home" | "away" | "neutral" };

/**
 * Where a club actually stands in a continental competition RIGHT NOW, read from meta + the r16
 * first-leg round's fixtures (only meaningful once `r16.drawn`).
 *
 * Exists because a start kit (`applyRandomStartKit`) can overwrite a freshly created save's
 * ucl/uel/lib/sud metas with a pre-simulated season — different groups, and by the kit's cutoff
 * date (Brazilian kickoff) the group stage has always finished and the r16 draw has always
 * happened (see `.claude/rules/game/continental.md`: knockout matches start after the cutoff, but
 * the draw itself happens the moment the group stage ends, well before). A "here's your group"
 * inbox message built from what `createSave` handed out would be stale in that case — the caller
 * must instead check what's actually on disk after the kit decision and send a "draw" (still in)
 * or "eliminated" (finished 3rd/4th) message.
 */
export function continentalClubStatusOf(
  cont: ContinentalMetaData,
  clubId: string,
  r16FirstLegFixtures: Fixture[],
): ContinentalClubStatus | null {
  const group = cont.groups.find((g) => g.clubs.includes(clubId));
  if (!group) return null;

  const r16 = cont.stages.find((s) => s.name === "r16");
  if (r16?.drawn) {
    const tie = r16FirstLegFixtures.find((f) => f.home === clubId || f.away === clubId);
    if (tie) {
      const opponentId = tie.home === clubId ? tie.away : tie.home;
      const venue: "home" | "away" | "neutral" = tie.neutral ? "neutral" : tie.home === clubId ? "home" : "away";
      return { kind: "drawn", stage: "r16", opponentId, firstLegDate: tie.date, venue };
    }
    return { kind: "eliminatedGroup" };
  }

  return { kind: "group", group: group.name, opponentIds: group.clubs.filter((id) => id !== clubId) };
}
