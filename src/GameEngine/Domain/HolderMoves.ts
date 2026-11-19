/**
 * The holder's extra moves (FM-style decisions, phase 3; `.claude/rules/game-engine/decisions.md` → "Holder moves"):
 * shield / turn, cut inside, first-time lay-off, chip over an advanced keeper, round the keeper. Each one is scored here
 * as its own option of `decideBallHolder` (0..1, compressed like the other actions) and executed by the existing
 * executions (carry, pass, shot, dribble) with a `move` tag. Pure: no dice. Flags `DECISION_FLAGS.SHIELD` … and
 * constants `HOLDER_MOVES` (`DecisionConfig.ts`).
 */
import { DECISION_FLAGS, HOLDER_MOVES as M } from '@/GameEngine/Configs/DecisionConfig';
import type { GamePlayer, PlayerMental } from '@/GameEngine/types';
import { PITCH_LENGTH, PITCH_WIDTH, GOAL_Y_MIN, GOAL_Y_MAX } from '@/GameEngine/Domain/pitch';
import { computeOpenAngle } from '@/GameEngine/Infrastructure/ActionOutcomes';
import { DEFAULT_MENTAL, fmScale } from '@/GameEngine/Domain/HolderMind';
import { clamp } from '@/Domain/math';

export type HolderMove = 'shield' | 'cut_inside' | 'lay_off' | 'chip' | 'round_keeper';
export const HOLDER_MOVE_LIST: readonly HolderMove[] = ['shield', 'cut_inside', 'lay_off', 'chip', 'round_keeper'];

const CY = PITCH_WIDTH / 2;
const compress = (raw: number, strong: number) => (raw > 0 ? 1 - Math.exp(-raw / strong) : 0);
/** A mental value stretched to the world, 0..1. */
const mn = (v: number) => fmScale(v) / 100;
/** The profile only counts with the holder's mind on (off, every player reads the default: no mental effect). */
const mentalOf = (p: GamePlayer): PlayerMental => (DECISION_FLAGS.HOLDER ? p.mental ?? DEFAULT_MENTAL : DEFAULT_MENTAL);
const goalXOf = (p: Pick<GamePlayer, 'attackDir'>) => (p.attackDir === 1 ? PITCH_LENGTH : 0);

/** Degrees between the holder's last movement and the direction to goal (null when he stands still). */
export function facingAngleDeg(p: Pick<GamePlayer, 'x' | 'y' | 'attackDir' | 'vel'>): number | null {
  const v = p.vel;
  if (!v) return null;
  const sp = Math.hypot(v.x, v.y);
  if (sp < M.FACING_MIN_SPEED) return null;
  const gx = goalXOf(p) - p.x;
  const gy = CY - p.y;
  const gl = Math.hypot(gx, gy);
  if (gl < 1e-6) return null;
  return (Math.acos(clamp((v.x * gx + v.y * gy) / (sp * gl), -1, 1)) * 180) / Math.PI;
}

/**
 * Back to goal: moving away from the goal (`facingAngleDeg`), or the nearest opponent `n` tight on him from the goal
 * side (a defender on his back).
 */
export function backToGoal(p: GamePlayer, n: { o: GamePlayer; d: number } | null): boolean {
  const deg = facingAngleDeg(p);
  if (deg !== null && deg > M.FACING_AWAY_DEG) return true;
  if (!n || n.d > M.BACK_MARKER_YD) return false;
  return (n.o.x - p.x) * p.attackDir > 0.3 * n.d;
}

function nearest(p: GamePlayer, others: readonly GamePlayer[]): { o: GamePlayer; d: number } | null {
  let best: GamePlayer | null = null;
  let bd = Infinity;
  for (const o of others) {
    const d = Math.hypot(o.x - p.x, o.y - p.y);
    if (d < bd) { bd = d; best = o; }
  }
  return best ? { o: best, d: bd } : null;
}

/**
 * Nobody of `opps` within `r` yards of the segment from (x, y) along (dx, dy) for `len` yards. An opponent at his
 * shoulder (behind the first yard of the lane) does not block it.
 */
function laneClear(x: number, y: number, dx: number, dy: number, len: number, r: number, opps: readonly GamePlayer[]): boolean {
  for (const o of opps) {
    const along = (o.x - x) * dx + (o.y - y) * dy;
    if (along < 1) continue;
    const t = Math.min(along, len);
    if (Math.hypot(o.x - (x + dx * t), o.y - (y + dy * t)) < r) return false;
  }
  return true;
}

export interface MoveScore { score: number; dx?: number; dy?: number; targetId?: number; chance?: number }

