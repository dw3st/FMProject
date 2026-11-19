/**
 * FM-style expected goals (stage 6, `.claude/rules/game-engine/xg.md`). Pure: geometry in, xG out.
 *
 * The shooter's position is in engine yards; the features are built in metres in a goal frame (lateral `u` across the
 * goal line, positive to the y > 37 side; depth `v` from the goal line toward the pitch). Models and coefficients live
 * in `Configs/XgConfig.ts`.
 */
import { XG_CONFIG as C, XG_FEATURES, XG_MODELS, type XgFeature, type XgModelName } from '@/GameEngine/Configs/XgConfig';
import { M_PER_YD } from '@/GameEngine/Configs/KinematicsConfig';
import { GOAL_Y_MAX, GOAL_Y_MIN, PITCH_LENGTH } from '@/GameEngine/Domain/pitch';
import { clamp } from '@/Domain/math';

export type FmShotKind = 'ground' | 'volley' | 'header' | 'free_kick' | 'penalty';

export type XgFeatures = Record<XgFeature, number>;

/** Another player on the pitch (both teams, the shooter left out). `keeper` = covers a keeper-wide segment. */
export interface XgPlayer { x: number; y: number; keeper?: boolean }

export interface FmXgInput {
  /** Shot point (engine yards). */
  x: number;
  y: number;
  /** +1 attacks the x = PITCH_LENGTH goal, −1 the x = 0 goal. */
  attackDir: 1 | -1;
  /** Everyone else on the pitch. */
  others: readonly XgPlayer[];
  /** Degrees between the body (last movement) and the goal, 0..180; null = facing the goal. */
  facingDeg?: number | null;
  /** Ball height at contact (m). A ground kind with the ball at VOLLEY_HEIGHT_M or more is a volley. */
  ballHeightM?: number;
  kind: FmShotKind;
}

export interface FmXgResult {
  xg: number;
  model: XgModelName;
  features: XgFeatures;
  /** Goal width the shooter's view cone covers (m), and the covered part of it. */
  availableM: number;
  coveredM: number;
  /** Players inside the shooter–posts triangle. */
  inTriangle: number;
}

const GOAL_CY = (GOAL_Y_MIN + GOAL_Y_MAX) / 2;

/** Logistic link over the features of one model. */
export function fmXgFromFeatures(model: XgModelName, f: XgFeatures): number {
  const mdl = XG_MODELS[model];
  let z = mdl.b;
  for (const k of XG_FEATURES) z += mdl.c[k] * f[k];
  return 1 / (1 + Math.exp(-z));
}

/** The model of a shot kind at a visible fraction `v`. */
export function xgModelFor(kind: FmShotKind, v: number): XgModelName {
  if (kind === 'free_kick') return 'free_kicks';
  if (kind === 'penalty') return 'penalties';
  const band = v > C.OPEN_FRACTION ? 'open' : v < C.OBSCURED_FRACTION ? 'obscured' : 'mid';
  const base = kind === 'header' ? 'headers' : kind === 'volley' ? 'volleys' : 'regular';
  return (band === 'mid' ? base : `${band === 'open' ? 'open_goal' : 'obscured'}_${base}`) as XgModelName;
}

export const isChance = (xg: number): boolean => xg >= C.CHANCE;
export const isClearChance = (xg: number): boolean => xg >= C.CLEAR_CHANCE;

/** Point (u, v) in metres in the goal frame of a shot attacking `attackDir`. */
function toGoalFrame(x: number, y: number, attackDir: 1 | -1): { u: number; v: number } {
  const goalX = attackDir === 1 ? PITCH_LENGTH : 0;
  return { u: (y - GOAL_CY) * M_PER_YD, v: (goalX - x) * attackDir * M_PER_YD };
}

/** Is P inside triangle (A, B, Cc) with a barycentric tolerance. */
function inTriangle(px: number, py: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean {
  const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(den) < 1e-12) return false;
  const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den;
  const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den;
  const l3 = 1 - l1 - l2;
  const t = -C.TRIANGLE_TOL;
  return l1 >= t && l2 >= t && l3 >= t;
}

/** Where the line from S through E crosses the goal line (v = 0); null when it never gets there. */
function onGoalLine(su: number, sv: number, eu: number, ev: number): number | null {
  const dv = ev - sv;
  if (dv >= -1e-9) return null; // not moving toward the goal line
  return su + (eu - su) * (-sv / dv);
}

