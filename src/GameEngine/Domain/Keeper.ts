/**
 * Active goalkeeper rules (pure): the arc and the 1v1 rush while defending, the advanced position while his
 * team has the ball, the sweeper chase and the wider high-ball claims.
 * Spec: docs/superpowers/specs/2026-10-28-active-keeper-design.md.
 */
import type { GamePlayer, ShotState } from '@/GameEngine/types';
import { KEEPER_CONFIG as K } from '@/GameEngine/Configs/KeeperConfig';
import { FM_KEEPER, FM_KEEPER_DEFEND_KNOTS_M, FM_KEEPER_OWN_KNOTS_M } from '@/GameEngine/Configs/FmKeeperConfig';
import { GOAL_Y_MAX, GOAL_Y_MIN, PITCH_LENGTH, PITCH_WIDTH, isInGoalScoreArea } from '@/GameEngine/Domain/pitch';

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

/** A high ball dropping in the penalty area, beyond the small box (tester report: balls in front of him). */
export function isWideClaimZone(x: number, y: number, goalX: number): boolean {
  return depthFrom(goalX, x) > SMALL_BOX_DEPTH && isInGoalScoreArea(x, y, goalX);
}

/** A loose ball in his penalty area is his when he gets there before anyone else (tester report). */
export function keeperTakesLoose(inBox: boolean, keeperEta: number, bestOtherEta: number): boolean {
  return inBox && keeperEta <= bestOtherEta;
}

/**
 * A team-mate of the keeper covers the ball at `ball`: an outfield player close to it and not behind it (goal-side
 * or level). Then the ball is his, not the keeper's. Inside the small box the keeper always has it.
 */
export function defenderCovers(
  gk: Pick<GamePlayer, 'id' | 'team' | 'attackDir'>,
  ball: Pos,
  players: ReadonlyArray<Pick<GamePlayer, 'id' | 'team' | 'role' | 'x' | 'y' | 'recoveryTime'>>,
): boolean {
  const goalX = keeperGoalX(gk);
  if (depthFrom(goalX, ball.x) <= SMALL_BOX_DEPTH) return false;
  const ballDepth = depthFrom(goalX, ball.x);
  return players.some(p =>
    p.team === gk.team && p.id !== gk.id && p.role !== 'GK' && !(p.recoveryTime > 0)
    && Math.hypot(p.x - ball.x, p.y - ball.y) <= K.DEFENDER_COVER
    && depthFrom(goalX, p.x) <= ballDepth + K.DEFENDER_LEVEL);
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
/** Chances that a save is held, spilled loose or parried behind (they add to 1). */
export function saveOutcomeChances(skill: number, goalChance: number): { hold: number; spill: number; parry: number } {
  const S = K.SAVE;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const hold = clamp(S.HOLD_BASE + S.HOLD_SKILL * (skill - 0.5) - S.HOLD_DIFFICULTY * (goalChance - 0.3), S.HOLD_MIN, S.HOLD_MAX);
  const spillShare = clamp(S.SPILL_BASE - S.SPILL_SKILL * (skill - 0.5) + S.SPILL_DIFFICULTY * (goalChance - 0.3), S.SPILL_MIN, S.SPILL_MAX);
  const spill = (1 - hold) * spillShare;
  return { hold, spill, parry: 1 - hold - spill };
}

/** The keeper's shot-stopping skill, 0..1: mean of reflex, diving and positioning. */
export function shotStoppingSkill(gk: Pick<GamePlayer, 'runtimeStats'>): number {
  const w = gk.runtimeStats.withoutBall;
  return (w.gkReflex + w.gkDiving + w.gkPositioning) / 3;
}

export function smotherBase(gk: Pick<GamePlayer, 'runtimeStats'>): number {
  const { gkPositioning, gkReflex } = gk.runtimeStats.withoutBall;
  return K.SMOTHER_BASE + K.SMOTHER_SKILL * (gkPositioning + gkReflex) / 2;
}

function shotBallAt(shot: Pick<ShotState, 'fromX' | 'fromY' | 'toX' | 'toY'>, t: number): Pos {
  const eased = t * t * (3 - 2 * t);
  return { x: shot.fromX + (shot.toX - shot.fromX) * eased, y: shot.fromY + (shot.toY - shot.fromY) * eased };
}

function closestOnSegment(p: Pos, a: Pos, b: Pos): Pos {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  const t = len2 < 1e-9 ? 0 : clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / len2, 0, 1);
  return { x: a.x + abx * t, y: a.y + aby * t };
}

/** Where the keeper goes while a shot flies: the nearest point of what is left of its path, never back to the line for its own sake. */
export function shotInterceptPoint(gk: Pos, shot: Pick<ShotState, 'fromX' | 'fromY' | 'toX' | 'toY' | 't'>): Pos {
  return closestOnSegment(gk, shotBallAt(shot, shot.t), { x: shot.toX, y: shot.toY });
}

