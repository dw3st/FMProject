import type {
  ContinentalMetaData,
  ContinentalSlug,
  ContinentalStage,
  Fixture,
  LeagueCalendarResult,
  RoundFixtures,
} from "@/types/calendarTypes";
import { CONTINENTAL } from "@/Domain/continental/competitions";
import { drawGroups, type DrawClub, type DrawnGroup } from "@/Domain/continental/groupDraw";
import { seedFrom } from "@/Domain/cups/cupIds";
import { mulberry32 } from "@/Domain/rng";

export interface GenerateContinentalArgs {
  slug: ContinentalSlug;
  year: number;
  /** Exactly 32 clubs (qualifiers of both the primary and secondary competitions are drawn separately). */
  clubs: DrawClub[];
  /** Exactly 13 dates: 6 group rounds + r16(2) + qf(2) + sf(2) + final(1). */
  dates: string[];
  /** Deterministic seed base, e.g. `${saveId}:${year}:${slug}`. */
  seedKey: string;
}

const GROUP_ROUNDS = 6;
const TOTAL_ROUNDS = 13;

/**
 * Round-robin pattern for a group's 4 clubs `[p1, p2, p3, p4]` (pot order, pot 1 first). Each pair
 * meets exactly twice, once at each home, and every round fields all 4 clubs exactly once.
 * Indices are into the group's `clubs` array (0=p1 .. 3=p4); each tuple is `[homeIndex, awayIndex]`.
 */
const GROUP_ROUND_PAIRS: [number, number][][] = [
  [[0, 3], [1, 2]], // r1: p1-p4, p2-p3
  [[2, 0], [3, 1]], // r2: p3-p1, p4-p2
  [[0, 1], [2, 3]], // r3: p1-p2, p3-p4
  [[3, 0], [2, 1]], // r4: p4-p1, p3-p2
  [[0, 2], [1, 3]], // r5: p1-p3, p2-p4
  [[1, 0], [3, 2]], // r6: p2-p1, p4-p3
];

function groupStageRounds(
  slug: ContinentalSlug,
  year: number,
  groups: DrawnGroup[],
  dates: string[],
): RoundFixtures[] {
  return GROUP_ROUND_PAIRS.map((pairs, i) => {
    const round = i + 1;
    const date = dates[i]!;
    const fixtures: Fixture[] = [];
    for (const group of groups) {
      for (const [homeIdx, awayIdx] of pairs) {
        fixtures.push({
          id: `${slug}_${year}_r${round}_${fixtures.length + 1}`,
          date,
          competition: slug,
          round,
          home: group.clubs[homeIdx]!,
          away: group.clubs[awayIdx]!,
          played: false,
          result: null,
        });
      }
    }
    return { leagueSlug: slug, round, fixtures };
  });
}

/**
 * New continental competition season: groups drawn (pots + country rule), 6 group-stage rounds of
 * fixtures, and empty round files for the 7 knockout rounds (drawn later as each stage completes —
 * see `continentalProgress.ts`).
 */
export function generateContinental(a: GenerateContinentalArgs): LeagueCalendarResult {
  if (a.clubs.length !== 32) {
    throw new Error(`generateContinental: need 32 clubs, got ${a.clubs.length}`);
  }
  if (a.dates.length !== TOTAL_ROUNDS) {
    throw new Error(`generateContinental: need ${TOTAL_ROUNDS} dates, got ${a.dates.length}`);
  }
  for (let i = 1; i < a.dates.length; i++) {
    if (!(a.dates[i]! > a.dates[i - 1]!)) {
      throw new Error(
        `generateContinental: dates must be strictly increasing and unique, got ` +
          `"${a.dates[i - 1]}" then "${a.dates[i]}" at index ${i}`,
      );
    }
  }

  const comp = CONTINENTAL[a.slug];
  const groups = drawGroups(a.clubs, mulberry32(seedFrom(`${a.seedKey}:groups`)));
  const countryOf = Object.fromEntries(a.clubs.map((c) => [c.id, c.country]));
  const level = Object.fromEntries(a.clubs.map((c) => [c.id, c.level]));

  const stages: ContinentalStage[] = [
    { name: "group", rounds: [1, 2, 3, 4, 5, 6], dates: a.dates.slice(0, 6), drawn: true },
    { name: "r16", rounds: [7, 8], dates: a.dates.slice(6, 8), drawn: false },
    { name: "qf", rounds: [9, 10], dates: a.dates.slice(8, 10), drawn: false },
    { name: "sf", rounds: [11, 12], dates: a.dates.slice(10, 12), drawn: false },
    { name: "final", rounds: [13], dates: a.dates.slice(12, 13), drawn: false },
  ];

  const groupRounds = groupStageRounds(a.slug, a.year, groups, a.dates.slice(0, GROUP_ROUNDS));
  const knockoutRounds: RoundFixtures[] = [];
  for (let round = GROUP_ROUNDS + 1; round <= TOTAL_ROUNDS; round++) {
    knockoutRounds.push({ leagueSlug: a.slug, round, fixtures: [] });
  }
  const rounds = [...groupRounds, ...knockoutRounds];

  const dateIndex = Object.fromEntries(a.dates.map((d, i) => [d, [i + 1]]));

  const continental: ContinentalMetaData = {
    competition: a.slug,
    continent: comp.continent,
    groups,
    stages,
    countryOf,
    level,
    championId: null,
  };

  return {
    meta: {
      leagueSlug: a.slug,
      year: a.year,
      start: a.dates[0]!,
      end: a.dates[TOTAL_ROUNDS - 1]!,
      totalRounds: TOTAL_ROUNDS,
      kind: "continental",
      continental,
    },
    rounds,
    dateIndex,
  };
}
