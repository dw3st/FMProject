import { daysBetween } from "@/Domain/dates";
import { isUnavailable } from "@/Domain/discipline/discipline";
import { FRIENDLY } from "@/Domain/friendlies/friendlyConfig";
import { getMainRole } from "@/Domain/roles";
import type { RosterPlayer } from "@/types/playerTypes";

/** Pure rules of the director's friendlies. */

export function isFriendlyDay(date: string): boolean {
  return new Date(`${date}T00:00:00Z`).getUTCDay() === FRIENDLY.WEEKDAY;
}

/** Saturday, nothing official today and the next official game neither too close nor too far. */
export function friendlyDue(input: {
  date: string;
  nextOfficial: string | null;
  blocked: boolean;
  playsToday: boolean;
}): boolean {
  const { date, nextOfficial, blocked, playsToday } = input;
  if (blocked || playsToday || !nextOfficial || !isFriendlyDay(date)) return false;
  const days = daysBetween(date, nextOfficial);
  return days >= FRIENDLY.MIN_DAYS_BEFORE && days <= FRIENDLY.MAX_DAYS_BEFORE;
}

function weekIndex(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / (7 * 86_400_000));
}

function fieldable(players: RosterPlayer[]): boolean {
  return players.length >= FRIENDLY.XI_SIZE && players.some((p) => getMainRole(p.positions[0] ?? "") === "GK");
}

/**
 * Who can play: fit and available. One Saturday the whole squad (the starters come out on top), the next
 * the saved starters sit out, so the reserves get the minutes too. Null when there is no team to field.
 */
export function friendlyPool(players: RosterPlayer[], date: string, savedXi: string[]): RosterPlayer[] | null {
  const fit = players.filter((p) => !isUnavailable(p, date) && (p.seasonLog?.fitness ?? 100) >= FRIENDLY.MIN_FITNESS);
  if (!fieldable(fit)) return null;
  if (weekIndex(date) % 2 === 0) return fit;
  const starters = new Set(savedXi);
  const reserves = fit.filter((p) => !starters.has(p.id));
  return fieldable(reserves) ? reserves : fit;
}

export function pickOpponent(clubs: string[], own: string, excluded: ReadonlySet<string>, roll: number): string | null {
  const options = clubs.filter((c) => c !== own && !excluded.has(c));
  return options.length ? options[Math.floor(roll * options.length)]! : null;
}
