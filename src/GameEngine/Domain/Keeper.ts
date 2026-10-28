/**
 * Active goalkeeper rules (pure): the arc and the 1v1 rush while defending, the advanced position while his
 * team has the ball, the sweeper chase and the wider high-ball claims.
 * Spec: docs/superpowers/specs/2026-10-28-active-keeper-design.md.
 */
import type { GamePlayer } from '@/GameEngine/types';
import { KEEPER_CONFIG as K } from '@/GameEngine/Configs/KeeperConfig';
import { GOAL_Y_MAX, GOAL_Y_MIN, PITCH_LENGTH, PITCH_WIDTH } from '@/GameEngine/Domain/pitch';

/** Minimum yards off the goal line (always slightly advanced). */
export const GK_MIN_COME_OUT  = 0.5;
/** Yards off the line with the attacker right in front of goal. */
export const GK_MAX_COME_OUT  = 6.0;
/** Ball distance below which the near arc applies (fully out at 0, on the line at this distance). */
export const GK_COME_OUT_DIST = 20;
/** Small box depth (yards). */
const SMALL_BOX_DEPTH = 6;

export const GOAL_CENTRE_Y = (GOAL_Y_MIN + GOAL_Y_MAX) / 2;

type Pos = { x: number; y: number };
type KeeperLike = Pick<GamePlayer, 'attackDir'>;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1);

/** Goal line the keeper defends. */
export function keeperGoalX(gk: KeeperLike): number {
  return gk.attackDir === 1 ? 0 : PITCH_LENGTH;
}

/** Distance from the centre of the keeper's goal. */
export function distToKeeperGoal(gk: KeeperLike, p: Pos): number {
  return Math.hypot(p.x - keeperGoalX(gk), p.y - GOAL_CENTRE_Y);
}

/** Yards off the line on the angle bisector while defending, by the ball's distance from goal. */
export function arcComeOut(dist: number): number {
  if (dist <= GK_COME_OUT_DIST) {
    return GK_MIN_COME_OUT + (GK_MAX_COME_OUT - GK_MIN_COME_OUT) * Math.max(0, 1 - dist / GK_COME_OUT_DIST);
  }
  return lerp(GK_MIN_COME_OUT, K.FAR_COME_OUT, (dist - GK_COME_OUT_DIST) / (K.FAR_DIST - GK_COME_OUT_DIST));
}

/** Yards off the line when rushing a 1v1 holder at `dist` from goal (never behind the arc). */
export function rushComeOut(dist: number): number {
  return Math.max(arcComeOut(dist), Math.min(K.RUSH_MAX, dist - K.RUSH_GAP));
}

/**
 * The holder is through on goal: an opponent of the keeper within RUSH_RANGE of the goal centre with no
 * outfield team-mate of the keeper ahead of him in a ±RUSH_CORRIDOR lane (a beaten, recovering defender
 * does not count).
 */
export function isOneOnOne(
  gk: Pick<GamePlayer, 'attackDir' | 'team'>,
  holder: Pick<GamePlayer, 'x' | 'y' | 'team' | 'attackDir'>,
  allPlayers: ReadonlyArray<Pick<GamePlayer, 'x' | 'y' | 'team' | 'role' | 'recoveryTime'>>,
): boolean {
  if (holder.team === gk.team) return false;
  if (distToKeeperGoal(gk, holder) > K.RUSH_RANGE) return false;
  return !allPlayers.some(p =>
    p.team === gk.team && p.role !== 'GK' && !(p.recoveryTime > 0)
    && (p.x - holder.x) * holder.attackDir > 0
    && Math.abs(p.y - holder.y) <= K.RUSH_CORRIDOR);
}

/** Point `comeOut` yards from the goal centre toward the ball. */
function onBisector(gk: KeeperLike, ball: Pos, comeOut: number): Pos {
  const goalX = keeperGoalX(gk);
  const dx = ball.x - goalX;
  const dy = ball.y - GOAL_CENTRE_Y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.01) return { x: goalX + gk.attackDir * comeOut, y: GOAL_CENTRE_Y };
  return { x: goalX + (dx / dist) * comeOut, y: GOAL_CENTRE_Y + (dy / dist) * comeOut };
}

/**
 * Where the keeper stands while his team defends. On the arc (clamped to his role bounds), or rushing out at a
 * holder through on goal (clamped to the pitch only).
 */
export function keeperDefendingTarget(
  gk: GamePlayer,
  ball: Pos,
  holder: GamePlayer | null,
  allPlayers: readonly GamePlayer[],
): Pos & { rushing: boolean } {
  const dist = distToKeeperGoal(gk, ball);
  const rushing = holder !== null && isOneOnOne(gk, holder, allPlayers);
  const p = onBisector(gk, ball, rushing ? rushComeOut(dist) : arcComeOut(dist));
  if (rushing) {
    return { x: clamp(p.x, 0, PITCH_LENGTH), y: clamp(p.y, 0, PITCH_WIDTH), rushing };
  }
  const { bounds } = gk;
  return { x: clamp(p.x, bounds.minX, bounds.maxX), y: clamp(p.y, bounds.minY, bounds.maxY), rushing };
}

