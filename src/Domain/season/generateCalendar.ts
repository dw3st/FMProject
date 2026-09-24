import type { Fixture } from "@/types/calendarTypes";
import type { LeagueCalendarResult, LeagueDateIndex, LeagueSeasonMeta, RoundFixtures } from "@/types/calendarTypes";
import type { LeagueScheduleConfig } from "@/Domain/season/leagueScheduleConfig";
import { leagueSeasonEnd, leagueSeasonStart } from "@/Domain/season/leagueScheduleConfig";
import { generateRestDays } from "@/Domain/season/generateRestDays";

/**
 * Circle-method rotation: fix index 0, rotate the rest.
 * The last element of the tail moves to the front of the tail.
 */
function circleRotate(arr: string[]): string[] {
  if (arr.length <= 2) return arr;
  const tail = arr.slice(1);
  return [arr[0]!, tail[tail.length - 1]!, ...tail.slice(0, -1)];
}

/**
 * Generate a full double round-robin calendar.
 *
 * @param competition  Competition slug stored on each fixture.
 * @param teamIds      Squad IDs of all participating teams.
 * @param seasonStart  ISO date string for round 1.
 * @param seasonEnd    ISO date string for final round.
 */
export function generateCalendar(
  competition: string,
  teamIds: string[],
  seasonStart: string,
  seasonEnd: string,
): Fixture[] {
  const teams = [...teamIds];

  // Circle method requires an even number of teams; add a bye if odd
  if (teams.length % 2 !== 0) teams.push("__bye__");

  const n = teams.length;
  const roundsPerLeg = n - 1;
  const matchesPerRound = n / 2;
  const totalRounds = roundsPerLeg * 2;

  const startMs = new Date(seasonStart).getTime();
  const endMs = new Date(seasonEnd).getTime();
  const intervalMs = totalRounds > 1 ? (endMs - startMs) / (totalRounds - 1) : 0;

  function roundDate(roundNumber: number): string {
    const ms = startMs + intervalMs * (roundNumber - 1);
    return new Date(ms).toISOString().slice(0, 10);
  }

  // ── Build first-leg pairings ───────────────────────────────────────────────
  const firstLegPairings: [string, string][][] = [];
  let current = [...teams];

  for (let r = 0; r < roundsPerLeg; r++) {
    const round: [string, string][] = [];
    for (let i = 0; i < matchesPerRound; i++) {
      const a = current[i]!;
      const b = current[n - 1 - i]!;
      if (a !== "__bye__" && b !== "__bye__") {
        round.push([a, b]);
      }
    }
    firstLegPairings.push(round);
    current = circleRotate(current);
  }

  // ── Build fixture list ─────────────────────────────────────────────────────
  const fixtures: Fixture[] = [];
  let seq = 0;

  const makeId = () => `fix_${(++seq).toString().padStart(4, "0")}`;

  // First leg
  for (let r = 0; r < roundsPerLeg; r++) {
    const roundNumber = r + 1;
    const date = roundDate(roundNumber);
    for (const [home, away] of firstLegPairings[r]!) {
      fixtures.push({
        id: makeId(),
        date,
        competition,
        round: roundNumber,
        home,
        away,
        played: false,
        result: null,
      });
    }
  }

  // Second leg — same pairings, home/away reversed
  for (let r = 0; r < roundsPerLeg; r++) {
    const roundNumber = roundsPerLeg + r + 1;
    const date = roundDate(roundNumber);
    for (const [away, home] of firstLegPairings[r]!) {
      fixtures.push({
        id: makeId(),
        date,
        competition,
        round: roundNumber,
        home,
        away,
        played: false,
        result: null,
      });
    }
  }

  return fixtures;
}

/**
 * Snap a date to the nearest allowed day-of-week from matchDays.
 * Searches within ±3 days of the target.
 */
function snapToMatchDay(targetDate: Date, matchDays: number[]): Date {
  const dow = targetDate.getDay();
  let bestDiff = 8;
  for (const md of matchDays) {
    let diff = md - dow;
    if (diff < -3) diff += 7;
    if (diff > 3) diff -= 7;
    if (Math.abs(diff) < Math.abs(bestDiff)) bestDiff = diff;
  }
  const snapped = new Date(targetDate);
  snapped.setDate(snapped.getDate() + bestDiff);
  return snapped;
}

const DAY_MS = 86_400_000;
const isoToMs = (d: string) => Date.parse(d + "T12:00:00Z");
const msToIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const shiftIso = (d: string, days: number) => msToIso(isoToMs(d) + days * DAY_MS);
const isMatchDay = (d: string, matchDays: number[]) => matchDays.includes(new Date(isoToMs(d)).getUTCDay());

/**
 * Pure: pull round dates (ordered by round) into [start, end] and keep them strictly increasing.
 * A date past its limit moves to the latest match day on or before the limit (the limit itself
 * when no match day is within a week); a date before its floor moves to the earliest match day on
 * or after the floor (the floor itself if that would overrun the next round). Dates already inside
 * the window and in order are untouched.
 */
