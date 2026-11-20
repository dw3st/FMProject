/**
 * The shot by its trajectory (engine rebuild stage 7, `.claude/rules/game-engine/shot-and-save.md` → "Stage 7"). Pure:
 * no state; the draws are passed in (`rng`, standard normals).
 *
 * - `chooseTechnique`: power, placed, lob, volley (the header, the free kick and the chip are chosen by their callers);
 * - `aimPoint`: the corner (the side with more room past the keeper, mostly) and the height at the line;
 * - `shotErrorFactor` / `applyShotError`: FM's launch error with the shot base (105) and its speed term;
 * - `directLaunch` / `dipLaunch`: the launch vector to a crossing point (over a wall or a keeper for `dipLaunch`);
 * - `lineCrossing` / `classifyCrossing`: where the ball crosses the goal line and what it is (goal, post, bar, wide, over);
 * - the keeper's reaction, dive and hands; `saveChances`; the blockers' reach and `blockChances`.
 */
import { SHOT_PHYSICS as S } from '@/GameEngine/Configs/ShotPhysicsConfig';
import { FM_NUMBERS } from '@/GameEngine/Configs/FmNumbersConfig';
import { PASS_PHYSICS } from '@/GameEngine/Configs/PassPhysicsConfig';
import { BALL_PHYSICS } from '@/GameEngine/Configs/BallPhysicsConfig';
import { passErrorFactor } from '@/GameEngine/Domain/PassError';
import type { Ball3D } from '@/GameEngine/Domain/Ball3D';
import { GOAL_Y_MAX, GOAL_Y_MIN } from '@/GameEngine/Domain/pitch';

/** 1 m in yards. */
export const YD_PER_M = 1.0936;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

export type { ShotTechnique } from '@/GameEngine/types';
import type { ShotTechnique } from '@/GameEngine/types';

export interface TechniqueInput {
  /** Shooter to the goal centre (yd). */
  distYd: number;
  /** The keeper's distance from his goal line (yd); Infinity with no keeper. */
  keeperOffLine: number;
  /** Shooter to keeper (yd), with the keeper between the shooter and the goal (false: not in the way). */
  keeperGap: number;
  keeperAhead: boolean;
  /** Ball height at the strike (yd). */
  ballZ: number;
  /** Finishing 0..1. */
  skill: number;
}

/** The technique of an open-play kick at goal (a header, a free kick and a chip are decided by their callers). */
export function chooseTechnique(t: TechniqueInput, rng: () => number): ShotTechnique {
  if (t.ballZ >= S.VOLLEY_Z) return 'volley';
  if (t.keeperAhead && t.keeperOffLine >= S.LOB_KEEPER_OFF && t.distYd >= S.LOB_MIN_YD && t.distYd <= S.LOB_MAX_YD
    && t.keeperGap >= S.LOB_KEEPER_GAP) return 'lob';
  if (t.distYd <= S.PLACED_MAX_YD && rng() < S.PLACED_BASE + S.PLACED_SKILL * clamp01(t.skill)) return 'placed';
  return 'power';
}

/** Launch speed (m/s) of a technique (the lob, the chip and the free kick take theirs from their trajectory). */
export function shotSpeedMs(technique: ShotTechnique, skill: number): number {
  const s = clamp01(skill);
  switch (technique) {
    case 'placed': return S.PLACED_BASE_MS + S.PLACED_SKILL_MS * s;
    case 'volley': return S.VOLLEY_BASE_MS + S.VOLLEY_SKILL_MS * s;
    case 'header': return S.HEADER_BASE_MS + S.HEADER_SKILL_MS * s;
    default: return S.POWER_BASE_MS + S.POWER_SKILL_MS * s;
  }
}

export interface AimInput {
  fromX: number; fromY: number; goalX: number;
  /** Keeper position (null: none). */
  keeper: { x: number; y: number } | null;
  technique: ShotTechnique;
  skill: number;
}

/** Where the keeper covers on the goal line, seen from the shooter (his y projected on the line). */
export function keeperShadowY(fromX: number, fromY: number, goalX: number, keeper: { x: number; y: number }): number {
  const dk = Math.abs(keeper.x - fromX);
  const dg = Math.abs(goalX - fromX);
  if (dk < 0.5) return keeper.y;
  return fromY + (keeper.y - fromY) * (dg / dk);
}