/**
 * The FM xG of one shot. Distance, blockers in the shooter–posts triangle, angle of the shot point and of the body,
 * ball height, the visible fraction of the goal; the model picked by kind and visible fraction.
 */
export function fmShotXG(input: FmXgInput): FmXgResult {
  const { u: su, v: rawV } = toGoalFrame(input.x, input.y, input.attackDir);
  const sv = Math.max(0.01, rawV);
  const H = C.HALF_GOAL_M;
  const d = Math.hypot(su, sv);

  // Players in the shooter–posts triangle.
  let occluding = 0;
  let count = 0;
  const blockers: { u: number; v: number; w: number }[] = [];
  for (const o of input.others) {
    const p = toGoalFrame(o.x, o.y, input.attackDir);
    if (!inTriangle(p.u, p.v, su, sv, -H, 0, H, 0)) continue;
    count++;
    const r = Math.hypot(p.u - su, p.v - sv);
    const t = clamp(1 - r / d, 0, 1);
    occluding = Math.max(occluding, t * t);
    blockers.push({ u: p.u, v: p.v, w: o.keeper ? C.KEEPER_WIDTH_M : C.BLOCKER_WIDTH_M });
  }

  // Angle of the shot point off the straight-on axis, in whole degrees.
  const angLocDeg = Math.round((Math.atan2(Math.abs(su), rawV) * 180) / Math.PI);
  const facingDeg = clamp(input.facingDeg ?? 0, 0, 180);

  // Visible fraction: the view cone (± VIEW_CONE_DEG around the bearing to the goal centre) gives the available width.
  const dirU = -su / d, dirV = -sv / d;
  const cone = (C.VIEW_CONE_DEG * Math.PI) / 180;
  const ends: number[] = [];
  for (const sgn of [1, -1]) {
    const cu = dirU * Math.cos(cone) - sgn * dirV * Math.sin(cone);
    const cv = sgn * dirU * Math.sin(cone) + dirV * Math.cos(cone);
    const hit = cv < -1e-9 ? su + cu * (-sv / cv) : (cu >= 0 ? Infinity : -Infinity);
    ends.push(clamp(hit, -H, H));
  }
  const lo = Math.min(ends[0]!, ends[1]!), hi = Math.max(ends[0]!, ends[1]!);
  const available = hi - lo;

  // Each blocker is a segment across the shot direction, projected from the shooter onto the goal line.
  const perpU = -dirV, perpV = dirU;
  const segs: [number, number][] = [];
  for (const b of blockers) {
    const h = b.w / 2;
    const a = onGoalLine(su, sv, b.u + perpU * h, b.v + perpV * h);
    const c = onGoalLine(su, sv, b.u - perpU * h, b.v - perpV * h);
    if (a === null || c === null) continue;
    const s0 = clamp(Math.min(a, c), lo, hi), s1 = clamp(Math.max(a, c), lo, hi);
    if (s1 > s0) segs.push([s0, s1]);
  }
  segs.sort((p, q) => p[0] - q[0]);
  let covered = 0, curA = -Infinity, curB = -Infinity;
  for (const [a, b] of segs) {
    if (a > curB) { if (curB > curA) covered += curB - curA; curA = a; curB = b; }
    else curB = Math.max(curB, b);
  }
  if (curB > curA) covered += curB - curA;
  const fraction = available > 0 ? clamp(1 - covered / available, 0, 1) : 0;

  const z = clamp(input.ballHeightM ?? 0, 0, C.HEIGHT_M);
  const features: XgFeatures = {
    distance: clamp(1 - d / C.DIST_M, 0, 1),
    occluding,
    between: count / C.BETWEEN_DIV,
    angleLocation: Math.max(0, 90 - angLocDeg) / 90,
    angleFacing: (180 - facingDeg) / 180,
    height: z / C.HEIGHT_M,
    fraction,
  };
  const kind = input.kind === 'ground' && z >= C.VOLLEY_HEIGHT_M ? 'volley' : input.kind;
  const model = xgModelFor(kind, fraction);
  return { xg: fmXgFromFeatures(model, features), model, features, availableM: available, coveredM: covered, inTriangle: count };
}