export function fitRoundsToWindow(dates: string[], start: string, end: string, matchDays: number[]): string[] {
  const out = [...dates];
  const latestMatchDayOnOrBefore = (limit: string) => {
    for (let k = 0; k < 7; k++) if (isMatchDay(shiftIso(limit, -k), matchDays)) return shiftIso(limit, -k);
    return limit;
  };
  const earliestMatchDayOnOrAfter = (floor: string) => {
    for (let k = 0; k < 7; k++) if (isMatchDay(shiftIso(floor, k), matchDays)) return shiftIso(floor, k);
    return floor;
  };
  for (let i = out.length - 1; i >= 0; i--) {
    const cap = i === out.length - 1 ? end : shiftIso(out[i + 1]!, -1);
    if (out[i]! > cap) out[i] = latestMatchDayOnOrBefore(cap);
  }
  for (let i = 0; i < out.length; i++) {
    const floor = i === 0 ? start : shiftIso(out[i - 1]!, 1);
    if (out[i]! < floor) {
      const cap = i === out.length - 1 ? end : shiftIso(out[i + 1]!, -1);
      const d = earliestMatchDayOnOrAfter(floor);
      out[i] = d <= cap ? d : floor;
    }
  }
  return out;
}

/**
 * Generate a multi-league calendar with per-round files and a date index.
 * Uses the league's schedule config to snap round dates to realistic match days
 * and stagger leagues via baseWeekOffset so not all leagues play on the same day.
 */
export function generateLeagueCalendar(
  config: LeagueScheduleConfig,
  teamIds: string[],
  year: number,
): LeagueCalendarResult {
  const seasonStart = leagueSeasonStart(config, year);
  const seasonEnd   = leagueSeasonEnd(config, year);

  const teams = [...teamIds];
  if (teams.length % 2 !== 0) teams.push("__bye__");

  const n = teams.length;
  const roundsPerLeg  = n - 1;
  const matchesPerRound = n / 2;
  const totalRounds   = roundsPerLeg * 2;

  // Build first-leg pairings using circle method
  const firstLegPairings: [string, string][][] = [];
  let current = [...teams];
  for (let r = 0; r < roundsPerLeg; r++) {
    const round: [string, string][] = [];
    for (let i = 0; i < matchesPerRound; i++) {
      const a = current[i]!;
      const b = current[n - 1 - i]!;
      if (a !== "__bye__" && b !== "__bye__") round.push([a, b]);
    }
    firstLegPairings.push(round);
    current = circleRotate(current);
  }

  // Compute round dates — snap each to nearest valid match day
  const startMs = new Date(seasonStart + "T12:00:00").getTime();
  const endMs   = new Date(seasonEnd   + "T12:00:00").getTime();
  const intervalMs = totalRounds > 1 ? (endMs - startMs) / (totalRounds - 1) : 0;

  const usedDates = new Set<string>();

  function roundDate(roundNumber: number): string {
    // Linear interpolation target
    let target = new Date(startMs + intervalMs * (roundNumber - 1));
    // Apply baseWeekOffset to stagger this league relative to others
    target.setDate(target.getDate() + config.baseWeekOffset);
    // Snap to nearest valid match day
    target = snapToMatchDay(target, config.matchDays);
    // Avoid date collision with another round of the same league
    let isoDate = target.toISOString().slice(0, 10);
    let safety = 0;
    while (usedDates.has(isoDate) && safety < 14) {
      target.setDate(target.getDate() + 1);
      isoDate = target.toISOString().slice(0, 10);
      safety++;
    }
    usedDates.add(isoDate);
    return isoDate;
  }

  // Every round date, in round order, kept inside [seasonStart, seasonEnd]: the offset and the
  // match-day snap can push the last rounds past the end (or the first before the start), and a
  // round dated after the end is never played — the season rolls over on its end date.
  const roundDates = fitRoundsToWindow(
    Array.from({ length: totalRounds }, (_, i) => roundDate(i + 1)),
    seasonStart,
    seasonEnd,
    config.matchDays,
  );

  // Build all fixtures grouped by round
  let seq = 0;
  const makeId = () => `fix_${(++seq).toString().padStart(4, "0")}`;

  const roundsMap = new Map<number, Fixture[]>();

  // First leg
  for (let r = 0; r < roundsPerLeg; r++) {
    const roundNumber = r + 1;
    const date = roundDates[roundNumber - 1]!;
    const fixtures: Fixture[] = [];
    for (const [home, away] of firstLegPairings[r]!) {
      fixtures.push({ id: makeId(), date, competition: config.slug, round: roundNumber, home, away, played: false, result: null });
    }
    roundsMap.set(roundNumber, fixtures);
  }

  // Second leg — reversed home/away
  for (let r = 0; r < roundsPerLeg; r++) {
    const roundNumber = roundsPerLeg + r + 1;
    const date = roundDates[roundNumber - 1]!;
    const fixtures: Fixture[] = [];
    for (const [away, home] of firstLegPairings[r]!) {
      fixtures.push({ id: makeId(), date, competition: config.slug, round: roundNumber, home, away, played: false, result: null });
    }
    roundsMap.set(roundNumber, fixtures);
  }

  // Build RoundFixtures[]
  const rounds: RoundFixtures[] = [];
  for (let r = 1; r <= totalRounds; r++) {
    rounds.push({ leagueSlug: config.slug, round: r, fixtures: roundsMap.get(r) ?? [] });
  }

  // Build LeagueDateIndex
  const dateIndex: LeagueDateIndex = {};
  for (const rf of rounds) {
    const dates = new Set(rf.fixtures.map((f) => f.date));
    for (const date of dates) {
      if (!dateIndex[date]) dateIndex[date] = [];
      dateIndex[date]!.push(rf.round);
    }
  }

  // Generate rest days from all fixtures for the player's calendar
  const allFixtures = rounds.flatMap((r) => r.fixtures);
  const restDays = generateRestDays(allFixtures);

  const meta: LeagueSeasonMeta = {
    leagueSlug:  config.slug,
    year,
    start:       seasonStart,
    end:         seasonEnd,
    totalRounds,
    restDays,
  };

  return { meta, rounds, dateIndex };
}
