/**
 * Decision telemetry (`.claude/rules/game-engine/decisions.md`): the score vector behind every fresh decision of the
 * ball holder, an off-ball attacker and a defender, with the situation it was taken in. Instrumentation only: nothing
 * here changes a decision, and nothing draws a die.
 *
 * How it works: `gameState` turns capture on for a tick only when somebody listens to a decision event
 * (`gameBus.has`). The evaluators (`decideBallHolder`, `evaluateOffBall`, `evaluateDefensiveDecision`) then hand their
 * score vector to `captureDecision`; after each fresh `decide()` the tick loop takes it (`takeCapture`) and emits the
 * event with the situation bucket and the holder's pressure (computed once per tick).
 */
import { DECISION_TELEMETRY as T } from '@/GameEngine/Configs/DecisionConfig';
import { PITCH_LENGTH, PITCH_WIDTH } from '@/GameEngine/Domain/pitch';

export type DecisionFamily = 'holder' | 'offBall' | 'defense';

export interface CapturedDecision {
  family: DecisionFamily;
  scores: Record<string, number>;
  /** The intent picked (off-ball, defence); the holder's chosen action is the decision type. */
  chosen?: string;
}

let enabled = false;
let last: CapturedDecision | null = null;

/** Turned on by the tick loop when a decision event has a listener. */
export function setDecisionCapture(on: boolean): void {
  enabled = on;
  if (!on) last = null;
}

export function decisionCaptureOn(): boolean {
  return enabled;
}

/** Called by an evaluator with its score vector (no-op when capture is off — the caller checks first to skip the object). */
export function captureDecision(family: DecisionFamily, scores: Record<string, number>, chosen?: string): void {
  if (!enabled) return;
  last = chosen === undefined ? { family, scores } : { family, scores, chosen };
}

/** The capture of the last `decide()` (and clears it). */
export function takeCapture(): CapturedDecision | null {
  const c = last;
  last = null;
  return c;
}

/** Top score, its key, and the margin to the second best. */
export function argmaxAndMargin(scores: Record<string, number>): { argmax: string; margin: number } {
  let best = '';
  let top = -Infinity;
  let second = -Infinity;
  for (const [k, v] of Object.entries(scores)) {
    if (v > top) { second = top; top = v; best = k; }
    else if (v > second) second = v;
  }
  return { argmax: best, margin: second === -Infinity ? Infinity : top - second };
}

/** Third of the pitch relative to a team's attack: 0 own third, 1 middle third, 2 final third. */
export function pitchThird(x: number, attackDir: 1 | -1): 0 | 1 | 2 {
  const forward = attackDir === 1 ? x : PITCH_LENGTH - x;
  return forward < PITCH_LENGTH / 3 ? 0 : forward < (2 * PITCH_LENGTH) / 3 ? 1 : 2;
}

/**
 * Situation bucket 0..11 = third × 4 + pressure × 2 + channel:
 * - third: where the ball is relative to the DECIDING player's attack (0 own, 1 middle, 2 final third);
 * - pressure: the holder's pressure scalar < `PRESSURE_HIGH` (0 low) or ≥ (1 high);
 * - channel: |ball y − 37| < `WIDE_FROM_CENTRE` (0 central) or ≥ (1 wide).
 * For a defender the "final third" is the opponent's own third (he defends near the other goal).
 */
export function situationBucket(ballX: number, ballY: number, attackDir: 1 | -1, pressure: number): number {
  const third = pitchThird(ballX, attackDir);
  const high = pressure >= T.PRESSURE_HIGH ? 1 : 0;
  const wide = Math.abs(ballY - PITCH_WIDTH / 2) >= T.WIDE_FROM_CENTRE ? 1 : 0;
  return third * 4 + high * 2 + wide;
}

export const BUCKET_COUNT = 12;

/** Readable name of a bucket ("own·low·central"). */
export function bucketName(b: number): string {
  const third = ['own', 'mid', 'final'][Math.floor(b / 4)] ?? '?';
  const press = (b >> 1) & 1 ? 'high' : 'low';
  const lane = b & 1 ? 'wide' : 'central';
  return `${third}·${press}·${lane}`;
}

/** Shannon entropy (bits) of a count distribution. */
export function entropyBits(counts: Iterable<number>): number {
  let total = 0;
  const arr: number[] = [];
  for (const c of counts) { if (c > 0) { arr.push(c); total += c; } }
  if (total <= 0) return 0;
  let h = 0;
  for (const c of arr) { const p = c / total; h -= p * Math.log2(p); }
  return h;
}
