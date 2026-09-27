import type { LeagueSeasonMeta, SeasonArchive } from "@/types/calendarTypes";

export interface CountryLeagueState { leagueSlug: string; country: string; year: number; start: string; end: string }

export interface CupToRegenerate { country: string; year: number; window: { start: string; end: string } }

/**
 * Countries whose cup must be regenerated: the country has a cup (`cupYear`) and every league of the
 * country is already in a later season. The new cup takes the earliest year and the widest window.
 */
export function countriesToRegenerate(
  leagues: CountryLeagueState[],
  cupYear: Record<string, number>,
): CupToRegenerate[] {
  const byCountry = new Map<string, CountryLeagueState[]>();
  for (const l of leagues) byCountry.set(l.country, [...(byCountry.get(l.country) ?? []), l]);
  const out: CupToRegenerate[] = [];
  for (const [country, ls] of [...byCountry].sort(([a], [b]) => a.localeCompare(b))) {
    const year = cupYear[country];
    if (year === undefined || !ls.every((l) => l.year > year)) continue;
    out.push({
      country,
      year: Math.min(...ls.map((l) => l.year)),
      window: {
        start: ls.map((l) => l.start).sort()[0]!,
        end: ls.map((l) => l.end).sort().at(-1)!,
      },
    });
  }
  return out;
}

/**
 * Season archive of a finished no-table knockout competition (national cup or continental
 * competition): no standings, at most one title (the champion, if there is one). Shared by
 * `buildCupArchive` (below) and `buildContinentalArchive`
 * (`src/Domain/continental/continentalProgress.ts`) — the two only differ in where they read the
 * champion's squad id from (`meta.cup.championId` vs `meta.continental.championId`).
 */
export function buildKnockoutSeasonArchive(
  meta: Pick<LeagueSeasonMeta, "leagueSlug" | "year" | "start" | "end">,
  championId: string | null,
  clubInfo: (squadId: string) => { name: string; coachId: number | null; coachName: string },
): SeasonArchive {
  return {
    leagueSlug: meta.leagueSlug,
    year: meta.year,
    start: meta.start,
    end: meta.end,
    standings: [],
    titles: championId
      ? [(() => {
          const info = clubInfo(championId);
          return {
            competition: meta.leagueSlug,
            clubId: championId,
            clubName: info.name,
            coachId: info.coachId,
            coachName: info.coachName,
          };
        })()]
      : [],
    playerLogs: {},
  };
}

/** Season archive of a finished cup (no table; one title for the champion). */
export function buildCupArchive(
  meta: LeagueSeasonMeta,
  clubInfo: (squadId: string) => { name: string; coachId: number | null; coachName: string },
): SeasonArchive {
  return buildKnockoutSeasonArchive(meta, meta.cup?.championId ?? null, clubInfo);
}
