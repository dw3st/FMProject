/**
 * The ball holder's mind (FM-style decisions, phase 3; `.claude/rules/game-engine/decisions.md`).
 *
 * Per window of `HOLDER_MIND.WINDOW_TICKS` decision ticks the holder rolls his decisions, composure and flair on FM's
 * 1..100 scale (mood decides the roll's shape), and every option's score gets a noise draw z held for the window.
 * The gates (release under pressure, simple-minded, long-shot range) compare those ROLLS, never the raw attribute.
 * `decideBallHolder` reads the perceived scores instead of the true ones. The dice live in `ActionOutcomes.ts`.
 */
import { HOLDER_MIND as M } from '@/GameEngine/Configs/DecisionConfig';
import { gaussianDraw, lapseScale, mentalRoll, type MoodBand } from '@/GameEngine/Infrastructure/ActionOutcomes';
import type { GamePlayer, HolderMindState, PlayerMental } from '@/GameEngine/types';
import { PITCH_LENGTH, PITCH_WIDTH } from '@/GameEngine/Domain/pitch';
import { clamp } from '@/Domain/math';

/** Holder action slots, in the order the perceived vector is kept. */
export const HOLDER_ACTIONS = ['shoot', 'carry', 'pass', 'dribble', 'through_ball', 'cross', 'long_ball'] as const;
export type HolderAction = (typeof HOLDER_ACTIONS)[number];

/** A hand-built test player without a mental profile: world-median attributes, neutral mood. */
export const DEFAULT_MENTAL: Readonly<PlayerMental> = {
  decisions: 0.3, composure: 0.28, flair: 0.26, anticipation: 0.29, consistency: 0.5, mood: 0,
};

/** Form −1..1 from the recent ratings (empty = 0). */
export function formOf(recentRatings: readonly number[] | undefined): number {
  if (!recentRatings || recentRatings.length === 0) return 0;
  const mean = recentRatings.reduce((a, b) => a + b, 0) / recentRatings.length;
  return clamp((mean - M.FORM_REF) / M.FORM_SPAN, -1, 1);
}

/** Mood −1..1: half the morale factor (−1..1), half the form. */
export function moodOf(moraleFactor: number, form: number): number {
  return clamp(0.5 * moraleFactor + 0.5 * form, -1, 1);
}

export function moodBand(mood: number): MoodBand {
  return mood >= M.MOOD_GOOD ? 'good' : mood <= M.MOOD_BAD ? 'bad' : 'normal';
}

/** FM's form window on the 100 scale for this tick: s = tick mod SPAN + BASE (tick = whole game seconds). */
export function formWindow(matchTime: number): number {
  const tick = Math.max(0, Math.floor(matchTime));
  return (tick % M.FORM_WINDOW_SPAN) + M.FORM_WINDOW_BASE;
}

/** Fatigue multiplier on the lapse chance: 1 + LAPSE_FATIGUE·(1 − energy/100)²·(1.5 − consistency). */
export function fatigueLapseMult(energy: number, consistency: number): number {
  const tired = 1 - clamp(energy, 0, 100) / 100;
  return 1 + M.LAPSE_FATIGUE * tired * tired * (1.5 - consistency);
}

/**
 * Applies the form window to a raw roll: an attribute below the window may roll a lapse (raw / fatigue < 1 → 0), one
 * at or above it is floored at 1.
 */
export function windowedRoll(raw: number, a100: number, s: number, fatigue = 1): { roll: number; lapse: boolean } {
  if (a100 >= s) return { roll: Math.max(1, raw), lapse: false };
  if (raw / fatigue < M.LAPSE_ROLL) return { roll: 0, lapse: true };
  return { roll: raw, lapse: false };
}

/**
 * σ of the perceived scores: the decisions attribute stretched to the world (`fmScale`) times the roll's luck
 * T = roll / (a + 2). The rolls themselves stay on the plain ×10 scale (FM's thresholds, measured on FM27).
 */
export function sigmaOf(decisions: number, dec100: number, decRoll: number): number {
  const T = clamp(decRoll / (dec100 + M.ROLL_PLUS), 0, 1);
  const test = (fmScale(decisions) / 100) * (0.4 + 0.6 * T);
  return M.SIGMA_MIN + M.SIGMA_SPAN * (1 - test);
}

/** A new window: the three rolls, the lapse and the noise of every action slot. Always the same number of draws. */
export function rollMindWindow(mental: PlayerMental, energy: number, matchTime: number): HolderMindState {
  const band = moodBand(mental.mood);
  const s = formWindow(matchTime);
  const dec100 = mental.decisions * 100;
  const comp100 = mental.composure * 100;
  const flair100 = mental.flair * 100;
  const dec = windowedRoll(mentalRoll(dec100, band, M.ROLL_PLUS), dec100, s, fatigueLapseMult(energy, mental.consistency));
  const comp = windowedRoll(mentalRoll(comp100, band, M.ROLL_PLUS), comp100, s);
  const flair = windowedRoll(mentalRoll(flair100, band, M.ROLL_PLUS), flair100, s);
  const z = HOLDER_ACTIONS.map(() => gaussianDraw());
  const lapseMul = dec.lapse ? HOLDER_ACTIONS.map(() => lapseScale(M.LAPSE_MIN)) : [];
  return {
    ticks: M.WINDOW_TICKS,
    dec: dec.roll,
    comp: comp.lapse ? 0 : comp.roll,
    flair: flair.lapse ? 0 : flair.roll,
    lapse: dec.lapse,
    sigma: sigmaOf(mental.decisions, dec100, dec.roll),
    z,
    lapseMul,
  };
}

