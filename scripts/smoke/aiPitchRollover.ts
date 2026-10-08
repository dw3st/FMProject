import { matchPitchCondition } from "@/Domain/facilities/pitch";
import type { Fixture } from "@/types/calendarTypes";
import type { Squad } from "@/types/playerTypes";

/**
 * Smoke helpers for the AI home pitch across a rollover (`docs/superpowers/specs/2026-10-08-living-facilities-design.md`
 * §3): the pitch of an AI club falls through its league season and is new again the next one.
 */

/** Home pitch by club and league year: first and last home game of each season. */
export type PitchByYear = Map<string, Map<number, { first: number; last: number }>>;

/**
 * Pairs of consecutive seasons of a club (last home game of one, first of the next). `ok` only with at
 * least one pair and none where the new season starts on a pitch no better than the old one ended.
 */
export function pitchRolloverPairs(byClub: PitchByYear): { pairs: number; bad: string[]; ok: boolean } {
  let pairs = 0;
  const bad: string[] = [];
  for (const [club, byYear] of byClub) {
    const years = [...byYear.keys()].sort((a, b) => a - b);
    for (let i = 1; i < years.length; i++) {
      const prev = byYear.get(years[i - 1]!)!;
      const next = byYear.get(years[i]!)!;
      pairs++;
      if (!(prev.last < next.first)) bad.push(`${club} ${years[i - 1]}: ${prev.last.toFixed(1)} → ${next.first.toFixed(1)}`);
    }
  }
  return { pairs, bad, ok: pairs > 0 && bad.length === 0 };
}

/**
 * Pitch of the club's first home fixture of a (new) calendar, computed by the same `matchPitchCondition`
 * the day advance uses, with the league window of that season. `null` without a home fixture.
 */
export function firstHomePitch(
  squad: Squad,
  fixtures: Pick<Fixture, "date" | "home" | "neutral">[],
  window: { start: string; end: string },
): { date: string; condition: number } | null {
  const home = fixtures.filter((f) => f.home === squad.id && !f.neutral).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!home) return null;
  return { date: home.date, condition: matchPitchCondition(squad, home, window, home.date) };
}
