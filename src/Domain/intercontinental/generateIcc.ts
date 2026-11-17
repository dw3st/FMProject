import type {
  IccConfed, IccEntrant, IccMatch, LeagueCalendarResult, LeagueDateIndex, LeagueSeasonMeta, RoundFixtures, SeasonArchive,
} from "@/types/calendarTypes";
import { buildKnockoutSeasonArchive } from "@/Domain/cups/cupRollover";
import { ICC_SLUG } from "@/Domain/intercontinental/iccConfig";
import { iccFixture, initialMatches, stepBracket, type IccStep } from "@/Domain/intercontinental/bracket";

/** Round files and date index of the bracket: one file per match (empty until its two clubs are known). */
export function iccRounds(year: number, matches: IccMatch[]): { rounds: RoundFixtures[]; dateIndex: LeagueDateIndex } {
  const rounds: RoundFixtures[] = [];
  const dateIndex: LeagueDateIndex = {};
  for (const m of [...matches].sort((a, b) => a.n - b.n)) {
    const live = !m.done && typeof m.home === "string" && typeof m.away === "string";
    rounds.push({ leagueSlug: ICC_SLUG, round: m.round, fixtures: live ? [iccFixture(year, m)] : [] });
    if (!m.bye) (dateIndex[m.date] ??= []).push(m.round);
  }
  return { rounds, dateIndex };
}

/**
 * A new edition: meta (the bracket with its byes already settled), the five round files and the date index.
 * `dates` = `iccDates(...)`; the edition runs from `start` (generation day) to the final.
 */
export function generateIcc(args: {
  year: number;
  start: string;
  dates: string[];
  entrants: Record<IccConfed, IccEntrant>;
  countryOf: Record<string, string>;
  pastYears: number[];
}): LeagueCalendarResult & { step: IccStep } {
  const step = stepBracket(initialMatches(args.dates), args.entrants, {});
  const { rounds, dateIndex } = iccRounds(args.year, step.matches);
  const meta: LeagueSeasonMeta = {
    leagueSlug: ICC_SLUG,
    year: args.year,
    start: args.start,
    end: args.dates[args.dates.length - 1] ?? args.start,
    totalRounds: 5,
    kind: "intercontinental",
    intercontinental: {
      year: args.year, entrants: args.entrants, matches: step.matches, countryOf: args.countryOf,
      championId: step.championId, pastYears: args.pastYears,
    },
  };
  return { meta, rounds, dateIndex, step };
}

/** Archive of a finished edition: one title (the champion) and the bracket, for the past-years view. */
export function buildIccArchive(
  meta: LeagueSeasonMeta,
  clubInfo: (squadId: string) => { name: string; coachId: number | null; coachName: string },
  fixtures: RoundFixtures["fixtures"],
): SeasonArchive {
  return {
    ...buildKnockoutSeasonArchive(meta, meta.intercontinental?.championId ?? null, clubInfo),
    calendar: fixtures,
    ...(meta.intercontinental ? { intercontinental: meta.intercontinental } : {}),
  };
}