/** Yards off the line while his own team has the ball, by how far up the pitch the ball is. */
export function attackingAdvance(ballDistFromLine: number): number {
  if (ballDistFromLine <= K.ATTACK_NEAR_DIST) return K.ATTACK_MIN;
  if (ballDistFromLine <= K.ATTACK_MID_DIST) {
    return lerp(K.ATTACK_MIN, K.ATTACK_SPOT, (ballDistFromLine - K.ATTACK_NEAR_DIST) / (K.ATTACK_MID_DIST - K.ATTACK_NEAR_DIST));
  }
  return lerp(K.ATTACK_SPOT, K.ATTACK_EDGE, (ballDistFromLine - K.ATTACK_MID_DIST) / (K.ATTACK_FAR_DIST - K.ATTACK_MID_DIST));
}

/** Where the keeper stands while his team has the ball. */
export function keeperAttackingTarget(gk: KeeperLike, ball: Pos): Pos {
  const goalX = keeperGoalX(gk);
  const adv = attackingAdvance(Math.abs(ball.x - goalX));
  return {
    x: clamp(goalX + gk.attackDir * adv, 0, PITCH_LENGTH),
    y: clamp(GOAL_CENTRE_Y + (ball.y - GOAL_CENTRE_Y) * K.ATTACK_Y_FOLLOW, 0, PITCH_WIDTH),
  };
}

/**
 * How far (yards) the keeper is from where he should be for a shot from `ball`: the distance to the stretch of
 * the bisector between the arc and, within the rush range, the rush point (coming out is never punished).
 */
export function keeperPositionDeviation(gk: Pick<GamePlayer, 'x' | 'y' | 'attackDir'>, ball: Pos): number {
  const dist = distToKeeperGoal(gk, ball);
  const near = arcComeOut(dist);
  const far = dist <= K.RUSH_RANGE ? rushComeOut(dist) : near;
  const a = onBisector(gk, ball, near);
  const b = onBisector(gk, ball, far);
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  const t = len2 < 1e-9 ? 0 : clamp(((gk.x - a.x) * abx + (gk.y - a.y) * aby) / len2, 0, 1);
  return Math.hypot(gk.x - (a.x + abx * t), gk.y - (a.y + aby * t));
}

/** Sweeper: the keeper chases a loose / through ball at (x, y) when it is in his zone and he wins the race. */
export function sweeperChases(
  gk: Pick<GamePlayer, 'attackDir' | 'runtimeStats'>,
  x: number,
  y: number,
  keeperEta: number,
  bestAttackerEta: number,
): boolean {
  if (Math.abs(x - keeperGoalX(gk)) > K.SWEEP_RANGE) return false;
  if (Math.abs(y - GOAL_CENTRE_Y) > K.SWEEP_HALF_WIDTH) return false;
  const margin = K.SWEEP_MARGIN_BASE - K.SWEEP_MARGIN_SKILL * gk.runtimeStats.withoutBall.gkPositioning;
  return keeperEta + margin < bestAttackerEta;
}

/** Depth of a point from the goal line at `goalX`. */
export function depthFrom(goalX: number, x: number): number {
  return Math.abs(x - goalX);
}

/** A high ball dropping beyond the small box, but not past the penalty spot (and near the goal's width). */
export function isWideClaimZone(x: number, y: number, goalX: number): boolean {
  const depth = depthFrom(goalX, x);
  return depth > SMALL_BOX_DEPTH && depth <= K.HIGH_CLAIM_DEPTH && Math.abs(y - GOAL_CENTRE_Y) <= K.HIGH_CLAIM_HALF_WIDTH;
}

/** The keeper comes for a high ball in the wide claim zone: close enough and not clearly beaten to it. */
export function keeperComesWide(dGk: number, inZone: boolean, nearestOther: number): boolean {
  return inZone && dGk <= K.HIGH_REACH && dGk <= nearestOther + K.HIGH_SLACK;
}

/** Claim chance multiplier for a high ball dropping `depth` yards from the line (1 inside the small box). */
export function wideClaimFactor(depth: number): number {
  const t = clamp((depth - SMALL_BOX_DEPTH) / (K.HIGH_CLAIM_DEPTH - SMALL_BOX_DEPTH), 0, 1);
  return 1 - K.HIGH_DEPTH_PENALTY * t;
}

/** Base chance of a keeper smothering the ball at a holder's feet (replaces the outfield tackle chance). */
export function smotherBase(gk: Pick<GamePlayer, 'runtimeStats'>): number {
  const { gkPositioning, gkReflex } = gk.runtimeStats.withoutBall;
  return K.SMOTHER_BASE + K.SMOTHER_SKILL * (gkPositioning + gkReflex) / 2;
}