/** Whether the ball, moving from flight progress t0 to t1, comes within the keeper's reach. */
export function ballMeetsKeeper(gk: Pos, shot: Pick<ShotState, 'fromX' | 'fromY' | 'toX' | 'toY'>, t0: number, t1: number): boolean {
  const p = closestOnSegment(gk, shotBallAt(shot, t0), shotBallAt(shot, Math.min(1, t1)));
  return Math.hypot(p.x - gk.x, p.y - gk.y) <= K.SHOT_REACH;
}

/** Whether the keeper stands within reach of the line from the ball to the middle of the goal. */
export function keeperReachesShot(gk: Pos, fromX: number, fromY: number, goalX: number): boolean {
  const mid = { x: goalX, y: (GOAL_Y_MIN + GOAL_Y_MAX) / 2 };
  const p = closestOnSegment(gk, { x: fromX, y: fromY }, mid);
  return Math.hypot(p.x - gk.x, p.y - gk.y) <= K.SHOT_REACH + (GOAL_Y_MAX - GOAL_Y_MIN) / 2;
}

// ── Stage 11: FM's keeper (`keeper.md` → "Stage 11", flag `FM_KEEPER`) ─────────────────────────────────────────────

const M_PER_YD = 1 / 1.0936;

/** Piecewise-linear lookup on (x, y) knots, flat before the first and past the last. */
function knotValue(knots: ReadonlyArray<readonly [number, number]>, x: number): number {
  const first = knots[0]!;
  if (x <= first[0]) return first[1];
  for (let i = 1; i < knots.length; i++) {
    const [x1, y1] = knots[i]!;
    const [x0, y0] = knots[i - 1]!;
    if (x <= x1) return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  return knots[knots.length - 1]![1];
}

/** FM: metres off his line by the ball's distance (m) from the centre of his goal line; `own` = his team has the ball. */
export function fmKeeperOffLineM(ballDistM: number, own: boolean): number {
  return knotValue(own ? FM_KEEPER_OWN_KNOTS_M : FM_KEEPER_DEFEND_KNOTS_M, ballDistM);
}

/**
 * FM's keeper position: on the line facing the play with the opponent on the ball within 35 m, a step up as the ball
 * goes away; sideways a small share of the ball's offset. No rush at a holder, no arc toward the ball. Pitch-clamped
 * only (his own team's ball far away takes him past his role bounds, as in FM).
 */
export function fmKeeperTarget(gk: KeeperLike, ball: Pos, own: boolean): Pos {
  const goalX = keeperGoalX(gk);
  const ballDistM = distToKeeperGoal(gk, ball) * M_PER_YD;
  const off = Math.max(FM_KEEPER.MIN_OFF_LINE_YD, fmKeeperOffLineM(ballDistM, own) / M_PER_YD);
  return {
    x: clamp(goalX + gk.attackDir * off, 0, PITCH_LENGTH),
    y: clamp(GOAL_CENTRE_Y + (ball.y - GOAL_CENTRE_Y) * FM_KEEPER.LATERAL_FOLLOW, 0, PITCH_WIDTH),
  };
}

/** FM: how far (yd) the keeper is from his FM position for a shot from `ball` (the shot-quality input of the dice path). */
export function fmKeeperDeviation(gk: Pick<GamePlayer, 'x' | 'y' | 'attackDir'>, ball: Pos): number {
  const t = fmKeeperTarget(gk, ball, false);
  return Math.hypot(gk.x - t.x, gk.y - t.y);
}

/** Command of the box, 0..1: mean of positioning and jumping. */
export function keeperCommand(gk: Pick<GamePlayer, 'runtimeStats'>): number {
  const w = gk.runtimeStats.withoutBall;
  return (w.gkPositioning + (w.jump ?? 0.5)) / 2;
}

/** FM: the deepest a keeper comes for a high ball (yd off his line): BASE + SKILL × command, capped at FM's 16 m. */
export function fmClaimDepth(gk: Pick<GamePlayer, 'runtimeStats'>): number {
  return Math.min(FM_KEEPER.CLAIM_DEPTH_MAX_YD, FM_KEEPER.CLAIM_DEPTH_BASE_YD + FM_KEEPER.CLAIM_DEPTH_SKILL_YD * keeperCommand(gk));
}

/**
 * FM: the keeper comes for a high ball meeting at (x, y) when it is in his box, within his claim depth, and he gets
 * there first (his race time beats every outfield player's by the margin) and in time (at most the ball's flight to
 * the point plus a slack; `flightS` unknown = no time check). Otherwise he holds his line and only meets it if it comes
 * through his reach.
 */
export function fmKeeperComesForHigh(
  gk: Pick<GamePlayer, 'attackDir' | 'runtimeStats'>,
  x: number,
  y: number,
  keeperEta: number,
  bestOutfieldEta: number,
  flightS?: number,
): boolean {
  const goalX = keeperGoalX(gk);
  if (!isInGoalScoreArea(x, y, goalX)) return false;
  if (depthFrom(goalX, x) > fmClaimDepth(gk)) return false;
  if (keeperEta + FM_KEEPER.CLAIM_FIRST_MARGIN_S > bestOutfieldEta) return false;
  if (flightS !== undefined && keeperEta > flightS + FM_KEEPER.CLAIM_TIME_SLACK_S) return false;
  return true;
}