/** The aimed crossing point on the goal line: y and height (yd). One or two draws (side, height). */
export function aimPoint(a: AimInput, rng: () => number): { y: number; z: number } {
  const inside = (S.AIM_INSIDE_M + (1 - clamp01(a.skill)) * S.AIM_INSIDE_SKILL_M) * YD_PER_M;
  const left = GOAL_Y_MIN + inside, right = GOAL_Y_MAX - inside;
  let y: number;
  if (a.technique === 'lob' || a.technique === 'chip') {
    // Over him: toward the middle of what he leaves, kept inside the posts.
    const ky = a.keeper ? keeperShadowY(a.fromX, a.fromY, a.goalX, a.keeper) : (GOAL_Y_MIN + GOAL_Y_MAX) / 2;
    y = clamp(ky, left, right);
  } else {
    const ky = a.keeper ? clamp(keeperShadowY(a.fromX, a.fromY, a.goalX, a.keeper), GOAL_Y_MIN, GOAL_Y_MAX) : (GOAL_Y_MIN + GOAL_Y_MAX) / 2;
    const gapLeft = ky - GOAL_Y_MIN, gapRight = GOAL_Y_MAX - ky;
    const bigger = gapLeft >= gapRight ? left : right;
    const smaller = bigger === left ? right : left;
    y = rng() < S.FAR_SIDE_BASE + S.FAR_SIDE_SKILL * clamp01(a.skill) ? bigger : smaller;
  }
  const highShare = a.technique === 'placed' ? S.HIGH_PLACED : a.technique === 'volley' ? S.HIGH_VOLLEY
    : a.technique === 'header' ? S.HIGH_HEADER : a.technique === 'free_kick' ? S.HIGH_FREE_KICK : S.HIGH_POWER;
  const z = a.technique === 'lob' || a.technique === 'chip' ? S.LOB_LINE_Z
    : (rng() < highShare ? S.HIGH_Z_M : S.LOW_Z_M) * YD_PER_M;
  return { y, z };
}

/**
 * FM's launch error factor for a shot: the pass factor (technique margin against the distance, pressure) × the base
 * ratio 105 / 95 × the speed term (base/10 + G·|v|) / (base/10 + G·|v_pass(d)|), the pass of the same distance at FM's
 * launch speed. `marginPenalty` (points of margin) makes a technique harder.
 */
export function shotErrorFactor(skill: number, distYd: number, pressure: number, speedMs: number, marginPenalty = 0, base = S.BASE_SHOT): number {
  const skillEff = clamp01(skill - marginPenalty / FM_NUMBERS.MARGIN_SPAN);
  const pass = passErrorFactor(skillEff, distYd, pressure);
  const dM = distYd / YD_PER_M;
  const vPass = PASS_PHYSICS.SPEED_BASE + PASS_PHYSICS.SPEED_PER_M * dM;
  const speed = (base / 10 + S.SPEED_TERM * speedMs) / (S.BASE_PASS / 10 + S.SPEED_TERM * vPass);
  return pass * (base / S.BASE_PASS) * speed;
}

export interface Launch3 { vx: number; vy: number; vz: number }

/**
 * The launch error on the vector (the 4b angle and speed errors, the pass's vertical share): the direction turns by
 * ERR_ANGLE_DEG·factor·z0, the horizontal speed × (1 + z1·ERR_REL·factor), vz + z2·VZ_ERR_SHARE·ERR_REL·factor·|v|
 * (a shot can be driven down: no floor on vz). `mult` scales it (the weather on long shots).
 */
export function applyShotError(v: Launch3, factor: number, z0: number, z1: number, z2: number, mult = 1): Launch3 & { errDeg: number } {
  const rel = FM_NUMBERS.ERR_REL * factor * mult;
  const errDeg = FM_NUMBERS.ERR_ANGLE_DEG * factor * mult * z0;
  const ang = (errDeg * Math.PI) / 180;
  const c = Math.cos(ang), s = Math.sin(ang);
  const k = Math.max(0.3, 1 + z1 * rel);
  const speed = Math.hypot(v.vx, v.vy, v.vz);
  return {
    vx: (v.vx * c - v.vy * s) * k,
    vy: (v.vx * s + v.vy * c) * k,
    vz: v.vz + z2 * PASS_PHYSICS.VZ_ERR_SHARE * rel * speed,
    errDeg,
  };
}

/** Straight at the aim: horizontal speed `speedYd`, the vz that crosses the aim point at its height. */
export function directLaunch(from: { x: number; y: number; z: number }, aim: { x: number; y: number; z: number }, speedYd: number): Launch3 {
  const dx = aim.x - from.x, dy = aim.y - from.y;
  const d = Math.hypot(dx, dy) || 1e-6;
  const vh = Math.max(1, speedYd);
  const T = d / vh;
  const g = BALL_PHYSICS.GRAVITY;
  return { vx: (dx / d) * vh, vy: (dy / d) * vh, vz: (aim.z - from.z + 0.5 * g * T * T) / T };
}

/**
 * A dipping ball through two heights: at least `over.z` at `over.d` yards along the way (a wall, a keeper), then the
 * aim point. Solves z(s) = z0 + p·s − q·s² for p, q (q = g / 2v²). Null when no such parabola exists (q ≤ 0, or the
 * obstacle is not between).
 */
export function dipLaunch(
  from: { x: number; y: number; z: number }, over: { d: number; z: number }, aim: { x: number; y: number; z: number },
): Launch3 | null {
  const dx = aim.x - from.x, dy = aim.y - from.y;
  const D = Math.hypot(dx, dy);
  const d = over.d;
  if (!(D > 1) || !(d > 0.5) || d >= D - 0.5) return null;
  const a = over.z - from.z, b = aim.z - from.z;
  // p·d − q·d² = a ; p·D − q·D² = b  →  q = (a·D − b·d) / (d·D·(D − d))
  const q = (a * D - b * d) / (d * D * (D - d));
  if (!(q > 1e-6)) return null;
  const p = (a + q * d * d) / d;
  const vh = Math.sqrt(BALL_PHYSICS.GRAVITY / (2 * q));
  return { vx: (dx / D) * vh, vy: (dy / D) * vh, vz: p * vh };
}

