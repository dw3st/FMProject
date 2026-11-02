import { nationalCompetitionName } from "@/Domain/world/labels";
import type { ManagerRecord } from "@/types/managerTypes";

/** One title in the world's history, with the manager who held the job that day (`GET /api/saves/:saveId/champions`). */
export interface ChampionTitle {
  competition: string;
  /** Season label: "2026-27" or "2027". */
  season: string;
  on?: string;
  squadId: string;
  clubName: string;
  /** The league the club plays in now (link to its squad); null for a national team or a club no longer in the save. */
  league: string | null;
  /** The nation, when the champion is a national team. */
  nation: string | null;
  managerName: string;
  human: boolean;
}

export interface ChampionClubInfo {
  name: string;
  league: string | null;
  nation: string | null;
}

/** Every title of every manager, promotions left out; the same title credited twice counts once. */
export function championTitles(
  managers: readonly ManagerRecord[],
  clubOf: (squadId: string) => ChampionClubInfo,
): ChampionTitle[] {
  const seen = new Set<string>();
  const out: ChampionTitle[] = [];
  for (const m of managers) {
    for (const t of m.titles) {
      if (t.kind === "promotion") continue;
      const key = `${t.competition}|${t.season}|${t.squadId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const club = clubOf(t.squadId);
      out.push({
        competition: t.competition,
        season: t.season,
        ...(t.on ? { on: t.on } : {}),
        squadId: t.squadId,
        clubName: club.name,
        league: club.league,
        nation: club.nation,
        managerName: m.name,
        human: !!m.seatId,
      });
    }
  }
  return out;
}

/** "2026-27" and "2027" both end in 2027: the column they share. */
export function seasonEndYear(season: string): number {
  const m = /^(\d{4})-\d{2}$/.exec(season);
  return m ? Number(m[1]) + 1 : Number(season);
}

/** Column header of an end year: 2027 reads "2026-27". */
export function seasonColumnLabel(endYear: number): string {
  return `${endYear - 1}-${String(endYear % 100).padStart(2, "0")}`;
}

/** A board row: `wc_2030` and `wc_2034` are one row, "wc"; any other competition is its own slug. */
export function championRowKey(competition: string): string {
  return /^(wc|euro|copa)_\d{4}$/.exec(competition)?.[1] ?? competition;
}

/** The national tournaments' row keys, in display order. */
export const NATIONAL_ROW_KEYS = ["wc", "euro", "copa"] as const;

/** Name of a national tournament's row ("Copa do Mundo", no year); null for any other key. */
export function nationalRowName(key: string, lang: string): string | null {
  if (!(NATIONAL_ROW_KEYS as readonly string[]).includes(key)) return null;
  return nationalCompetitionName(`${key}_2000`, lang)?.replace(/ \d{4}$/, "") ?? null;
}

export interface ChampionRowSpec {
  key: string;
  /** Section the row belongs to in the board. */
  group?: string;
}

export interface ChampionBoardRow extends ChampionRowSpec {
  cells: Map<number, ChampionTitle>;
}

export interface ChampionBoard {
  /** End years, oldest first: only those with a title in a shown row. */
  columns: number[];
  rows: ChampionBoardRow[];
}

/** The board of the chosen rows, in their order: a row without any title is left out. */
export function championBoard(titles: readonly ChampionTitle[], specs: readonly ChampionRowSpec[]): ChampionBoard {
  const byRow = new Map<string, ChampionTitle[]>();
  for (const t of titles) {
    const key = championRowKey(t.competition);
    const list = byRow.get(key);
    if (list) list.push(t);
    else byRow.set(key, [t]);
  }
  const years = new Set<number>();
  const rows: ChampionBoardRow[] = [];
  for (const spec of specs) {
    const list = byRow.get(spec.key);
    if (!list) continue;
    const cells = new Map<number, ChampionTitle>();
    for (const t of list) {
      const year = seasonEndYear(t.season);
      cells.set(year, t);
      years.add(year);
    }
    rows.push({ ...spec, cells });
  }
  return { columns: [...years].sort((a, b) => a - b), rows };
}

/** The titles of one board row, newest first. */
export function competitionHistory(titles: readonly ChampionTitle[], key: string): ChampionTitle[] {
  return titles
    .filter((t) => championRowKey(t.competition) === key)
    .sort((a, b) => seasonEndYear(b.season) - seasonEndYear(a.season));
}

export interface ClubTitleCount {
  title: ChampionTitle;
  count: number;
}

/** Who won it most: by count, then by the most recent title (the list comes newest first). */
export function mostTitles(history: readonly ChampionTitle[]): ClubTitleCount[] {
  const byClub = new Map<string, ClubTitleCount>();
  for (const title of history) {
    const entry = byClub.get(title.squadId);
    if (entry) entry.count += 1;
    else byClub.set(title.squadId, { title, count: 1 });
  }
  return [...byClub.values()].sort((a, b) => b.count - a.count);
}
