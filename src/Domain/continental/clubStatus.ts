import type { ContinentalMetaData, ContinentalStageName, Fixture } from "@/types/calendarTypes";

export type ContinentalClubStatus =
  | { kind: "group"; group: string; opponentIds: string[] }
  | { kind: "eliminatedGroup" }
  | { kind: "drawn"; stage: ContinentalStageName; opponentId: string; firstLegDate: string; venue: "home" | "away" | "neutral" }
  /** League format, league phase still running: the 8 opponents (round order). */
  | { kind: "league"; opponentIds: string[] }
  /** League format: finished 1st–8th, waiting for the round of 16 draw. */
  | { kind: "top8"; position: number }
  /** League format: finished 25th–36th. */
  | { kind: "eliminatedLeague"; position: number }
  /** League format: knocked out in a knockout stage already played (e.g. the play-off). */
  | { kind: "eliminated"; stage: ContinentalStageName };

const KNOCKOUT_ORDER: ContinentalStageName[] = ["playoff", "r16", "qf", "sf", "final"];

function tieOf(fixtures: Fixture[], clubId: string, stage: ContinentalStageName): ContinentalClubStatus | null {
  const tie = fixtures.find((f) => f.home === clubId || f.away === clubId);
  if (!tie) return null;
  const opponentId = tie.home === clubId ? tie.away : tie.home;
  const venue: "home" | "away" | "neutral" = tie.neutral ? "neutral" : tie.home === clubId ? "home" : "away";
  return { kind: "drawn", stage, opponentId, firstLegDate: tie.date, venue };
}

/**
 * Where a club actually stands in a continental competition RIGHT NOW, read from meta + the fixtures of the rounds
 * it needs: in the group format, the r16 first-leg round (only meaningful once `r16.drawn`); in the league format,
 * the league-phase rounds and the first leg of every drawn knockout stage.
 *
 * `rounds` is either a map round → fixtures, or (group format, the old call) the r16 first-leg fixtures alone.
 *
 * Exists because a start kit (`applyRandomStartKit`) can overwrite a freshly created save's
 * ucl/uel/lib/sud metas with a pre-simulated season — different groups, and by the kit's cutoff
 * date (Brazilian kickoff) the group stage (or league phase) has always finished and the next draw
 * has always happened (see `.claude/rules/game/continental.md`). A "here's your group" inbox message
 * built from what `createSave` handed out would be stale in that case — the caller must instead
 * check what's actually on disk after the kit decision.
 */
export function continentalClubStatusOf(
  cont: ContinentalMetaData,
  clubId: string,
  rounds: Fixture[] | ReadonlyMap<number, Fixture[]>,
): ContinentalClubStatus | null {
  const byRound = (round: number | undefined): Fixture[] =>
    round === undefined ? [] : Array.isArray(rounds) ? [] : ((rounds as ReadonlyMap<number, Fixture[]>).get(round) ?? []);

  if (cont.format === "league") {
    if (!cont.pots?.some((p) => p.includes(clubId))) return null;
    // The latest drawn knockout stage the club is in → that draw; an earlier one only → knocked out there.
    let lastIn: ContinentalStageName | null = null;
    for (const name of [...KNOCKOUT_ORDER].reverse()) {
      const stage = cont.stages.find((s) => s.name === name);
      if (!stage?.drawn) continue;
      const tie = tieOf(byRound(stage.rounds[0]), clubId, name);
      if (tie && lastIn === null) return tie;
      if (tie) break;
      lastIn = name;
    }
    const playoff = cont.stages.find((s) => s.name === "playoff");
    if (!playoff?.drawn) {
      const league = cont.stages.find((s) => s.name === "league");
      const opponentIds = (league?.rounds ?? []).flatMap((r) =>
        byRound(r).filter((f) => f.home === clubId || f.away === clubId).map((f) => (f.home === clubId ? f.away : f.home)),
      );
      return { kind: "league", opponentIds };
    }
    const position = cont.seeds?.[clubId] ?? 0;
    if (position > 24) return { kind: "eliminatedLeague", position };
    // In a drawn stage earlier than the latest one, but not in the latest: knocked out (play-off or later).
    for (const name of KNOCKOUT_ORDER) {
      const stage = cont.stages.find((s) => s.name === name);
      if (stage?.drawn && tieOf(byRound(stage.rounds[0]), clubId, name)) return { kind: "eliminated", stage: name };
    }
    return { kind: "top8", position };
  }

  const group = cont.groups.find((g) => g.clubs.includes(clubId));
  if (!group) return null;

  const r16 = cont.stages.find((s) => s.name === "r16");
  if (r16?.drawn) {
    const fixtures = Array.isArray(rounds) ? rounds : byRound(r16.rounds[0]);
    const tie = tieOf(fixtures, clubId, "r16");
    if (tie) return tie;
    return { kind: "eliminatedGroup" };
  }

  return { kind: "group", group: group.name, opponentIds: group.clubs.filter((id) => id !== clubId) };
}
