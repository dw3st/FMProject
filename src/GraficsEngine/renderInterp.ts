/**
 * Render interpolation between the last two fixed sim steps.
 *
 * The engine advances in whole steps of SIM_STEP; a rendered frame falls somewhere between two steps
 * (`carry` is the game-time already accumulated towards the next one). Drawing `lerp(prev, cur, carry / step)`
 * instead of `cur` removes the judder when a frame runs 3 steps and the next one 5. Drawing only: the
 * engine, its dice and the statistics never see these positions.
 */
import { clamp } from "@/Domain/math";
import { getBallPos } from "@/GameEngine/Domain/gameState";
import type { GameState } from "@/GameEngine/types";
import { ballHeight } from "@/GraficsEngine/ballHeight";

export interface Pos { x: number; y: number }
export interface DrawnBall extends Pos { h: number }

/** `carry / step`, limited to 0..1. */
export function interpAlpha(carry: number, step: number): number {
  return step > 0 ? clamp(carry / step, 0, 1) : 1;
}

/** Linear blend from `prev` to `cur`; a jump bigger than `maxStep` yards is drawn at `cur` (no smoothing). */
export function lerpPos(prev: Pos, cur: Pos, alpha: number, maxStep: number): Pos {
  if (isTeleport(prev, cur, maxStep)) return { x: cur.x, y: cur.y };
  return { x: prev.x + (cur.x - prev.x) * alpha, y: prev.y + (cur.y - prev.y) * alpha };
}

function isTeleport(prev: Pos, cur: Pos, maxStep: number): boolean {
  const dx = cur.x - prev.x;
  const dy = cur.y - prev.y;
  return dx * dx + dy * dy > maxStep * maxStep;
}

/** Drawn position of every player of `cur` by id; a player missing from `prev` (substitute) is drawn as is. */
export function drawnPlayerPositions(
  prev: Pick<GameState, "players">,
  cur: Pick<GameState, "players">,
  alpha: number,
  maxStep: number,
): Map<number, Pos> {
  const before = new Map(prev.players.map((p) => [p.id, p] as const));
  const out = new Map<number, Pos>();
  for (const p of cur.players) {
    const was = before.get(p.id);
    out.set(p.id, was && prev !== cur ? lerpPos(was, p, alpha, maxStep) : { x: p.x, y: p.y });
  }
  return out;
}

/** Drawn ball (position + illustrative height); a teleport draws the current ball and height. */
export function drawnBall(prev: GameState, cur: GameState, alpha: number, maxStep: number): DrawnBall {
  const c = getBallPos(cur);
  const hc = ballHeight(cur);
  if (prev === cur) return { x: c.x, y: c.y, h: hc };
  const p = getBallPos(prev);
  if (isTeleport(p, c, maxStep)) return { x: c.x, y: c.y, h: hc };
  const hp = ballHeight(prev);
  return { ...lerpPos(p, c, alpha, maxStep), h: hp + (hc - hp) * alpha };
}

/**
 * True when `a` and `b` draw identically (same players in the same spots, same ball). A state swapped in from
 * outside the pump (React echo, tactics change, /test command) that moved nothing keeps the interpolation;
 * one that moved something is drawn as is.
 */
export function samePositions(a: GameState, b: GameState): boolean {
  if (a === b) return true;
  if (a.players.length !== b.players.length) return false;
  for (let i = 0; i < a.players.length; i++) {
    const p = a.players[i]!;
    const q = b.players[i]!;
    if (p.id !== q.id || p.x !== q.x || p.y !== q.y) return false;
  }
  const ba = getBallPos(a);
  const bb = getBallPos(b);
  return ba.x === bb.x && ba.y === bb.y && ballHeight(a) === ballHeight(b);
}

/** The two states the frame blends between: `prev` (step before) and `cur` (last step the pitch drew). */
export interface RenderPair { prev: GameState; cur: GameState }

/**
 * The pair after a simulation pump. `prevState` is the state handed to `advanceSim`; `result` its new state and
 * the state before its last step; `steps` how many whole steps ran.
 * - steps ran and the state changed → (step before the last, last);
 * - no step → unchanged (the carry alone moves the blend);
 * - steps ran but the state is the same (frozen countdown, matchEnd) → collapsed: the last step moved
 *   nothing, so the drawing must not keep blending towards an older step (it would shimmer with the carry).
 *   Collapsed on `prevState` (the state the pump started from, i.e. the one on screen).
 */
export function nextRenderPair(
  pair: RenderPair,
  pump: { prevState: GameState; result: { state: GameState; prevState: GameState }; steps: number },
): RenderPair {
  if (pump.steps === 0) return pair;
  if (pump.result.state === pump.prevState) {
    const still = pump.prevState;
    return pair.prev === still && pair.cur === still ? pair : { prev: still, cur: still };
  }
  return { prev: pump.result.prevState, cur: pump.result.state };
}

/**
 * The pair for the state about to be drawn. A state swapped in from outside the pump (React echo, tactics
 * change, /test command) that moved nothing keeps the blend; one that moved something is drawn as is.
 */
export function syncRenderPair(pair: RenderPair, drawState: GameState): RenderPair {
  if (drawState === pair.cur) return pair;
  if (samePositions(drawState, pair.cur)) return { prev: pair.prev, cur: drawState };
  return { prev: drawState, cur: drawState };
}