/**
 * A mental value (0..1, roster / 10) stretched to our world: the world's top (`MENTAL_TOP`, 6.5 on the roster) is 100,
 * the median (~3.0) ~46. Only the noise σ reads it; the rolls use ×10 (FM's own scale, our world simply sits low).
 */
export function fmScale(v: number): number {
  return clamp(v / M.MENTAL_TOP, 0, 1) * 100;
}

/** pN = clamp(P / PRESSURE_NORM, 0, 1). */
export function normalisedPressure(p: number): number {
  return clamp(p / M.PRESSURE_NORM, 0, 1);
}

/** Metres from (x, y) to the centre of the goal the player attacks. */
export function distToGoalM(x: number, y: number, attackDir: 1 | -1): number {
  const goalX = attackDir === 1 ? PITCH_LENGTH : 0;
  return Math.hypot(goalX - x, PITCH_WIDTH / 2 - y) * 0.9144;
}

/**
 * Facing away from goal: the angle between his last movement and the direction to goal is over `FACING_AWAY_DEG`.
 * Returns the release-window widening w (0 when he faces the goal or stands still).
 */
export function facingAwayWiden(p: Pick<GamePlayer, 'x' | 'y' | 'attackDir' | 'vel'>, pN: number): number {
  const v = p.vel;
  if (!v) return 0;
  const speed = Math.hypot(v.x, v.y);
  if (speed < M.FACING_MIN_SPEED) return 0;
  const goalX = p.attackDir === 1 ? PITCH_LENGTH : 0;
  const gx = goalX - p.x;
  const gy = PITCH_WIDTH / 2 - p.y;
  const gl = Math.hypot(gx, gy);
  if (gl < 1e-6) return 0;
  const cos = (v.x * gx + v.y * gy) / (speed * gl);
  const deg = (Math.acos(clamp(cos, -1, 1)) * 180) / Math.PI;
  if (deg <= M.FACING_AWAY_DEG) return 0;
  return Math.min(pN * 10 + 10, 12) / 100;
}

/**
 * Release under pressure: pN·100 − C/2 > D·K·(1 + W·n)/10·(1 + w). FM's binary reads D·k/(5n + 10), but its live rates
 * (FM27: 1–2% with an open option, ~20% without) need the threshold to GROW with the open options, so n multiplies.
 */
export function releaseFires(pN: number, compRoll: number, distM: number, openOptions: number, widen = 0): boolean {
  if (pN <= 0) return false;
  return pN * 100 - compRoll / 2 > ((distM * M.RELEASE_K * (1 + M.OPEN_WEIGHT * openOptions)) / 10) * (1 + widen);
}

/** Simple-minded this window: the decisions roll below `SIMPLE_ROLL` (a lapse counts). */
export function simpleMinded(state: HolderMindState): boolean {
  return state.dec < M.SIMPLE_ROLL;
}

/** Long-shot range in yards from the flair and composure rolls. */
export function longShotRange(state: HolderMindState): number {
  return Math.min(M.LONG_SHOT_MAX_YD, M.LONG_SHOT_BASE_YD + (M.LONG_SHOT_SPAN_YD * ((state.flair + state.comp) / 2)) / 100);
}

/** Flair bias on dribble, through ball and a long shot. */
export function flairBias(state: HolderMindState): number {
  return M.FLAIR_BIAS * clamp((state.flair - M.FLAIR_CENTER) / M.FLAIR_CENTER, -1, 1);
}

/**
 * Perceived scores: an option with a gated score ≤ 0 stays 0 (infeasible); else gated + bias + σ·z, × the lapse
 * multiplier, never below 0.
 */
export function perceiveScores(gated: readonly number[], bias: readonly number[], state: HolderMindState): number[] {
  return gated.map((g, i) => {
    if (!(g > 0)) return 0;
    let v = g + (bias[i] ?? 0) + state.sigma * (state.z[i] ?? 0);
    if (state.lapse) v *= state.lapseMul[i] ?? 1;
    return Math.max(0, v);
  });
}

/** Index of the top value (first wins a tie). */
export function argmaxIndex(v: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < v.length; i++) if (v[i]! > v[best]!) best = i;
  return best;
}

/** What the holder's mind did on one decision (side channel to the tick loop, like the telemetry capture). */
export interface HolderMindOutput {
  state: HolderMindState;
  /** A new window was rolled this decision. */
  fresh: boolean;
  /** FM's raw pressure scalar and its normalised value. */
  pressure: number;
  pN: number;
  release: boolean;
  /** Open pass options (the release gate's n). */
  openOptions: number;
  /** Metres to the centre of the goal he attacks. */
  distM: number;
  simple: boolean;
  /** Facing-away widening w (0 when he faces the goal). */
  widen: number;
  longShotRange: number;
  mood: MoodBand;
  trueScores: Record<string, number>;
  perceived: Record<string, number>;
  trueBest: string;
  picked: string;
  /** The extra move picked (`HolderMoves.ts`), when one won. */
  move?: string;
}

let lastMind: HolderMindOutput | null = null;

export function setHolderMind(out: HolderMindOutput): void {
  lastMind = out;
}

/** The mind output of the last `decide()` (and clears it). */
export function takeHolderMind(): HolderMindOutput | null {
  const m = lastMind;
  lastMind = null;
  return m;
}
