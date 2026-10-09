import { addDays } from "@/Domain/dates";
import { YOUTH_COMP } from "@/Domain/youthComps/youthCompConfig";
import { youthCompSlugOf } from "@/Domain/youthComps/youthCompIds";
import { roundRobinPairings, scheduleYouthSeason } from "@/Domain/youthComps/youthSchedule";
import type { CountryLeagueState } from "@/Domain/cups/cupRollover";
import type {
  Fixture,
  LeagueCalendarResult,
  LeagueDateIndex,
  LeagueSeasonMeta,
  RoundFixtures,
  SeasonArchive,
} from "@/types/calendarTypes";
import type { LeagueTeam, StandingRow } from "@/types/playerTypes";
import type { YouthCompAge, YouthCompMetaData } from "@/types/youthCompTypes";

export interface GenerateYouthCompInput {
  country: string;
  age: YouthCompAge;
  year: number;
  /** Tier-1 league clubs, already ordered. */
  clubs: string[];
  teams: YouthCompMetaData["teams"];
  /** Already with the margin (`youthWindow`). */
  window: { start: string; end: string };
  busyByClub: Map<string, Set<string>>;
  /** Shuffle seed of the pairings (`${saveId}:${year}:${slug}`). */
  seedKey: string;
}

/** Youth season window: `[league start + margin, league end − margin]`, never before tomorrow. */
export function youthWindow(leagueStart: string, leagueEnd: string, today?: string): { start: string; end: string } {
  const margin = YOUTH_COMP.WINDOW_MARGIN_DAYS;
  let start = addDays(leagueStart, margin);
  if (today && addDays(today, 1) > start) start = addDays(today, 1);
  return { start, end: addDays(leagueEnd, -margin) };
}

/** A new youth competition season (meta + round files + date index), or `null` when it cannot exist. */
export function generateYouthComp(input: GenerateYouthCompInput): LeagueCalendarResult | null {
  const { country, age, year, clubs, teams, window, busyByClub, seedKey } = input;
  if (clubs.length < 2) return null;
  const slug = youthCompSlugOf(country, age);
  const schedule = scheduleYouthSeason({ rounds: roundRobinPairings(clubs, seedKey), window, busyByClub, age });
  if (!schedule || schedule.fixtures.length === 0) return null;

  const byRound = new Map<number, Fixture[]>();
  for (const f of schedule.fixtures) {
    const list = byRound.get(f.round) ?? [];
    list.push({
      id: `${slug}_${year}_r${f.round}_${list.length}`,
      date: f.date,
      competition: slug,
      round: f.round,
      home: f.home,
      away: f.away,
      played: false,
      result: null,
    });
    byRound.set(f.round, list);
  }
  const totalRounds = schedule.roundDates.length;
  const rounds: RoundFixtures[] = [];
  for (let r = 1; r <= totalRounds; r++) rounds.push({ leagueSlug: slug, round: r, fixtures: byRound.get(r) ?? [] });

  const dateIndex: LeagueDateIndex = {};
  for (const rf of rounds) {
    for (const date of new Set(rf.fixtures.map((f) => f.date))) {
      (dateIndex[date] ??= []).push(rf.round);
    }
  }
  const dates = schedule.fixtures.map((f) => f.date).sort();

  const meta: LeagueSeasonMeta = {
    leagueSlug: slug,
    year,
    start: dates[0]!,
    end: dates.at(-1)!,
    totalRounds,
    kind: "youth",
    youth: {
      country,
      age,
      clubs: [...clubs],
      ...(schedule.singleLeg ? { singleLeg: true as const } : {}),
      teams,
      leaders: {},
      championId: null,
    },
  };
  return { meta, rounds, dateIndex };
}

export interface YouthCompToRegenerate {
  country: string;
  year: number;
  window: { start: string; end: string };
}

/**
 * Countries whose youth competitions must be regenerated: the country has them (`youthYear`) and its
 * tier-1 league is already in a later season. The window keeps the margin (`youthWindow`).
 */
export function youthCompsToRegenerate(
  tier1States: CountryLeagueState[],
  youthYear: Record<string, number>,
  today?: string,
): YouthCompToRegenerate[] {
  const out: YouthCompToRegenerate[] = [];
  for (const s of [...tier1States].sort((a, b) => a.country.localeCompare(b.country))) {
    const year = youthYear[s.country];
    if (year === undefined || s.year <= year) continue;
    out.push({ country: s.country, year: s.year, window: youthWindow(s.start, s.end, today) });
  }
  return out;
}

/** Base rows of the youth table, in the order of `meta.youth.clubs`. */
export function youthStandingsBase(meta: LeagueSeasonMeta): LeagueTeam[] {
  const youth = meta.youth;
  if (!youth) return [];
  return youth.clubs.map((id) => ({
    squadId: id,
    name: youth.teams[id]?.name ?? id,
    colors: youth.teams[id]?.colors ?? ["#666666", "#ffffff"],
  }));
}

/** Champion: first of the table with games played, or `null`. */
export function youthChampion(standings: StandingRow[]): string | null {
  const first = standings[0];
  return first && first.mp > 0 ? first.squadId : null;
}

/** Season archive of a youth competition: the final table and one title for the champion. */
export function buildYouthCompArchive(meta: LeagueSeasonMeta, standings: StandingRow[]): SeasonArchive {
  const championId = meta.youth?.championId ?? youthChampion(standings);
  return {
    leagueSlug: meta.leagueSlug,
    year: meta.year,
    start: meta.start,
    end: meta.end,
    standings,
    titles: championId
      ? [
          {
            competition: meta.leagueSlug,
            clubId: championId,
            clubName: meta.youth?.teams[championId]?.name ?? championId,
            coachId: null,
            coachName: "",
          },
        ]
      : [],
    playerLogs: {},
  };
}