/**
 * Shield / turn: back to goal (facing away) with an opponent tight on him: hold the ball, edging away from the presser
 * (strength + composure). He turns on his own when a lane opens (the carry wins again) or the presser commits.
 */
export function shieldMove(p: GamePlayer, outfieldOpps: readonly GamePlayer[], pN: number): MoveScore | null {
  if (!DECISION_FLAGS.SHIELD || p.role === 'GK') return null;
  const n = nearest(p, outfieldOpps.filter(o => o.recoveryTime <= 0));
  if (!n || n.d > M.SHIELD_NEAR_YD || n.d < 1e-3) return null;
  if (!backToGoal(p, n)) return null;
  const strength = p.runtimeStats.withBall.strength ?? 0.5;
  const raw = M.SHIELD_WEIGHT * (0.5 * strength + 0.5 * mn(mentalOf(p).composure)) * (0.5 + pN);
  return { score: compress(raw, M.STRONG_RAW), dx: (p.x - n.o.x) / n.d, dy: (p.y - n.o.y) / n.d };
}

/**
 * Cut inside: a wide holder carries diagonally to the edge of the box, onto his stronger foot (an inverted winger cuts
 * in the most), more when the full-back shows him outside (dribbling + flair).
 */
export function cutInsideMove(p: GamePlayer, outfieldOpps: readonly GamePlayer[]): MoveScore | null {
  if (!DECISION_FLAGS.CUT_INSIDE || p.role === 'GK' || p.role === 'CB') return null;
  const wide = Math.abs(p.y - CY);
  const fromLine = Math.abs(goalXOf(p) - p.x);
  if (wide < M.CUT_WIDE_YD || fromLine < M.CUT_MIN_YD || fromLine > M.CUT_MAX_YD) return null;
  const side = Math.sign(p.y - CY); // −1 top half, +1 bottom half
  const tx = goalXOf(p) - p.attackDir * M.CUT_TARGET_DEPTH_YD;
  const ty = CY + side * M.CUT_TARGET_WIDE_YD;
  const len = Math.hypot(tx - p.x, ty - p.y);
  if (len < 3) return null;
  const dx = (tx - p.x) / len;
  const dy = (ty - p.y) / len;
  // Moving inside, never wider.
  if ((ty - p.y) * side > 0) return null;
  if (!laneClear(p.x, p.y, dx, dy, M.CUT_LANE_YD, M.CUT_CLEAR_YD, outfieldOpps)) return null;
  // Flank relative to the attack: attacking +x the left flank is the top (y < 37).
  const leftFlank = p.attackDir === 1 ? p.y < CY : p.y > CY;
  const inverted = p.foot ? (leftFlank ? p.foot === 'right' : p.foot === 'left') : false;
  const n = nearest(p, outfieldOpps);
  const showsOutside = !!n && n.d <= M.CUT_SHOW_YD && Math.abs(n.o.y - CY) < wide - 1;
  const skill = 0.5 * p.runtimeStats.withBall.dribbling + 0.5 * mn(mentalOf(p).flair);
  const raw = M.CUT_WEIGHT * (0.4 + 0.6 * skill) * (inverted ? 1 : M.CUT_NATURAL_FOOT) * (showsOutside ? M.CUT_SHOW_BONUS : 1);
  return { score: compress(raw, M.STRONG_RAW), dx, dy };
}

/**
 * First-time lay-off: he has just received with his back to goal, an opponent near, and a teammate arriving within
 * reach behind or beside him with a clear lane: one touch, no carry (passing + decisions).
 */
export function layOffMove(p: GamePlayer, teammates: readonly GamePlayer[], outfieldOpps: readonly GamePlayer[]): MoveScore | null {
  if (!DECISION_FLAGS.LAY_OFF || p.role === 'GK') return null;
  if (p.justReceivedTicks < M.LAYOFF_RECEIVED_TICKS) return null;
  const opp = nearest(p, outfieldOpps);
  if (!opp || opp.d > M.LAYOFF_PRESSURE_YD) return null;
  if (!backToGoal(p, opp)) return null;
  let best: { t: GamePlayer; d: number } | null = null;
  for (const t of teammates) {
    if (t.id === p.id || t.role === 'GK') continue;
    const d = Math.hypot(t.x - p.x, t.y - p.y);
    if (d < M.LAYOFF_MIN_YD || d > M.LAYOFF_MAX_YD) continue;
    if ((t.x - p.x) * p.attackDir > M.LAYOFF_MAX_AHEAD_YD) continue;
    const arriving = t.vel ? (t.vel.x * p.attackDir > M.LAYOFF_RUN_SPEED) || ((p.x - t.x) * t.vel.x + (p.y - t.y) * t.vel.y) / d > M.LAYOFF_RUN_SPEED : false;
    if (!arriving) continue;
    if (!laneClear(p.x, p.y, (t.x - p.x) / d, (t.y - p.y) / d, d, M.LAYOFF_LANE_YD, outfieldOpps)) continue;
    if (!best || d < best.d) best = { t, d };
  }
  if (!best) return null;
  const raw = M.LAYOFF_WEIGHT * (0.35 + 0.3 * p.runtimeStats.withBall.passingSkill + 0.35 * mn(mentalOf(p).decisions));
  return { score: compress(raw, M.STRONG_RAW), targetId: best.t.id };
}

