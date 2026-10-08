/**
 * Referee and assistant referees (pure, drawing only): where they stand, in ENGINE yards (the mirror
 * is applied by `toPixel`). Nothing here touches the GameState (spec 2026-10-08-match-visual §3).
 */
import { computeOffsideLine } from "@/GameEngine/Domain/Offside";
import { PITCH_LENGTH, PITCH_MID_X, PITCH_WIDTH } from "@/GameEngine/Domain/pitch";
import type { GamePlayer, TeamId } from "@/GameEngine/types";

export const OFFICIALS = {
  /** The referee never stands closer than this to the ball (yd). */
  MIN_BALL_DIST: 6,
  /** Kept this far inside the touchlines / goal lines (yd). */
  EDGE: 2,
  /** Diagonal offset from the ball: behind the play (x) and towards the centre (y). */
  DIAG_X: 8, DIAG_Y: 10,
  /** Set pieces: diagonal offset on each axis (~10 yd away, clear of the wall). */
  SET_PIECE_DIAG: 7,
  /** A player closer than this to the target pushes it PLAYER_SHIFT further out. */
  PLAYER_CLEAR: 1.5, PLAYER_SHIFT: 2,
  /** Max speeds (yd per game second). */
  REF_SPEED: 8, AR_SPEED: 9,
  /** Exponential smoothing of the referee (game seconds). */
  SMOOTH_TAU: 0.6,
  /** Farther than this (tab back, side switch, repositioned restart): jump to the target. */
  SNAP_DIST: 30,
  /** Assistants' y (engine yards, just off the pitch). */
  AR_Y_TOP: -1, AR_Y_BOTTOM: 75,
  /** After a card, the referee's target stays on the foul spot this long (real seconds). */
  CARD_HOLD_S: 1.5,
} as const;

export interface YdPos { x: number; y: number }
export type AssistantSide = "top" | "bottom";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clampToPitch = (p: YdPos): YdPos => ({
  x: clamp(p.x, OFFICIALS.EDGE, PITCH_LENGTH - OFFICIALS.EDGE),
  y: clamp(p.y, OFFICIALS.EDGE, PITCH_WIDTH - OFFICIALS.EDGE),
});
const inPitch = (p: YdPos) =>
  p.x >= OFFICIALS.EDGE && p.x <= PITCH_LENGTH - OFFICIALS.EDGE && p.y >= OFFICIALS.EDGE && p.y <= PITCH_WIDTH - OFFICIALS.EDGE;

/** Pushes `p` out to MIN_BALL_DIST from the ball, staying inside the pitch. */
function keepFromBall(p: YdPos, ball: YdPos, fallbackDir: YdPos): YdPos {
  const dx = p.x - ball.x, dy = p.y - ball.y;
  const d = Math.hypot(dx, dy);
  if (d >= OFFICIALS.MIN_BALL_DIST) return p;
  const base = d > 1e-6 ? Math.atan2(dy, dx) : Math.atan2(fallbackDir.y, fallbackDir.x);
  // Same direction first, then fanning out until a spot inside the pitch is found.
  for (let i = 0; i <= 18; i++) {
    for (const sign of i === 0 ? [1] : [1, -1]) {
      const a = base + sign * i * (Math.PI / 18);
      const c = { x: ball.x + Math.cos(a) * OFFICIALS.MIN_BALL_DIST, y: ball.y + Math.sin(a) * OFFICIALS.MIN_BALL_DIST };
      if (inPitch(c)) return c;
    }
  }
  return clampToPitch(p);
}

/**
 * Where the referee wants to be: diagonally behind the play (against the attack of the team on the
 * ball) and towards the centre, ≥ MIN_BALL_DIST from the ball, inside the pitch, off any player.
 * `setPiece`: a restart — 10 yd on the diagonal from the ball.
 */
export function refereeTarget(o: { ball: YdPos; attackDir: 1 | -1; players: readonly YdPos[]; setPiece?: boolean }): YdPos {
  const { ball, attackDir } = o;
  const towardsCentre = ball.y < PITCH_WIDTH / 2 ? 1 : -1;
  const ox = o.setPiece ? OFFICIALS.SET_PIECE_DIAG : OFFICIALS.DIAG_X;
  const oy = o.setPiece ? OFFICIALS.SET_PIECE_DIAG : OFFICIALS.DIAG_Y;
  const fallback = { x: -attackDir, y: towardsCentre };
  let t = keepFromBall(clampToPitch({ x: ball.x - attackDir * ox, y: ball.y + towardsCentre * oy }), ball, fallback);
  for (let i = 0; i < 3; i++) {
    const blocking = o.players.some((p) => Math.hypot(p.x - t.x, p.y - t.y) < OFFICIALS.PLAYER_CLEAR);
    if (!blocking) break;
    const dx = t.x - ball.x, dy = t.y - ball.y;
    const d = Math.hypot(dx, dy) || 1;
    t = keepFromBall(clampToPitch({ x: t.x + (dx / d) * OFFICIALS.PLAYER_SHIFT, y: t.y + (dy / d) * OFFICIALS.PLAYER_SHIFT }), ball, fallback);
  }
  return t;
}

/**
 * One drawing step towards `target`: exponential smoothing (SMOOTH_TAU) capped at `maxSpeed`
 * yd per game second; jumps straight to the target past SNAP_DIST. `smooth: false` = straight at max speed.
 */
export function stepToward(pos: YdPos, target: YdPos, dtGame: number, maxSpeed: number, smooth = true): YdPos {
  const dx = target.x - pos.x, dy = target.y - pos.y;
  const d = Math.hypot(dx, dy);
  if (d > OFFICIALS.SNAP_DIST) return { x: target.x, y: target.y };
  if (d < 1e-9 || dtGame <= 0) return pos;
  const wanted = smooth ? d * (1 - Math.exp(-dtGame / OFFICIALS.SMOOTH_TAU)) : d;
  const step = Math.min(wanted, maxSpeed * dtGame, d);
  return { x: pos.x + (dx / d) * step, y: pos.y + (dy / d) * step };
}

/** Which assistant runs the half where `lineX` lies (top covers x ≥ halfway). */
export function assistantForLineX(lineX: number): AssistantSide {
  return lineX >= PITCH_MID_X ? "top" : "bottom";
}

/**
 * Assistant target: level with the offside line of the team attacking into his half (top: x ≥
 * halfway, bottom: x ≤ halfway), clamped to that half, just off the pitch.
 */
export function assistantTarget(
  state: { players: readonly GamePlayer[]; ball: YdPos },
  side: AssistantSide,
): YdPos {
  const dir: 1 | -1 = side === "top" ? 1 : -1;
  const attacker = state.players.find((p) => p.attackDir === dir);
  const team: TeamId | null = attacker ? attacker.team : null;
  const line = team ? computeOffsideLine(dir, state.players as GamePlayer[], team, state.ball.x) : null;
  const x = line ?? state.ball.x;
  return side === "top"
    ? { x: clamp(x, PITCH_MID_X, PITCH_LENGTH), y: OFFICIALS.AR_Y_TOP }
    : { x: clamp(x, 0, PITCH_MID_X), y: OFFICIALS.AR_Y_BOTTOM };
}
