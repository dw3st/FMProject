/**
 * Where a friend's club stands in each competition, for the Rivals card and the League tab (tester report, 8.9.9). Pure.
 */
import { outOfCompetition } from "@/Domain/registration/eliminated";
import { groupTable } from "@/Domain/continental/groupTable";
import type { Fixture, LeagueSeasonMeta } from "@/types/calendarTypes";
import type { StandingRow } from "@/types/playerTypes";
import type { RivalComp, RivalTableRow } from "@/types/rivalsTypes";

const nextDateOf = (mine: readonly Fixture[]): string | undefined =>
  mine.filter((f) => !f.played).map((f) => f.date).sort()[0];

/** League position, size and points (null before his first game). */
export function leagueComp(slug: string, table: readonly StandingRow[], clubId: string, fixtures: readonly Fixture[] = []): RivalComp | null {
  const i = table.findIndex((r) => r.squadId === clubId);
  if (i < 0 || table[i]!.mp === 0) return null;
  const nextDate = nextDateOf(fixtures.filter((f) => f.home === clubId || f.away === clubId));
  return { slug, kind: "league", position: i + 1, size: table.length, points: table[i]!.pts, ...(nextDate ? { nextDate } : {}) };
}

/** Five rows of his league table around him (the top five when he is near the top). */
export function tableAround(table: readonly StandingRow[], clubId: string, size = 5): RivalTableRow[] {
  const i = table.findIndex((r) => r.squadId === clubId);
  if (i < 0) return [];
  const start = Math.max(0, Math.min(i - Math.floor(size / 2), table.length - size));
  return table.slice(start, start + size).map((r, k) => ({ position: start + k + 1, squadId: r.squadId, name: r.name, points: r.pts }));
}

/** His stage in a cup or continental competition: alive, out or champion, the group place, the first leg of a tie. */
export function knockoutComp(slug: string, meta: LeagueSeasonMeta, fixtures: readonly Fixture[], clubId: string): RivalComp | null {
  const cont = meta.continental;
  const cup = meta.cup;
  if (!cont && !cup) return null;
  const kind = cont ? "continental" : "cup";
  const mine = fixtures.filter((f) => f.home === clubId || f.away === clubId).sort((a, b) => a.date.localeCompare(b.date));
  if (mine.length === 0) return null;
  const last = mine.filter((f) => f.played).at(-1) ?? mine[0]!;
  const latest = mine.find((f) => !f.played) ?? last;
  const championId = cont?.championId ?? cup?.championId ?? null;
  const state = championId === clubId ? "champion" : outOfCompetition(fixtures, clubId, championId) ? "out" : "alive";
  const nextDate = state === "alive" ? nextDateOf(mine) : undefined;
  const base = { slug, kind, state, ...(nextDate ? { nextDate } : {}) } as const;

  if (cont) {
    const stage = cont.stages.find((s) => s.rounds.includes(latest.round));
    if (!stage) return null;
    if (stage.name === "group") {
      const group = cont.groups.find((g) => g.clubs.includes(clubId));
      if (!group) return null;
      const rows = groupTable(group.clubs, fixtures.filter((f) => stage.rounds.includes(f.round)));
      return { ...base, stage: "group", group: group.name, position: rows.findIndex((r) => r.squadId === clubId) + 1 };
    }
    const leg1 = mine.find((f) => f.tieId && f.tieId === latest.tieId && f.leg === 1);
    const leg2 = mine.find((f) => f.tieId && f.tieId === latest.tieId && f.leg === 2);
    const firstLeg = state === "alive" && leg1?.played && leg1.result && leg2 && !leg2.played
      ? leg1.home === clubId
        ? { for: leg1.result.home, against: leg1.result.away }
        : { for: leg1.result.away, against: leg1.result.home }
      : undefined;
    return { ...base, stage: stage.name, ...(firstLeg ? { firstLeg } : {}) };
  }
  const stage = cup!.stages.find((s) => s.round === latest.round);
  return stage ? { ...base, stage: stage.name } : null;
}
