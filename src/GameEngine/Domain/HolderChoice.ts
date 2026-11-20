/**
 * The FM ball-holder picker (engine rebuild stage 8, `.claude/rules/game-engine/holder-choice.md`). Pure: the
 * candidates come from `DecisionTree.ts`, the lapse noise draws are passed in.
 *
 * score = value × multiplier × SCALE (× f24 for a kick, × lapse noise), compressed above the risk cap
 * (100 − risk)³ / 10 (keeps 10% of the excess), never below 1; risk 100 vetoes. Hard argmax; ties go to the lower risk,
 * then the higher quality byte.
 */
import { HOLDER_CHOICE as C } from '@/GameEngine/Configs/HolderChoiceConfig';

/** FM's categories: 0 pass, 1 kick, 2 turn, 3 hold, 4 carry. */
export type HolderCategory = 0 | 1 | 2 | 3 | 4;
export const CATEGORY_NAMES = ['pass', 'kick', 'turn', 'hold', 'carry'] as const;

export interface HolderCandidate<T = unknown> {
  cat: HolderCategory;
  /** What it is (`pass`, `through_ball`, `carry`, `sprint`, `hold`, …) — for the panel and the statistics. */
  kind: string;
  /** A short label (receiver, lane, cell). */
  label: string;
  /** 0..1, the evaluator's compressed score after the gates. */
  value: number;
  /** Category multiplier (turn and hold 0.5, the rest 1). */
  mult: number;
  /** Risk byte 0..100 (100 = vetoed). */
  risk: number;
  /** Quality byte −50..50 (pass adder and tie-break). */
  quality: number;
  /** What the engine executes when it wins. */
  decision: T;
}

export interface ScoredCandidate<T = unknown> extends HolderCandidate<T> {
  vetoed: boolean;
  /** Score before the risk compression. */
  raw: number;
  /** Final score (0 when vetoed). */
  score: number;
  compressed: boolean;
}

/** FM's risk cap: (100 − risk)³ / 10. */
export function riskCap(risk: number): number {
  const r = Math.max(0, Math.min(100, risk));
  return (100 - r) ** 3 / 10;
}

/** The compressed score: above the cap only `COMPRESS_KEEP` of the excess is kept; never below MIN_SCORE. */
export function compressByRisk(s: number, risk: number): { score: number; compressed: boolean } {
  const cap = riskCap(risk);
  if (s > cap) return { score: Math.max(C.MIN_SCORE, s - (1 - C.COMPRESS_KEEP) * (s - cap)), compressed: true };
  return { score: Math.max(C.MIN_SCORE, s), compressed: false };
}

/**
 * Scores every candidate. `noise(i)` returns the lapse factor of candidate i (1 without a lapse).
 */
export function scoreCandidates<T>(cands: readonly HolderCandidate<T>[], noise: (i: number) => number = () => 1): ScoredCandidate<T>[] {
  return cands.map((c, i) => {
    const vetoed = !(c.value > 0) || c.risk >= 100;
    if (vetoed) return { ...c, vetoed: true, raw: 0, score: 0, compressed: false };
    let s = c.value * c.mult * C.SCALE * noise(i);
    if (c.cat === 1) s *= Math.min(C.KICK_F24_K * c.value * c.value, 1);
    if (c.cat === 0 && c.risk - c.quality > C.ADDER_GAP) s /= 1 + C.ADDER_STEP * (c.risk - c.quality - C.ADDER_GAP);
    s = Math.round(s);
    const r = compressByRisk(s, c.risk);
    return { ...c, vetoed: false, raw: s, score: Math.round(r.score), compressed: r.compressed };
  });
}

/** Hard argmax over the scored candidates (ties: lower risk, then higher quality). −1 when every one is vetoed. */
export function pickCandidate(scored: readonly ScoredCandidate[]): number {
  let best = -1;
  for (let i = 0; i < scored.length; i++) {
    const c = scored[i]!;
    if (c.vetoed) continue;
    if (best < 0) { best = i; continue; }
    const b = scored[best]!;
    if (c.score > b.score || (c.score === b.score && (c.risk < b.risk || (c.risk === b.risk && c.quality > b.quality)))) best = i;
  }
  return best;
}

/** Risk byte from a 0..1 loss chance. */
export function riskOf(loss: number): number {
  return Math.round(Math.max(0, Math.min(1, loss)) * 100);
}

/** Quality byte from a 0..1 value. */
export function qualityOf(value: number): number {
  return Math.round((Math.max(0, Math.min(1, value)) - 0.5) * 100);
}
