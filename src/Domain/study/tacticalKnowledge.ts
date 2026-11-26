/**
 * Tactical knowledge meter of the match preview (tester report 6dcd454e, `.claude/rules/game/study.md`): how well the
 * AI opponent has read the manager, and how well the manager's analyst has read the opponent. Pure; the only draws are
 * seeded by the save, the club and the date, so the card does not change on a reload.
 */
import { clamp } from "@/Domain/math";
import { unitFrom } from "@/Domain/rng";
import { effectiveStars, starCurve } from "@/Domain/staff/staff";
import { expectedPlan, gameScore, studyRead } from "@/Domain/study/study";
import type { TacticalStyle } from "@/types/tacticsTypes";
import type { Squad } from "@/types/playerTypes";
import type { MatchSetupKnowledge, TacticLogEntry } from "@/types/studyTypes";

export const KNOWLEDGE = {
  /** Games of the opponent the analyst reads (the same window the AI uses on the manager). */
  GAMES: 5,
  /** What a game that departs from the opponent's usual plan costs the read. */
  PENALTY: { formation: 0.5, style: 0.5 },
  /** Half-width of the shown range by the analyst's stars [1★, 3★, 5★] (0..1). */
  RANGE_HALF: [0.25, 0.15, 0] as const,
  /** Chance the analyst names the wrong formation [1★, 3★, 5★]. */
  WRONG_SHAPE: [0.35, 0.15, 0] as const,
  /** Shown percentages snap to this step. */
  STEP: 5,
};

/** A club's own plan in one game. */
export interface ClubPlan { formation: string; style: TacticalStyle }

const pct = (v: number) => Math.round(clamp(v, 0, 1) * 100);

/** Values ranked by count; a tie goes to the one seen most recently (`values` is oldest first). */
function ranked<T>(values: readonly T[], keyOf: (v: T) => string): T[] {
  const stat = new Map<string, { v: T; n: number; last: number }>();
  values.forEach((v, i) => {
    const s = stat.get(keyOf(v));
    if (s) { s.n++; s.last = i; } else stat.set(keyOf(v), { v, n: 1, last: i });
  });
  return [...stat.values()].sort((a, b) => b.n - a.n || b.last - a.last).map((s) => s.v);
}

/**
 * What the AI opponent knows of the manager: its read of the log × how much the tactic saved now matches what it
 * expects. Null without a log (nobody studied the manager yet).
 */
export function theyKnow(
  log: readonly TacticLogEntry[] | undefined,
  aiSquad: Squad,
  humanSquad: Squad,
  current: TacticLogEntry,
): MatchSetupKnowledge["theirs"] {
  const expected = expectedPlan(log);
  if (!expected) return null;
  const read = studyRead(log, aiSquad, humanSquad);
  const match = gameScore(current, expected);
  return {
    read: pct(read),
    now: pct(read * match),
    expected: { formation: expected.formation, style: expected.style },
    surprise: match < 1,
  };
}

/**
 * What the manager's analyst knows of the opponent, from its latest plans (newest first): a range around how much the
 * opponent repeats itself, narrower with a better analyst (5 stars: exact), and the formation it should play (a weak
 * analyst can name the wrong one). The range always contains the true value; its centre is shifted so it never gives it
 * away. Null without a known game.
 */
export function youKnow(plans: readonly ClubPlan[], humanSquad: Squad, seedKey: string): MatchSetupKnowledge["yours"] {
  const games = plans.slice(0, KNOWLEDGE.GAMES).reverse();
  if (games.length === 0) return null;
  const formations = ranked(games.map((g) => g.formation), (v) => v);
  const style = ranked(games.map((g) => g.style), (v) => v)[0]!;
  const formation = formations[0]!;
  const P = KNOWLEDGE.PENALTY;
  const raw = games.reduce((s, g) => s + Math.max(0,
    1 - (g.formation !== formation ? P.formation : 0) - (g.style !== style ? P.style : 0)), 0) / KNOWLEDGE.GAMES;

  const stars = effectiveStars(humanSquad, "analyst");
  const half = starCurve(stars, KNOWLEDGE.RANGE_HALF);
  const mid = raw + (unitFrom(`${seedKey}:knowledge-shift`) * 2 - 1) * half;
  const step = KNOWLEDGE.STEP / 100;
  // The window keeps its width: near 0 or 100% it slides back inside instead of shrinking.
  const start = clamp(mid - half, 0, Math.max(0, 1 - 2 * half));
  const lo = Math.floor(start / step + 1e-9) * step;
  const hi = Math.ceil(Math.min(1, start + 2 * half) / step - 1e-9) * step;
  const exact = half === 0;
  const wrong = formations.length > 1 && unitFrom(`${seedKey}:knowledge-shape`) < starCurve(stars, KNOWLEDGE.WRONG_SHAPE);
  return {
    low: exact ? pct(raw) : pct(Math.min(lo, raw)),
    high: exact ? pct(raw) : pct(Math.max(hi, raw)),
    expected: { formation: wrong ? formations[1]! : formation, style },
    analystStars: stars,
    mayMiss: starCurve(stars, KNOWLEDGE.WRONG_SHAPE) > 0,
  };
}
