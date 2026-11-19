/**
 * Pass launch error (stage 4b, `.claude/rules/game-engine/fm-numbers.md`), FM27's form:
 *
 *   s       = clamp(MARGIN_SPAN · passing − MARGIN_PER_M · d_m, 0, MARGIN_MAX)        technique against distance
 *   factor  = (1 − s/50) · (1 + ERR_PRESSURE · P/100)                                  P = FM pressure on the passer
 *   σ_along = ERR_REL · factor · d · ALONG_SCALE          σ_side = d · tan(ERR_ANGLE_DEG · factor)     (yards)
 *
 * The ball lands at the receiver's point + (along, side) Gaussian offsets; outside the reach ellipse (REACH_ALONG_YD,
 * REACH_SIDE_YD, + REACH_TOUCH_YD × first touch) it misses him and runs loose. Pure: the dice are passed in.
 */
import { FM_NUMBERS as F } from '@/GameEngine/Configs/FmNumbersConfig';

const M_PER_YD = 0.9144;

/** σ (yards) along and across the pass. */
export function passErrorSigma(passing: number, distanceYd: number, pressure: number, lofted = false): { along: number; side: number } {
  const dM = distanceYd * M_PER_YD;
  const s = Math.max(0, Math.min(F.MARGIN_MAX, F.MARGIN_SPAN * passing - F.MARGIN_PER_M * dM));
  const factor = (1 - s / 50) * (1 + (F.ERR_PRESSURE * Math.max(0, pressure)) / 100) * (lofted ? F.LOFT_ERR_MULT : 1);
  return {
    along: F.ERR_REL * factor * distanceYd * F.ALONG_SCALE,
    side: distanceYd * Math.tan((F.ERR_ANGLE_DEG * factor * Math.PI) / 180),
  };
}

/** The receiver's reach ellipse (yards). */
export function passReach(firstTouch: number): { along: number; side: number } {
  const t = F.REACH_TOUCH_YD * Math.max(0, Math.min(1, firstTouch));
  return { along: F.REACH_ALONG_YD + t, side: F.REACH_SIDE_YD + t };
}

/** Chance the launch misses the receiver's reach (analytic, isotropic approximation of the normalised offsets). */
export function passMissChance(passing: number, distanceYd: number, pressure: number, firstTouch: number, lofted = false): number {
  const sg = passErrorSigma(passing, distanceYd, pressure, lofted);
  const r = passReach(firstTouch);
  const a = sg.along / r.along, b = sg.side / r.side;
  const s2 = (a * a + b * b) / 2;
  return s2 > 0 ? Math.exp(-1 / (2 * s2)) : 0;
}

/** One launch: offsets (yards) along and across the pass and whether the receiver misses it. `z0`, `z1` standard normals. */
export function passLaunch(
  passing: number, distanceYd: number, pressure: number, firstTouch: number, z0: number, z1: number, lofted = false,
): { along: number; side: number; miss: boolean } {
  const sg = passErrorSigma(passing, distanceYd, pressure, lofted);
  const r = passReach(firstTouch);
  const along = z0 * sg.along, side = z1 * sg.side;
  return { along, side, miss: (along / r.along) ** 2 + (side / r.side) ** 2 > 1 };
}