export type CrossingKind = 'goal' | 'post' | 'bar' | 'wide' | 'over';

/** Where the segment a → b of the ball crosses the goal line x = goalX (null: it does not). */
export function lineCrossing(a: Ball3D, b: Ball3D, goalX: number): { y: number; z: number; f: number } | null {
  const da = a.x - goalX, db = b.x - goalX;
  if (da === 0 && db === 0) return null;
  if (Math.sign(da) === Math.sign(db) && db !== 0) return null;
  const f = Math.abs(da) / (Math.abs(da) + Math.abs(db) || 1);
  return { y: a.y + (b.y - a.y) * f, z: Math.max(0, a.z + (b.z - a.z) * f), f };
}

/** What a ball crossing the line at (y, z) is: in, off the woodwork, wide or over. */
export function classifyCrossing(y: number, z: number): CrossingKind {
  const w = S.WOODWORK_YD, bar = BALL_PHYSICS.CROSSBAR_Z;
  const insideY = y > GOAL_Y_MIN + w && y < GOAL_Y_MAX - w;
  const nearPost = Math.abs(y - GOAL_Y_MIN) <= w || Math.abs(y - GOAL_Y_MAX) <= w;
  if (nearPost && z <= bar + w) return 'post';
  if (insideY && Math.abs(z - bar) <= w) return 'bar';
  if (insideY && z < bar - w) return 'goal';
  if (y > GOAL_Y_MIN && y < GOAL_Y_MAX) return 'over';
  return 'wide';
}

/** True when a crossing is on target (in, or a ball the keeper would have to keep out). */
export function onFrame(y: number, z: number, margin = 0): boolean {
  return y >= GOAL_Y_MIN - margin && y <= GOAL_Y_MAX + margin && z <= BALL_PHYSICS.CROSSBAR_Z + margin;
}

// ── Keeper ───────────────────────────────────────────────────────────────────

export interface KeeperSkill { reflex: number; diving: number; positioning: number }

export function keeperReaction(k: KeeperSkill): number {
  return Math.max(0.05, S.REACT_BASE - S.REACT_REFLEX * clamp01(k.reflex));
}
export function keeperDiveSpeed(k: KeeperSkill): number {
  return S.DIVE_BASE + S.DIVE_SKILL * clamp01(k.diving);
}
export function keeperHandReach(k: KeeperSkill): number {
  return S.HAND_BASE + S.HAND_SKILL * clamp01(k.diving);
}

export type SaveGrade = 'routine' | 'good' | 'difficult';

export interface SaveChances {
  /** He keeps it out (hold, spill or parry decided after). */
  stop: number;
  grade: SaveGrade;
  /** 0..1 how hard the save was, on the scale `saveOutcomeChances` reads (0.3 = an ordinary shot). */
  difficulty: number;
}

/** What his hands do to a ball that comes within reach: `offset` = closest approach / hand reach. */
export function saveChances(k: KeeperSkill, offset: number, speedMs: number): SaveChances {
  const o = clamp01(offset);
  const handling = 0.5 * clamp01(k.reflex) + 0.3 * clamp01(k.diving) + 0.2 * clamp01(k.positioning);
  const stop = clamp(S.STOP_BASE + S.STOP_SKILL * (handling - 0.5) - S.STOP_EDGE * o * o
    - S.STOP_SPEED * Math.max(0, speedMs - S.STOP_FREE_MS), S.STOP_MIN, S.STOP_MAX);
  const grade: SaveGrade = o >= S.GRADE_DIFFICULT_OFFSET || speedMs >= S.GRADE_DIFFICULT_MS ? 'difficult'
    : o >= S.GRADE_GOOD_OFFSET || speedMs >= S.GRADE_GOOD_MS ? 'good' : 'routine';
  const difficulty = clamp01(0.1 + 0.4 * o + 0.02 * Math.max(0, speedMs - 15));
  return { stop, grade, difficulty };
}

// ── Blocks ───────────────────────────────────────────────────────────────────

export function blockReach(tackling: number): number {
  return S.BLOCK_BODY + S.BLOCK_TACKLE * clamp01(tackling);
}

export interface BlockChances { control: number; deflectOn: number; rebound: number }

/** What a body in the way does to a shot: rarely controls it, sometimes sends it on, mostly it rebounds. */
export function blockChances(firstTouch: number, speedMs: number): BlockChances {
  const speed = clamp(1 - (speedMs - 10) / 25, 0.3, 1);
  const control = clamp01((S.BLOCK_CONTROL_BASE + S.BLOCK_CONTROL_TOUCH * clamp01(firstTouch)) * speed);
  const deflectOn = (1 - control) * S.DEFLECT_ON;
  return { control, deflectOn, rebound: 1 - control - deflectOn };
}
