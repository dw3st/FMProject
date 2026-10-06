/**
 * Short effects drawn on the pitch (shot, goal, foul, card, offside) and the ball trail. Pure:
 * times are seconds of a real-time clock that stops while the match is paused, so effects stay
 * readable at any game speed. Positions are yards.
 */
import { clamp } from "@/Domain/math";
import { EFFECT_DURATION, EFFECT_FADE_SHARE, TRAIL } from "@/GraficsEngine/pitchStyle";
import type { GameState } from "@/GameEngine/types";
import { isAerialKind } from "@/GameEngine/types";

export type PitchEffectData =
  | { kind: "shot"; fromX: number; fromY: number; toX: number; toY: number; result: "save" | "wide" }
  | { kind: "goal"; goalX: number; goalY: number; color: number }
  | { kind: "foul"; x: number; y: number }
  | { kind: "card"; x: number; y: number; card: "yellow" | "red"; name: string }
  | { kind: "offside"; lineX: number | null; x: number; y: number };

export type PitchEffect = PitchEffectData & { startedAt: number; duration: number };

/** Real-time clock for the effects: frozen while paused. */
export function advanceEffectClock(now: number, dtSeconds: number, paused: boolean): number {
  return paused ? now : now + dtSeconds;
}

export function addEffect(list: readonly PitchEffect[], data: PitchEffectData, now: number): PitchEffect[] {
  return [...list, { ...data, startedAt: now, duration: EFFECT_DURATION[data.kind] }];
}

export function liveEffects(list: readonly PitchEffect[], now: number): PitchEffect[] {
  return list.filter((e) => now - e.startedAt < e.duration);
}

export function effectProgress(e: PitchEffect, now: number): number {
  return clamp((now - e.startedAt) / e.duration, 0, 1);
}

/** 1 until the last EFFECT_FADE_SHARE of the duration, then linearly down to 0. */
export function effectAlpha(e: PitchEffect, now: number): number {
  const p = effectProgress(e, now);
  const fadeStart = 1 - EFFECT_FADE_SHARE;
  return p <= fadeStart ? 1 : clamp((1 - p) / EFFECT_FADE_SHARE, 0, 1);
}

export interface TrailPoint { x: number; y: number; at: number }

/** Shots, high balls and passes of at least TRAIL.MIN_PASS_YDS leave a trail. */
export function shouldTrail(state: Pick<GameState, "pass" | "shot">): boolean {
  if (state.shot) return true;
  const p = state.pass;
  if (!p) return false;
  return isAerialKind(p.kind) || p.distance >= TRAIL.MIN_PASS_YDS;
}

/** Appends the ball position while it trails (`null` = not trailing now). */
export function pushTrail(points: readonly TrailPoint[], pos: { x: number; y: number } | null, now: number): TrailPoint[] {
  return pos ? [...points, { x: pos.x, y: pos.y, at: now }] : [...points];
}

export function liveTrail(points: readonly TrailPoint[], now: number): TrailPoint[] {
  return points.filter((p) => now - p.at < TRAIL.SECONDS);
}
