import { addOneDay } from "@/Domain/advanceDay/date";
import type { CountryPyramid, PyramidGroup } from "@/types/pyramidTypes";
import type { StandingRow } from "@/types/playerTypes";

export interface ClubMove { squadId: string; from: string; to: string; kind: "promoted" | "relegated" }

const byStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Final standings per league (already sorted, index 0 = champion) → moves.
 * Relegated clubs from level N are distributed over the groups of N+1 one by one, each time to the
 * group that is most short of clubs *after already-applied moves*, so group sizes stay balanced.
 * Promoted clubs from N+1 are distributed over the groups of N the same way.
 *
 * "Most short" = lowest net balance (arrivals so far − clubs leaving the group), then fewest clubs
 * (table size − leaving + arrivals), then slug order. Ranking by net balance first means every group
 * gets back as many clubs as it loses, so a coherent pyramid keeps each group at its current size
 * (e.g. Italy: the 3 clubs relegated from B go one to each Serie C group).
 *
 * A league with no standings (e.g. no games played) neither sends nor receives clubs (console.warn);
 * a boundary with no usable group on one side moves nobody.
 *
 * Output order: for each level top → bottom, its relegations (group slug order, then table position),
 * then the promotions from the level below into it (same order). Throws if a club would move twice.
 */
export function planPromotionRelegation(
  pyramid: CountryPyramid,
  standings: Record<string, StandingRow[]>,
): ClubMove[] {
  const usable = (grp: PyramidGroup) => (standings[grp.leagueSlug]?.length ?? 0) > 0;
  for (const lv of pyramid.levels)
    for (const grp of lv.groups)
      if (!usable(grp)) console.warn(`[promotion] ${pyramid.country}: ${grp.leagueSlug} has no standings — no clubs move from or to it`);

  const levels = pyramid.levels.map((lv) => [...lv.groups].filter(usable).sort((a, b) => byStr(a.leagueSlug, b.leagueSlug)));
  const table = (grp: PyramidGroup) => standings[grp.leagueSlug]!;

  // Clubs leaving each group, per boundary (none if the other side has no usable group).
  const leaving = new Map<string, { up: StandingRow[]; down: StandingRow[] }>();
  levels.forEach((groups, n) => {
    const hasAbove = n > 0 && levels[n - 1]!.length > 0;
    const hasBelow = n + 1 < levels.length && levels[n + 1]!.length > 0;
    for (const grp of groups) {
      const rows = table(grp);
      const up = hasAbove ? rows.slice(0, Math.min(grp.promote, rows.length)) : [];
      const down = hasBelow && grp.relegate > 0 ? rows.slice(Math.max(0, rows.length - grp.relegate)) : [];
      leaving.set(grp.leagueSlug, { up, down });
    }
  });

  const size = new Map<string, number>();
  const net = new Map<string, number>();
  for (const groups of levels)
    for (const grp of groups) {
      const l = leaving.get(grp.leagueSlug)!;
      size.set(grp.leagueSlug, table(grp).length - l.up.length - l.down.length);
      net.set(grp.leagueSlug, -(l.up.length + l.down.length));
    }
  const shorter = (a: PyramidGroup, b: PyramidGroup) =>
    net.get(a.leagueSlug)! - net.get(b.leagueSlug)! || size.get(a.leagueSlug)! - size.get(b.leagueSlug)!;

  const moved = new Set<string>();
  const moves: ClubMove[] = [];
  const assign = (row: StandingRow, from: string, targets: PyramidGroup[], kind: ClubMove["kind"]) => {
    if (moved.has(row.squadId)) throw new Error(`[promotion] ${pyramid.country}: ${row.squadId} would move twice in one transition`);
    moved.add(row.squadId);
    let best = targets[0]!;
    for (const t of targets) if (shorter(t, best) < 0) best = t;
    size.set(best.leagueSlug, size.get(best.leagueSlug)! + 1);
    net.set(best.leagueSlug, net.get(best.leagueSlug)! + 1);
    moves.push({ squadId: row.squadId, from, to: best.leagueSlug, kind });
  };

  levels.forEach((groups, n) => {
    const below = levels[n + 1] ?? [];
    for (const grp of groups) for (const row of leaving.get(grp.leagueSlug)!.down) assign(row, grp.leagueSlug, below, "relegated");
    for (const grp of below) for (const row of leaving.get(grp.leagueSlug)!.up) assign(row, grp.leagueSlug, groups, "promoted");
  });
  return moves;
}

/**
 * True when every league of the country has reached its season end: the day `date` has just been
 * played and the next day is past `end` — the same "league ended" check advanceDay uses
 * (`addOneDay(currentDate) > end`). Country leagues missing from `activeLeagues` are not simulated
 * and do not block; a country with no active league is never ready.
 */
export function countryReadyForTransition(
  countryLeagueSlugs: string[],
  activeLeagues: Array<{ leagueSlug: string; end: string }>,
  date: string,
): boolean {
  const nextDate = addOneDay(date);
  const mine = activeLeagues.filter((l) => countryLeagueSlugs.includes(l.leagueSlug));
  return mine.length > 0 && mine.every((l) => nextDate > l.end);
}
