import type { CupMetaData, CupStage, Fixture, LeagueCalendarResult, RoundFixtures } from "@/types/calendarTypes";
import { cupSlugOf } from "@/Domain/cups/cupIds";
import { planStages } from "@/Domain/cups/cupStructure";
import { scheduleStageDates } from "@/Domain/cups/cupDates";
import { drawTies, type CupEntrant } from "@/Domain/cups/cupDraw";
import { mulberry32, seedFrom } from "@/Domain/rng";

export interface GenerateCupArgs {
  country: string;
  year: number;
  clubs: CupEntrant[];
  /** The country's league season window. */
  window: { start: string; end: string };
  /** Dates any club of the country plays a league game. */
  busyDates: Set<string>;
  /** Deterministic seed base, e.g. `${saveId}:${year}:${country}`. */
  seedKey: string;
}

/** Fixtures of a drawn stage. */
export function stageFixtures(slug: string, year: number, stage: CupStage, ties: ReturnType<typeof drawTies>): Fixture[] {
  return ties.map((t, i) => ({
    id: `${slug}_${year}_r${stage.round}_${i + 1}`,
    date: stage.date,
    competition: slug,
    round: stage.round,
    home: t.home,
    away: t.away,
    played: false,
    result: null,
    knockout: true,
    ...(t.neutral ? { neutral: true as const } : {}),
  }));
}

/** New national cup for one country and season: all stages dated, stage 1 drawn. */
export function generateCup(a: GenerateCupArgs): LeagueCalendarResult | null {
  const plan = planStages(a.clubs.length);
  if (!plan) return null;
  const slug = cupSlugOf(a.country);
  const tiers = Object.fromEntries(a.clubs.map((c) => [c.id, c.tier]));

  // Lowest level first (higher tier number), then id — deterministic.
  const byLevel = [...a.clubs].sort((x, y) => y.tier - x.tier || x.id.localeCompare(y.id, undefined, { numeric: true }));
  const firstEntrants = plan.preliminaryClubs > 0 ? byLevel.slice(0, plan.preliminaryClubs) : byLevel;
  const byes = plan.preliminaryClubs > 0 ? byLevel.slice(plan.preliminaryClubs).map((c) => c.id) : [];

  const dates = scheduleStageDates(a.window.start, a.window.end, plan.stageNames.length, a.busyDates);
  const stages: CupStage[] = plan.stageNames.map((name, i) => ({
    round: i + 1, name, date: dates[i]!, entrants: [], drawn: false,
  }));

  const first = stages[0]!;
  const ties = drawTies(firstEntrants, mulberry32(seedFrom(`${a.seedKey}:1`)), first.name === "final");
  stages[0] = { ...first, entrants: firstEntrants.map((c) => c.id), drawn: true };

  const rounds: RoundFixtures[] = stages.map((s, i) => ({
    leagueSlug: slug,
    round: s.round,
    fixtures: i === 0 ? stageFixtures(slug, a.year, stages[0]!, ties) : [],
  }));
  const dateIndex = Object.fromEntries(stages.map((s) => [s.date, [s.round]]));
  const cup: CupMetaData = { country: a.country, stages, byes, tiers, championId: null };

  return {
    meta: {
      leagueSlug: slug, year: a.year,
      start: stages[0]!.date, end: stages[stages.length - 1]!.date,
      totalRounds: stages.length, kind: "cup", cup,
    },
    rounds,
    dateIndex,
  };
}
