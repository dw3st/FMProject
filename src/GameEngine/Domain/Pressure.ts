/**
 * Pressure on a ball holder, Football Manager's scalar (reverse-engineered; `.claude/rules/game-engine/decisions.md`).
 *
 * FM works in metres; our pitch is in yards, so every distance is converted to metres first (1 yd = 0.9144 m):
 *
 *   contribution(o) = W · ((R − d) / k)² / R      for every opponent o within R = 12 m (≈ 13.12 yd), d in metres
 *   k = 1 free · 2 recovering one tick · 3 recovering two ticks or more (our `recoveryTime`, one tick = 0.2 s)
 *   extra pressers count half:  P = Σ − (Σ − strongest) / 2
 *   nearest opponent beyond 1 m (≈ 1.09 yd): P = max(P / d0, (P + 1) / 2), d0 = nearest distance in metres
 *
 * The extra-presser halving is applied to the raw sum, before the nearest-distance adjustment, so `strongest` is on the
 * same scale as the sum it is taken from. Nobody within R = 0. Pure: no dice, no state. Phase 2 only measures it; the
 * holder's panic gate (phase 3) will read it.
 */
import { DECISION_TELEMETRY as T } from '@/GameEngine/Configs/DecisionConfig';

/** The few fields of an opponent the scalar reads. */
export interface PressureOpponent {
  x: number;
  y: number;
  recoveryTime: number;
}

/** k of an opponent by his recovery time (seconds). */
export function pressureK(recoveryTime: number): number {
  if (!(recoveryTime > 0)) return T.K_FREE;
  return recoveryTime > T.TICK_S + 1e-9 ? T.K_RECOVERING_MORE : T.K_RECOVERING_ONE;
}

/** FM's pressure scalar on a holder at (x, y) yards from `opponents` (the other team's players on the pitch). */
export function holderPressure(x: number, y: number, opponents: readonly PressureOpponent[]): number {
  const R = T.PRESSURE_RADIUS_M;
  let sum = 0;
  let strongest = 0;
  let nearestM = Infinity;
  for (const o of opponents) {
    const dM = Math.hypot(o.x - x, o.y - y) * T.M_PER_YD;
    if (dM >= R) continue;
    const c = (T.WEIGHT * ((R - dM) / pressureK(o.recoveryTime)) ** 2) / R;
    sum += c;
    if (c > strongest) strongest = c;
    if (dM < nearestM) nearestM = dM;
  }
  if (sum <= 0) return 0;
  let p = sum - (sum - strongest) / 2;
  if (nearestM > T.NEAREST_M) p = Math.max(p / nearestM, (p + 1) / 2);
  return p;
}
