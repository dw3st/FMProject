import { SCOUTING as S } from "@/Domain/scouting/scoutingConfig";
import { STAFF } from "@/Domain/staff/staffConfig";
import { clamp } from "@/Domain/math";
import { daysBetween } from "@/Domain/dates";
import type { KnowledgeEntry } from "@/types/scoutingTypes";

/** Pure knowledge model (`.claude/rules/game/scouting.md` §1). No I/O. */

/** Piecewise-linear through `[rating 1, rating 5, rating 10]` (same shape as the staff curves). */
export function ratingCurve(rating: number, [atMin, atNeutral, atMax]: readonly [number, number, number]): number {
  const r = clamp(rating, 1, 10);
  if (r <= 5) return atMin + (atNeutral - atMin) * ((r - 1) / 4);
  return atNeutral + (atMax - atNeutral) * ((r - 5) / 5);
}

export interface ScoutMultipliers {
  /** Multiplier on the attribute uncertainty (chief scout). */
  uncertainty: number;
  /** Multiplier on the knowledge every mission gains (chief scout). */
  gain: number;
}

/** The chief scout's multipliers (`rating` 1..10; a vacant chief counts as rating 3). */
export function scoutMultipliersOf(chiefRating: number): ScoutMultipliers {
  return { uncertainty: ratingCurve(chiefRating, STAFF.SCOUT_UNCERTAINTY_MULT), gain: ratingCurve(chiefRating, STAFF.SCOUT_GAIN_MULT) };
}

/** Rating of whoever leads a mission → multiplier on the knowledge it gains. */
export const ratingGain = (rating: number) => ratingCurve(rating, S.RATING_GAIN);

export interface ImplicitContext {
  /** League of the player's club ("" for a free agent). */
  playerLeague?: string;
  /** Country of that league. */
  playerCountry?: string;
  /** The human club's league and its country. */
  ownLeague?: string;
  ownCountry?: string;
  /** Top of the world by overall (public fame). */
  famous?: boolean;
}

/** What anyone knows without observing: own league 35, another league of the country 20, +25 fame, at most 60. */
export function implicitKnowledge(ctx: ImplicitContext): number {
  let k = 0;
  if (ctx.playerLeague && ctx.ownLeague && ctx.playerLeague === ctx.ownLeague) k = S.IMPLICIT_OWN_LEAGUE;
  else if (ctx.playerCountry && ctx.ownCountry && ctx.playerCountry === ctx.ownCountry) k = S.IMPLICIT_OWN_COUNTRY;
  if (ctx.famous) k += S.IMPLICIT_FAME;
  return Math.min(S.IMPLICIT_MAX, k);
}

/** A stored entry on `date`: nothing lost in the first 90 days, then 5 points per 30 days. */
export function decayed(entry: KnowledgeEntry, date: string): number {
  const idle = Math.max(0, daysBetween(entry.seen, date) - S.DECAY_GRACE_DAYS);
  return clamp(entry.k - (S.DECAY_PER_30_DAYS * idle) / 30, 0, 100);
}

/** Effective knowledge: the larger of the implicit and the (decayed) stored one; own players 100. */
export function knowledgeOf(args: { own?: boolean; implicit: number; stored?: KnowledgeEntry; date: string }): number {
  if (args.own) return 100;
  const stored = args.stored ? decayed(args.stored, args.date) : 0;
  return Math.round(Math.max(args.implicit, stored));
}

/** ± points of uncertainty on every attribute for knowledge `k`. */
export function uncertaintyOf(k: number, chiefUncertainty = 1): number {
  const kk = clamp(k, 0, 100);
  if (kk >= 100) return 0;
  return S.MAX_NOISE * Math.pow(1 - kk / 100, S.NOISE_POWER) * chiefUncertainty;
}

/** Attributes are hidden ("?") below `HIDDEN_BELOW`. */
export const attributesHidden = (k: number) => k < S.HIDDEN_BELOW;

/** Adds `gain` to a player's knowledge (from its current effective value), capped at 100, seen today. */
export function gainKnowledge(current: number, gain: number, date: string): KnowledgeEntry {
  return { k: Math.min(100, Math.round((current + gain) * 10) / 10), seen: date };
}

/**
 * Sparse knowledge: entries that decayed down to the implicit value leave; past `max`, the oldest
 * observations go first.
 */
export function pruneKnowledge(
  knowledge: Record<string, KnowledgeEntry>,
  date: string,
  implicitOf: (playerId: string) => number = () => 0,
  max: number = S.MAX_KNOWLEDGE,
): Record<string, KnowledgeEntry> {
  const kept = Object.entries(knowledge).filter(([id, e]) => decayed(e, date) > implicitOf(id));
  kept.sort((a, b) => (a[1].seen < b[1].seen ? 1 : a[1].seen > b[1].seen ? -1 : a[0] < b[0] ? -1 : 1));
  return Object.fromEntries(kept.slice(0, max));
}
