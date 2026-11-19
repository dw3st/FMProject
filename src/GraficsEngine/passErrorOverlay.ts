/**
 * The `/test` "Pass error" overlay (stage 4, `pass-physics.md`). With the ball held: around every teammate the 1-σ
 * spread across the pass the holder's error would give a ball to him (d · tan(ERR_ANGLE_DEG · factor)). With a
 * physical pass in flight: where it was aimed and where the physics takes it. Drawing only, no state.
 */
import type { GameState } from "@/GameEngine/types";
import { FM_NUMBERS } from "@/GameEngine/Configs/FmNumbersConfig";
import { passErrorFactor } from "@/GameEngine/Domain/PassError";
import { holderPressure } from "@/GameEngine/Domain/Pressure";

export interface PassErrorRing { x: number; y: number; r: number }
export interface PassErrorAim { ox: number; oy: number; aimX: number; aimY: number; toX: number; toY: number; type: string }

export function passErrorOverlay(state: GameState): { rings: PassErrorRing[]; aim: PassErrorAim | null } {
  const ph = state.pass?.physics;
  if (state.pass && ph) {
    return { rings: [], aim: { ox: ph.ox, oy: ph.oy, aimX: ph.aimX, aimY: ph.aimY, toX: state.pass.toX, toY: state.pass.toY, type: ph.type } };
  }
  if (state.pass || state.shot || state.looseBall) return { rings: [], aim: null };
  const holder = state.players.find(p => p.id === state.ballHolderId);
  if (!holder) return { rings: [], aim: null };
  const opps = state.players.filter(p => p.team !== holder.team);
  const pressure = holderPressure(holder.x, holder.y, opps);
  const rings: PassErrorRing[] = [];
  for (const p of state.players) {
    if (p.team !== holder.team || p.id === holder.id || p.role === "GK") continue;
    const d = Math.hypot(p.x - holder.x, p.y - holder.y);
    if (d > FM_NUMBERS.LOFT_YD) continue;
    const f = passErrorFactor(holder.runtimeStats.withBall.passingSkill, d, pressure);
    rings.push({ x: p.x, y: p.y, r: d * Math.tan((FM_NUMBERS.ERR_ANGLE_DEG * f * Math.PI) / 180) });
  }
  return { rings, aim: null };
}
