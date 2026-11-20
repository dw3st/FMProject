/**
 * Predicted path of the 3D ball for the `/test` "Ball 3D" overlay (stage 3, `ball-3d.md`): a pass / shot in flight
 * to its target over the time it has left (height from free physics), a loose ball over the next 3 s. Drawing only.
 */
import type { GameState } from "@/GameEngine/types";
import { ballEnv, passRate } from "@/GameEngine/Domain/BallSync";
import { predictPath, stepFree, type Ball3D } from "@/GameEngine/Domain/Ball3D";
import { SHOT_SPEED } from "@/GameEngine/Infrastructure/ActionOutcomes";

export interface PathPoint { x: number; y: number; z: number }

const STEP = 0.1;

export function ballFlightPath(state: GameState, passSpeed = 0.85): PathPoint[] {
  const b = state.ball;
  if (!b || b.phase === "held") return [];
  const env = ballEnv(state.weather);
  if (b.phase === "loose") return predictPath(b, 3, STEP, env).map(({ x, y, z }) => ({ x, y, z }));
  // A physical pass (stage 4): free physics from where it is, for the flight it has left (at least a second).
  if (b.phase === "pass" && b.free && state.pass) {
    const left = Math.max(1, (1 - state.pass.t) / passRate(state.pass, passSpeed));
    return predictPath(b, left, STEP, env).map(({ x, y, z }) => ({ x, y, z }));
  }
  // A physical shot (stage 7): free physics from where it is, to the line.
  if (b.phase === "shot" && b.free && state.shot?.physics) {
    const ph = state.shot.physics;
    return predictPath(b, Math.max(0.3, ph.T - ph.elapsed + 0.2), STEP, env).map(({ x, y, z }) => ({ x, y, z }));
  }
  const left = b.phase === "shot" && state.shot ? (1 - state.shot.t) / SHOT_SPEED
    : b.phase === "pass" && state.pass ? (1 - state.pass.t) / passRate(state.pass, passSpeed) : 0;
  const to = b.phase === "shot" && state.shot ? { x: state.shot.toX, y: state.shot.toY }
    : state.pass ? { x: state.pass.toX, y: state.pass.toY } : { x: b.x, y: b.y };
  const out: PathPoint[] = [{ x: b.x, y: b.y, z: b.z }];
  let v: Ball3D = { x: b.x, y: b.y, z: b.z, vx: 0, vy: 0, vz: b.vz };
  for (let t = STEP; t < left + STEP / 2; t += STEP) {
    const tt = Math.min(t, left);
    v = stepFree(v, Math.min(STEP, left - (t - STEP)), env).ball;
    const k = left > 0 ? tt / left : 1;
    out.push({ x: b.x + (to.x - b.x) * k, y: b.y + (to.y - b.y) * k, z: tt >= left - 1e-6 && b.arriveZ !== undefined ? b.arriveZ : v.z });
  }
  return out;
}