/**
 * Chip over an advanced keeper: the keeper is off his line, between the shooter and the goal, the shooter in range.
 * Chance from the gap behind the keeper, the angle and finishing + composure + flair. Scored like a shot.
 */
export function chipMove(p: GamePlayer, keeper: GamePlayer | null, threshold: number, strongRaw: number): MoveScore | null {
  if (!DECISION_FLAGS.CHIP || p.role === 'GK' || !keeper) return null;
  const goalX = goalXOf(p);
  const depth = Math.abs(keeper.x - goalX);
  const dist = Math.hypot(goalX - p.x, CY - p.y);
  if (depth < M.CHIP_MIN_DEPTH_YD || dist < M.CHIP_MIN_YD || dist > M.CHIP_MAX_YD) return null;
  if (Math.abs(p.x - goalX) <= depth + M.CHIP_MIN_GAP_YD) return null; // he is not beyond the keeper
  // The keeper must stand in front of him (roughly on the line to goal).
  const ty = clamp(p.y, GOAL_Y_MIN, GOAL_Y_MAX);
  const segX = goalX - p.x;
  const segY = ty - p.y;
  const segL = Math.hypot(segX, segY);
  const t = clamp(((keeper.x - p.x) * segX + (keeper.y - p.y) * segY) / (segL * segL), 0, 1);
  if (Math.hypot(keeper.x - (p.x + segX * t), keeper.y - (p.y + segY * t)) > M.CHIP_KEEPER_OFF_LINE_YD) return null;
  const m = mentalOf(p);
  const skill = (p.runtimeStats.withBall.shootAccuracy / 0.95 + mn(m.composure) + mn(m.flair)) / 3;
  const angle = clamp(computeOpenAngle(p.x, p.y, goalX) / (Math.PI / 4), 0.2, 1);
  const chance = M.CHIP_XG * clamp((depth - M.CHIP_MIN_DEPTH_YD + 2) / M.CHIP_DEPTH_SPAN_YD, 0, 1) * angle * (0.4 + 0.6 * skill);
  if (chance <= 0) return null;
  return { score: compress(chance / threshold, strongRaw) * M.CHIP_WEIGHT, chance };
}

/** Round the keeper: in a one-on-one with the keeper rushing close, take him on (dribbling + composure). */
export function roundKeeperMove(p: GamePlayer, keeper: GamePlayer | null, oneOnOne: boolean): MoveScore | null {
  if (!DECISION_FLAGS.ROUND_KEEPER || !oneOnOne || !keeper || p.role === 'GK' || keeper.recoveryTime > 0) return null;
  const d = Math.hypot(keeper.x - p.x, keeper.y - p.y);
  if (d > M.ROUND_RANGE_YD || d < 1) return null;
  if ((keeper.x - p.x) * p.attackDir <= 0) return null; // the keeper is not in front of him
  const skill = roundKeeperSkill(p);
  const raw = M.ROUND_WEIGHT * (0.3 + 0.7 * skill) * (1 - d / (M.ROUND_RANGE_YD + 2));
  return { score: compress(raw, M.STRONG_RAW), targetId: keeper.id };
}

/** The attacker's skill against the keeper when rounding him (0..1): dribbling and composure. */
export function roundKeeperSkill(p: GamePlayer): number {
  return 0.5 * p.runtimeStats.withBall.dribbling + 0.5 * mn(mentalOf(p).composure);
}

/** Where a chip lands: inside the goal on a goal, wide of the post on a miss (y on the goal line). */
export function chipTargetY(p: Pick<GamePlayer, 'y'>, goal: boolean): number {
  if (goal) return clamp(p.y, GOAL_Y_MIN + 1, GOAL_Y_MAX - 1);
  return p.y < CY ? GOAL_Y_MIN - 1.5 : GOAL_Y_MAX + 1.5;
}
