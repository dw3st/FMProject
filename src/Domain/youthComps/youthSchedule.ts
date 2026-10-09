import { addDays } from "@/Domain/dates";
import { mulberry32, seedFrom, shuffle } from "@/Domain/rng";
import { YOUTH_COMP } from "@/Domain/youthComps/youthCompConfig";
import type { YouthCompAge } from "@/types/youthCompTypes";

export type Pairing = [home: string, away: string];

const BYE = "__bye__";

/** Circle-method rotation (same as generateLeagueCalendar): fix index 0, rotate the rest. */
function circleRotate(arr: string[]): string[] {
  if (arr.length <= 2) return arr;
  const tail = arr.slice(1);
  return [arr[0]!, tail[tail.length - 1]!, ...tail.slice(0, -1)];
}

/**
 * Double round robin by the circle method (the same rotation as `generateLeagueCalendar`), after a
 * seeded shuffle of the clubs; the second leg repeats the first with home and away swapped. The
 * first half of the result is always a complete first leg. Odd number of clubs: one rests each round.
 */
export function roundRobinPairings(clubIds: string[], seedKey: string): Pairing[][] {
  const teams = shuffle(clubIds, mulberry32(seedFrom(seedKey)));
  if (teams.length % 2 !== 0) teams.push(BYE);
  const n = teams.length;
  const first: Pairing[][] = [];
  let current = teams;
  for (let r = 0; r < n - 1; r++) {
    const round: Pairing[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = current[i]!;
      const b = current[n - 1 - i]!;
      if (a === BYE || b === BYE) continue;
      // Alternate the venue of the fixed club so it does not always play at home.
      round.push(i === 0 && r % 2 === 1 ? [b, a] : [a, b]);
    }
    first.push(round);
    current = circleRotate(current);
  }
  return [...first, ...first.map((r) => r.map(([h, a]) => [a, h] as Pairing))];
}

export interface ScheduledYouthFixture {
  round: number;
  home: string;
  away: string;
  date: string;
}

export interface YouthSchedule {
  fixtures: ScheduledYouthFixture[];
  /** Common day of each round (round r = index r − 1). */
  roundDates: string[];
  singleLeg: boolean;
}

const dowOf = (d: string): number => new Date(`${d}T12:00:00Z`).getUTCDay();

/** Date of weekday `dow` (0 = Sunday) in the week starting on `monday`. */
const dayOfWeek = (monday: string, dow: number): string => addDays(monday, dow === 0 ? 6 : dow - 1);

/** Mondays of the whole weeks (Monday to Sunday) inside the window. */
function weeksInside(start: string, end: string): string[] {
  let monday = addDays(start, (8 - dowOf(start)) % 7);
  const out: string[] = [];
  while (addDays(monday, 6) <= end) {
    out.push(monday);
    monday = addDays(monday, 7);
  }
  return out;
}

/** Spread `total` items over `slots` buckets as evenly as possible (`floor(i × slots / total)`). */
function spread(total: number, slots: number): number[] {
  const counts = new Array<number>(slots).fill(0);
  for (let r = 0; r < total; r++) counts[Math.floor((r * slots) / total)]!++;
  return counts;
}

/**
 * Youth season dates (spec §2.4). One round a week when the window has enough whole weeks; two a week
 * (fixed day pairs) when `2W ≥ R`; otherwise the first leg only, up to three a week; `null` when not
 * even that fits. Each round gets a common day (the cheapest preferred weekday given the clubs'
 * first-team dates); a game whose club is busy that day moves to the nearest free weekday of the same
 * week, else a free day up to `MOVE_MAX_DAYS` later (before the next round). Deterministic.
 */
