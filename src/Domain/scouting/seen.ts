import { Player } from "@/Domain/Player";
import { roundAttr } from "@/Domain/attributes";
import { weeklyWage } from "@/Domain/finance/wages";
import { formatWageShort } from "@/Domain/money";
import { STAFF } from "@/Domain/staff/staffConfig";

/**
 * What the user SEES of a player outside his squad (`.claude/rules/game/scouting.md`), as numbers
 * the screens and the scout search share. Every range here is derived from the blurred view only
 * (blurred overall ± the per-player noise), never from the real player, so sorting and filtering
 * by these values cannot leak more than the screen already shows.
 */

const r1 = (v: number) => Math.round(v * 10) / 10;

/** The overall range shown once the uncertainty reaches `RANGE_THRESHOLD` (ends rounded as shown). */
export function seenOverallRange(avg: number, noise: number): [number, number] | undefined {
  if (noise < STAFF.RANGE_THRESHOLD) return undefined;
  return [r1(Math.max(0, avg - noise)), r1(Math.min(10, avg + noise))];
}

/** Middle of a range: the single value the search sorts and filters by. */
export function rangeMid(range: readonly [number, number]): number {
  return (range[0] + range[1]) / 2;
}

/** Market value range (millions of €) of an overall range at `age`. */
export function seenValueRange(range: readonly [number, number], age: number): [number, number] {
  return [r1(new Player(range[0], age).valueMillions), r1(new Player(range[1], age).valueMillions)];
}

/** Weekly wage range (whole €) of an overall range, on the club's wage curve (`wageFactor`). */
export function seenWageRange(range: readonly [number, number], wageFactor = 1): [number, number] {
  return [Math.round(weeklyWage(range[0]) * wageFactor), Math.round(weeklyWage(range[1]) * wageFactor)];
}

/** "61k–240k" (same short format as an exact wage). */
export function wageRangeLabel(range: readonly [number, number]): string {
  return `${formatWageShort(range[0])}–${formatWageShort(range[1])}`;
}

/**
 * An attribute as a range (the attribute bars: one decimal, clamped 0..10), or null when the
 * uncertainty is below the threshold (a single number).
 */
export function seenAttributeRange(value: number, noise: number | undefined): [number, number] | null {
  if (!noise || noise < STAFF.RANGE_THRESHOLD) return null;
  return [roundAttr(value - noise), roundAttr(value + noise)];
}
