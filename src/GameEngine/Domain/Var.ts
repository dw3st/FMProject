/**
 * Var — pure referee-error, VAR and complaint math (`.claude/rules/game/var.md`).
 *
 * No state, no events: `gameState.ts` decides when an opportunity happens, calls these and executes
 * the outcome. Randomness is injected. A referee without `quality` (older save, `/test` "Off", the lab
 * without a referee) never errs and never draws a number — the match is exactly the one before.
 */
import { VAR_CONFIG as C } from '@/GameEngine/Configs/VarConfig';
import { clamp } from '@/Domain/math';

/** The five mistakes a referee can make (`var.md` §2). */
export type RefereeErrorKind = 'phantom_penalty' | 'missed_penalty' | 'missed_offside' | 'wrong_red' | 'missed_red';

export const REFEREE_ERROR_KINDS: readonly RefereeErrorKind[] = [
  'phantom_penalty', 'missed_penalty', 'missed_offside', 'wrong_red', 'missed_red',
];

/** What a VAR review looks at. */
export type VarReviewKind = 'penalty' | 'missed_penalty' | 'goal' | 'red_card' | 'missed_red';

/** The referee as the error rolls see him (`GameState.referee`). */
export interface ErrorReferee { quality?: number; var?: boolean }

/** Error multiplier of a referee of quality `q` (0..100): ≈ 1.5 worst, ≈ 0.7 best, 1 at 62.5. */
export function qualityMult(q: number): number {
  return C.QUALITY_HI - C.QUALITY_SLOPE * clamp(q, 0, 100) / 100;
}

/** Chance of `kind` per opportunity for a referee of quality `q`. */
export function errorChance(kind: RefereeErrorKind, q: number): number {
  return clamp(C.BASE[kind] * qualityMult(q), 0, 1);
}

/** True when this referee can err (has a quality): the only case where error rolls draw numbers. */
export function canErr(referee: ErrorReferee | null | undefined): boolean {
  return typeof referee?.quality === 'number';
}

/**
 * One error roll at an opportunity. No referee / no quality → false without drawing. A forced kind
 * (`/test`) fires for sure on its first opportunity (and draws nothing either).
 */
export function rollError(
  kind: RefereeErrorKind,
  referee: ErrorReferee | null | undefined,
  rng: () => number,
  forced?: RefereeErrorKind | null,
): boolean {
  if (forced === kind) return true;
  if (!canErr(referee)) return false;
  return rng() < errorChance(kind, referee!.quality!);
}

/** The VAR corrects a reviewable error (only with VAR on the match; draws one number). */
export function varCorrects(referee: ErrorReferee | null | undefined, rng: () => number): boolean {
  if (!referee?.var || !canErr(referee)) return false;
  return rng() < C.CORRECTION;
}

/** The VAR checks a correct penalty / straight red anyway (always confirmed). */
export function varChecksCorrect(referee: ErrorReferee | null | undefined, rng: () => number): boolean {
  if (!referee?.var || !canErr(referee)) return false;
  return rng() < C.CHECK_CORRECT;
}

// ── Manager complaint ─────────────────────────────────────────────────────────

export interface ComplaintInput {
  /** Complaints already made this match (0 for the first). */
  made: number;
  /** Referee rigor s (−1..1); absent = 0. */
  strictness?: number;
  /** The manager already has a yellow this match. */
  onYellow: boolean;
}

export interface ComplaintChances { yellow: number; red: number }

export function complaintChances(input: ComplaintInput): ComplaintChances {
  const s = input.strictness ?? 0;
  return {
    yellow: clamp(C.COMPLAINT_YELLOW_BASE * (1 + C.COMPLAINT_YELLOW_PER_COMPLAINT * input.made) * (1 + C.COMPLAINT_YELLOW_RIGOR * s), 0, 1),
    red: clamp(C.COMPLAINT_RED_BASE * (1 + input.made), 0, 1),
  };
}

export interface ComplaintOutcome {
  /** Card shown to the manager: a yellow on a yellow is a red. */
  card: 'none' | 'yellow' | 'red';
  /** Card-free complaint that made the referee stricter on the opponent. */
  bias: boolean;
}

/** One complaint: straight red first, then yellow, then (card-free) the referee bias. Three draws at most. */
export function resolveComplaint(input: ComplaintInput, rng: () => number): ComplaintOutcome {
  const { yellow, red } = complaintChances(input);
  if (rng() < red) return { card: 'red', bias: false };
  if (rng() < yellow) return { card: input.onYellow ? 'red' : 'yellow', bias: false };
  return { card: 'none', bias: rng() < C.COMPLAINT_BIAS_CHANCE };
}

/** Matches of ban for a manager sent off on his `complaintNumber`-th complaint (1-based). */
export function banMatches(complaintNumber: number): number {
  return complaintNumber >= C.BAN_LONG_FROM_COMPLAINT ? 2 : 1;
}
