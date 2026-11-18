/**
 * Where the ball will be `COHESION.PREDICT_S` real seconds from now, read off the state: the
 * carrier's run when he carries, the flight of a pass or high ball, the roll of a loose ball. The
 * defensive shape anchor (block shift, depth) reads this point; tackles, presses and marks keep the
 * real ball. Pure, no side effects.
 */
import type { GameState } from '@/GameEngine/types';
import { isAerialKind } from '@/GameEngine/types';
import { COHESION } from '@/GameEngine/Configs/CohesionConfig';
import { PASS_YARDS_PER_SEC } from '@/GameEngine/Configs/PassConfig';
import { AERIAL_CONFIG } from '@/GameEngine/Configs/AerialConfig';
import { THROUGH_BALL_CONFIG } from '@/GameEngine/Configs/ThroughBallConfig';
import { PITCH_LENGTH, PITCH_WIDTH } from '@/GameEngine/Domain/pitch';

type Pt = { x: number; y: number };

const ease = (t: number) => t * t * (3 - 2 * t);

/** `from` moved toward `to`, at most `PREDICT_MAX_YDS` from `from`, kept on the pitch. */
function capLead(from: Pt, to: Pt): Pt {
  const dx = to.x - from.x, dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  const k = d > COHESION.PREDICT_MAX_YDS ? COHESION.PREDICT_MAX_YDS / d : 1;
  return {
    x: Math.max(0, Math.min(PITCH_LENGTH, from.x + dx * k)),
    y: Math.max(0, Math.min(PITCH_WIDTH, from.y + dy * k)),
  };
}

/**
 * Predicted ball point `seconds` ahead. `ballPos` is the real ball (`getBallPos`). Without a
 * prediction (switched off, a shot in the air, no holder) it is `ballPos` itself.
 */
export function predictBallPoint(state: GameState, ballPos: Pt, seconds: number = COHESION.PREDICT_S): Pt {
  if (!COHESION.ENABLED || seconds <= 0 || state.shot) return ballPos;

  if (state.looseBall) {
    const { vx, vy } = state.looseBall;
    const v = Math.hypot(vx, vy);
    if (v < 0.01) return ballPos;
    const a = THROUGH_BALL_CONFIG.LOOSE_BALL_DECELERATION;
    const tStop = a > 0 ? v / a : seconds;
    const t = Math.min(seconds, tStop);
    const dist = v * t - 0.5 * a * t * t;
    return capLead(ballPos, { x: ballPos.x + (vx / v) * dist, y: ballPos.y + (vy / v) * dist });
  }

  const pass = state.pass;
  if (pass) {
    const from = state.players.find(p => p.id === pass.fromId);
    if (!from || pass.distance <= 0) return ballPos;
    const receiver = pass.toId !== null && pass.kind !== 'through' ? state.players.find(p => p.id === pass.toId) : undefined;
    const to = receiver ? { x: receiver.x, y: receiver.y } : { x: pass.toX, y: pass.toY };
    const speed = isAerialKind(pass.kind) ? AERIAL_CONFIG.AERIAL_YARDS_PER_SEC : PASS_YARDS_PER_SEC;
    const t = ease(Math.min(1, pass.t + (seconds * speed) / pass.distance));
    return capLead(ballPos, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  }

  const holder = state.players.find(p => p.id === state.ballHolderId);
  if (!holder) return ballPos;
  const d = state.decisions[holder.id];
  if (d?.type !== 'carry') return ballPos;
  const len = Math.hypot(d.dx, d.dy);
  if (len < 0.01) return ballPos;
  const lead = holder.runtimeStats.withBall.carrySpeed * seconds;
  return capLead(ballPos, { x: ballPos.x + (d.dx / len) * lead, y: ballPos.y + (d.dy / len) * lead });
}
