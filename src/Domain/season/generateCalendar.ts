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

const BYE = "__bye__";

/**
 * First-leg pairings `[home, away]` of a double round robin by the circle method (the second leg
 * mirrors them with the venues swapped). Venues follow the canonical pattern: the fixed club
 * alternates home/away round by round, the other pairs by board position; then the round order
 * starts two rounds into the cycle, so no club ever plays more than two games in a row at home or
 * away — the turn of the legs included — and every club is home in half its first-leg games (±1).
 * Odd number of clubs: the rest slot is the fixed position (one club rests each round). Before
 * 4.21.1 the fixed club played every first-leg game at home and every club ran long home/away streaks.
 */
export function firstLegPairings(teamIds: string[]): [string, string][][] {
  const teams = [...teamIds];
  if (teams.length % 2 !== 0) teams.unshift(BYE);
  const n = teams.length;
  const legs: [string, string][][] = [];
  let current = teams;
  for (let r = 0; r < n - 1; r++) {
    const round: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = current[i]!;
      const b = current[n - 1 - i]!;
      if (a === BYE || b === BYE) continue;
      const aHome = i === 0 ? r % 2 === 0 : i % 2 === 1;
      round.push(aHome ? [a, b] : [b, a]);
    }
    legs.push(round);
    current = circleRotate(current);
  }
  // Starting two rounds in keeps the leg's only break of each club away from its first and last
  // round, where the mirrored second leg would extend it to three (not possible with 4 clubs).
  const shift = n >= 6 ? 2 : 0;
  return [...legs.slice(shift), ...legs.slice(0, shift)];
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
function fitRoundsToWindow(dates: string[], start: string, end: string, matchDays: number[]): string[] {
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

/** Minimum days between two rounds of the same league when the calendar has blocked days. */
export const MIN_ROUND_GAP = 3;
const MIDWEEK = [2, 3, 4];

/**
 * Pure: round dates of a league whose window has blocked days (FIFA windows, the summer tournament —
 * `.claude/rules/game/national-teams.md`). The rounds are spread over the FREE days of [start, end] (round r targets
 * the free day of index (r−1)(L−1)/(R−1), plus the league's offset), each goes to the nearest free match day of the
 * league within ±3 days that is at least `MIN_ROUND_GAP` days after the previous round, else the nearest free
 * midweek day (Tue–Thu), else any free day. When the last rounds would overflow `end`, the free span the targets
 * are spread over shrinks one day at a time until everything fits.
 */
export function placeRoundsAroundBlocks(
  rounds: number,
  start: string,
  end: string,
  config: Pick<LeagueScheduleConfig, "matchDays" | "baseWeekOffset">,
  blocked: ReadonlySet<string>,
): string[] {
  const free: string[] = [];
  for (let d = start; d <= end; d = shiftIso(d, 1)) if (!blocked.has(d)) free.push(d);
  if (free.length === 0 || rounds === 0) return [];
  const isFree = (d: string) => d >= start && d <= end && !blocked.has(d);
  const gapOk = (d: string, prev: string | null) => prev === null || isoToMs(d) - isoToMs(prev) >= MIN_ROUND_GAP * DAY_MS;
  const tiers: ((d: string) => boolean)[] = [
    (d) => isMatchDay(d, config.matchDays),
    (d) => MIDWEEK.includes(new Date(isoToMs(d)).getUTCDay()),
    () => true,
  ];
  // Greedy over the first `span` free days; null when the rounds do not fit before `end`.
  const forward = (span: number): string[] | null => {
    const out: string[] = [];
    let prev: string | null = null;
    for (let r = 0; r < rounds; r++) {
      const idx = rounds > 1 ? Math.round((r * (span - 1)) / (rounds - 1)) : 0;
      let target = shiftIso(free[idx]!, config.baseWeekOffset % 7);
      if (target > free[span - 1]!) target = free[idx]!;
      let pick: string | null = null;
      for (let t = 0; t < tiers.length && !pick; t++) {
        const ok = tiers[t]!;
        const reach = t === 0 ? 4 : t === 1 ? 3 : 10;
        for (let k = 0; k <= reach && !pick; k++) {
          for (const d of k === 0 ? [target] : [shiftIso(target, -k), shiftIso(target, k)]) {
            if (isFree(d) && gapOk(d, prev) && ok(d)) { pick = d; break; }
          }
        }
      }
      if (!pick) {
        let d: string = prev ? shiftIso(prev, MIN_ROUND_GAP) : start;
        while (d <= end && !isFree(d)) d = shiftIso(d, 1);
        if (d > end) return null;
        pick = d;
      }
      out.push(pick as string);
      prev = pick;
    }
    return out;
  };
  for (let span = free.length; span >= 1; span--) {
    const out = forward(span);
    if (out) return out;
  }
  // Never fits even packed (not seen with real windows): the rounds every free day in order.
  return Array.from({ length: rounds }, (_, i) => free[Math.min(i, free.length - 1)]!);
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
  opts: { blocked?: ReadonlySet<string> } = {},
): LeagueCalendarResult {
  const seasonStart = leagueSeasonStart(config, year);
  const seasonEnd   = leagueSeasonEnd(config, year);

  const n = teamIds.length + (teamIds.length % 2);
  const roundsPerLeg  = n - 1;
  const totalRounds   = roundsPerLeg * 2;

  // First-leg pairings (circle method, alternating venues); the second leg mirrors them.
  const firstLeg = firstLegPairings(teamIds);

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
  const blocked = opts.blocked;
  const anyBlocked = !!blocked && [...blocked].some((d) => d >= seasonStart && d <= seasonEnd);
  const roundDates = anyBlocked
    ? placeRoundsAroundBlocks(totalRounds, seasonStart, seasonEnd, config, blocked!)
    : fitRoundsToWindow(
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
    for (const [home, away] of firstLeg[r]!) {
      fixtures.push({ id: makeId(), date, competition: config.slug, round: roundNumber, home, away, played: false, result: null });
    }
    roundsMap.set(roundNumber, fixtures);
  }

  // Second leg — reversed home/away
  for (let r = 0; r < roundsPerLeg; r++) {
    const roundNumber = roundsPerLeg + r + 1;
    const date = roundDates[roundNumber - 1]!;
    const fixtures: Fixture[] = [];
    for (const [away, home] of firstLeg[r]!) {
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
