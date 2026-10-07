/**
 * Set-piece transition (drawing only).
 *
 * When a restart starts (corner, free kick, throw-in, goal kick, offside free kick, penalty) the engine puts
 * the 22 players and the ball straight into the set-piece layout and freezes play for a short countdown
 * (`SetPiece.countdown`, real seconds at 1×, drained by `dt = real × gameSpeed`). Drawn as is, the pitch
 * flashes into the layout and sits still. Instead the drawing walks every player and the ball from where they
 * were drawn to their layout spot over a short real-time transition with easing, always finished before the
 * countdown ends (so the kick is never hidden). The engine, its dice and the statistics never see this.
 */
import { clamp } from "@/Domain/math";
import { isLivePhase } from "@/GameEngine/Domain/gameState";
import type { GameState, SetPiece } from "@/GameEngine/types";
import type { DrawnBall, Pos } from "@/GraficsEngine/renderInterp";

export const SET_PIECE_TRANSITION = {
  /** Longest transition, real seconds. */
  MAX_SECONDS: 0.8,
  /** The transition uses at most this share of the real time left on the countdown. */
  COUNTDOWN_SHARE: 0.8,
  /** Shorter than this (very high speed) it is not worth animating: drawn as before. */
  MIN_SECONDS: 0.12,
} as const;

/** Restarts that reposition the teams in play. A kickoff (match start, after a goal, second half) is not one. */
function isRepositioningRestart(sp: SetPiece | null | undefined): sp is SetPiece {
  return !!sp && sp.countdown > 0 && sp.type !== "kickoff";
}

function sameSetPiece(a: SetPiece, b: SetPiece): boolean {
  return a.type === b.type && a.takerId === b.takerId &&
    a.position?.x === b.position?.x && a.position?.y === b.position?.y;
}

/** True when a simulation pump went from `before` (the state on screen) to a new repositioning restart. */
export function isSetPieceStart(before: GameState, after: GameState): boolean {
  if (before === after) return false;
  if (!isRepositioningRestart(after.setPiece)) return false;
  if (before.matchPhase !== after.matchPhase || !isLivePhase(after.matchPhase)) return false;
  return !before.setPiece || !sameSetPiece(before.setPiece, after.setPiece);
}

/**
 * Transition length in real seconds for `countdown` (game seconds left, drained at `gameSpeed` per real
 * second); 0 = no transition (too short at this speed).
 */
export function transitionSeconds(countdown: number, gameSpeed: number): number {
  if (!(countdown > 0) || !(gameSpeed > 0)) return 0;
  const seconds = Math.min(SET_PIECE_TRANSITION.MAX_SECONDS, (countdown / gameSpeed) * SET_PIECE_TRANSITION.COUNTDOWN_SHARE);
  return seconds >= SET_PIECE_TRANSITION.MIN_SECONDS ? seconds : 0;
}

export interface SetPieceTransition {
  /** Player positions drawn on the frame before the restart, by id. */
  fromPlayers: ReadonlyMap<number, Pos>;
  fromBall: DrawnBall;
  /** Clock value (real seconds, frozen while paused) when it started. */
  startedAt: number;
  duration: number;
}

export function startTransition(
  fromPlayers: ReadonlyMap<number, Pos>, fromBall: DrawnBall, now: number, duration: number,
): SetPieceTransition | null {
  return duration > 0 ? { fromPlayers, fromBall: { ...fromBall }, startedAt: now, duration } : null;
}

/** Ease in-out cubic. */
export function easeInOut(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Eased progress 0..1 of `tr` at `now`. */
export function transitionProgress(tr: SetPieceTransition, now: number): number {
  return easeInOut((now - tr.startedAt) / tr.duration);
}

/** The transition still runs: not over, and the restart it animates is still frozen (not yet played). */
export function transitionActive(tr: SetPieceTransition | null, now: number, state: GameState): tr is SetPieceTransition {
  if (!tr) return false;
  if (now - tr.startedAt >= tr.duration) return false;
  return isRepositioningRestart(state.setPiece);
}

/** Players drawn mid-transition: `from` → `to` by `k`; a player not in `from` (substitute) is drawn at `to`. */
export function blendPlayers(from: ReadonlyMap<number, Pos>, to: ReadonlyMap<number, Pos>, k: number): Map<number, Pos> {
  const out = new Map<number, Pos>();
  for (const [id, b] of to) {
    const a = from.get(id);
    out.set(id, a ? { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k } : { x: b.x, y: b.y });
  }
  return out;
}

export function blendBall(from: DrawnBall, to: DrawnBall, k: number): DrawnBall {
  return {
    x: from.x + (to.x - from.x) * k,
    y: from.y + (to.y - from.y) * k,
    h: from.h + (to.h - from.h) * k,
  };
}