export function scheduleYouthSeason(args: {
  rounds: Pairing[][];
  window: { start: string; end: string };
  /** First-team match dates of each club known at generation. */
  busyByClub: Map<string, Set<string>>;
  age: YouthCompAge;
}): YouthSchedule | null {
  const { window, busyByClub, age } = args;
  const weeks = weeksInside(window.start, window.end);
  const W = weeks.length;
  let rounds = args.rounds;
  let singleLeg = false;
  let perWeek: number[];
  if (W === 0) return null;
  if (W >= rounds.length) perWeek = spread(rounds.length, W).map((c) => Math.min(c, 1));
  else if (2 * W >= rounds.length) perWeek = spread(rounds.length, W);
  else {
    rounds = rounds.slice(0, Math.floor(rounds.length / 2));
    singleLeg = true;
    if (3 * W < rounds.length) return null;
    perWeek = spread(rounds.length, W);
  }

  const busy = (club: string, d: string): boolean => busyByClub.get(club)?.has(d) ?? false;
  const cost = (games: Pairing[], d: string): number => {
    let c = 0;
    for (const [h, a] of games) {
      if (busy(h, d) || busy(a, d)) c += YOUTH_COMP.COST.HUGE;
      for (const n of [addDays(d, -1), addDays(d, 1)]) if (busy(h, n) || busy(a, n)) c += YOUTH_COMP.COST.ADJ;
    }
    return c;
  };
  const cheapest = (games: Pairing[], candidates: string[]): string => {
    let best = candidates[0]!;
    let bestCost = Infinity;
    for (const d of candidates) {
      const c = cost(games, d);
      if (c < bestCost) {
        best = d;
        bestCost = c;
      }
    }
    return best;
  };

  // Common day of each round.
  const roundDates: string[] = [];
  let r = 0;
  weeks.forEach((monday, w) => {
    const count = perWeek[w]!;
    if (count === 0) return;
    if (count === 1) {
      const days = YOUTH_COMP.PREFERRED_DAYS[age].map((dw) => dayOfWeek(monday, dw));
      roundDates.push(cheapest(rounds[r]!, days));
    } else {
      const pattern = count === 2 ? YOUTH_COMP.TWICE_DAYS[age] : YOUTH_COMP.THRICE_DAYS;
      for (const dw of pattern) roundDates.push(dayOfWeek(monday, dw));
    }
    r += count;
  });

  // Fixtures, moving the game of a busy club.
  const youthDates = new Map<string, Set<string>>();
  const taken = (club: string, d: string) => youthDates.get(club)?.has(d) ?? false;
  const free = (h: string, a: string, d: string) => !busy(h, d) && !busy(a, d) && !taken(h, d) && !taken(a, d);
  const fixtures: ScheduledYouthFixture[] = [];
  rounds.forEach((games, i) => {
    const common = roundDates[i]!;
    const prev = i > 0 ? roundDates[i - 1]! : "";
    const next = i + 1 < roundDates.length ? roundDates[i + 1]! : addDays(window.end, 1);
    const inRange = (d: string) => d > prev && d < next && d >= window.start && d <= window.end;
    const monday = addDays(common, -((dowOf(common) + 6) % 7));
    for (const [home, away] of games) {
      let date = common;
      if (!free(home, away, common)) {
        const sameWeek = [1, 2, 3, 4, 5]
          .map((dw) => dayOfWeek(monday, dw))
          .filter((d) => d !== common && inRange(d) && free(home, away, d))
          .sort((a, b) => Math.abs(dowOf(a) - dowOf(common)) - Math.abs(dowOf(b) - dowOf(common)) || (a < b ? -1 : 1));
        let moved = sameWeek[0];
        if (!moved) {
          for (let k = 1; k <= YOUTH_COMP.MOVE_MAX_DAYS; k++) {
            const d = addDays(common, k);
            if (inRange(d) && free(home, away, d)) {
              moved = d;
              break;
            }
          }
        }
        if (!moved) {
          // Nothing free ahead before the next round (two rounds a week, first-team games on every
          // weekday left): any free day between the previous and the next round, weekend and days
          // before the common one included, nearest first (later on a tie).
          for (let k = 1; k <= 7 && !moved; k++) {
            for (const d of [addDays(common, k), addDays(common, -k)]) {
              if (inRange(d) && free(home, away, d)) {
                moved = d;
                break;
              }
            }
          }
        }
        // No free day at all: stays on the common day; the postponement of the day decides.
        if (moved) date = moved;
      }
      for (const c of [home, away]) {
        if (!youthDates.has(c)) youthDates.set(c, new Set());
        youthDates.get(c)!.add(date);
      }
      fixtures.push({ round: i + 1, home, away, date });
    }
  });

  return { fixtures, roundDates, singleLeg };
}
