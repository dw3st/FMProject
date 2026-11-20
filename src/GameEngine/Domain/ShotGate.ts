/**
 * FM's shot gate and the shot candidate's value (stage 9, `holder-choice.md` → "Stage 9"). Pure: a position in, the
 * gate factor and the value out. Engine yards; the FM constants (`SHOT_GATE`) are in metres.
 */
import { SHOT_GATE as G } from '@/GameEngine/Configs/ShotGateConfig';
import { M_PER_YD } from '@/GameEngine/Configs/KinematicsConfig';
import { GOAL_Y_MAX, GOAL_Y_MIN, PITCH_LENGTH } from '@/GameEngine/Domain/pitch';

const GOAL_CY = (GOAL_Y_MIN + GOAL_Y_MAX) / 2;

/** Distance (m) from (x, y) to the centre of the goal attacked with `attackDir`. */
export function distToGoalCentreM(x: number, y: number, attackDir: 1 | -1): number {
  const goalX = attackDir === 1 ? PITCH_LENGTH : 0;
  return Math.hypot(goalX - x, GOAL_CY - y) * M_PER_YD;
}

/** Inside the penalty box (FM's box lane): within 16.459 m of the goal line and 20.117 m of the goal's axis. */
export function inBoxLane(x: number, y: number, attackDir: 1 | -1): boolean {
  const goalX = attackDir === 1 ? PITCH_LENGTH : 0;
  return Math.abs(goalX - x) * M_PER_YD <= G.BOX_DEPTH_M && Math.abs(y - GOAL_CY) * M_PER_YD <= G.BOX_HALF_WIDTH_M;
}

/** FM's gate factor of a shot from (x, y): × IN_BOX_MULT in the box, × OUT_BOX_MULT outside, null beyond GATE_M. */
export function shotGateFactor(x: number, y: number, attackDir: 1 | -1): number | null {
  if (distToGoalCentreM(x, y, attackDir) > G.GATE_M) return null;
  return inBoxLane(x, y, attackDir) ? G.IN_BOX_MULT : G.OUT_BOX_MULT;
}

/**
 * Value of a shot candidate (0..1): the gate factor × (VALUE_FLOOR + (1 − VALUE_FLOOR) × min(1, (clean xG / ref)^pow)). `cleanXg` is the shot's xG from the shooter's own geometry (only the keeper on the pitch): the defenders
 * in the way are not read here, they block the ball in flight.
 */
export function shotCandidateValue(cleanXg: number, threshold: number, factor: number): number {
  if (!(cleanXg > 0) || !(threshold > 0) || !(factor > 0)) return 0;
  return factor * (G.VALUE_FLOOR + (1 - G.VALUE_FLOOR) * Math.min(1, (cleanXg / threshold) ** G.VALUE_POW));
}
