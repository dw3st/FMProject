/**
 * Aerial — pure decision-side evaluation of high balls (Etapa 13,
 * `.claude/rules/game-engine/aerial.md`).
 *
 *   - Cross candidates: is the holder in a crossing position, which targets in the box
 *     (near post / penalty spot / far post) and how good is each one.
 *   - Long-ball candidates: a forward teammate over the defensive line.
 *   - Aerial ability / duel score of a player for a landing point.
 *
 * No state mutation, no randomness. Outcome rolls (duel, keeper claim, header effect) live in
 * `Infrastructure/ActionOutcomes.ts`; execution in `gameState.ts`.
 */
import type { GamePlayer } from '@/GameEngine/types';
import { AERIAL_CONFIG as A } from '@/GameEngine/Configs/AerialConfig';
import { PITCH_LENGTH, PITCH_WIDTH, GOAL_Y_MIN, GOAL_Y_MAX, isInGoalScoreArea } from '@/GameEngine/Domain/pitch';

const CENTRE_Y = PITCH_WIDTH / 2;

export type CrossTargetKind = 'near_post' | 'penalty_spot' | 'far_post';

export interface CrossTarget {
  kind: CrossTargetKind;
  x: number;
  y: number;
  /** Proximity-weighted attackers / defenders in the target zone. */
  attackers: number;
  defenders: number;
  /** Best proximity-weighted heading (0..1) of an attacker in the zone. */
  heading: number;
  /** The defending goalkeeper can claim this target (small box, or within his reach). */
  gkClaim: boolean;
  /** Raw score before compression (0 = not viable). */
  raw: number;
  /** Attacker most likely to attack the ball (closest in the zone). */
  bestAttackerId: number | null;
}

export interface LongBallTarget {
  targetId: number;
  x: number;
  y: number;
  /** Yards gained in the attack direction. */
  progress: number;
  /** 0..1 — teammates vs defenders around the landing point (0.5 = even). */
  numbers: number;
  /** 0..1 — pressure on the holder / marked short options (same for every target). */
  pressure: number;
  aerial: number;
  raw: number;
}

/**
 * How badly the holder needs to go long, 0..1: the larger of the pressure on him (nearest opponent
 * within LONG_BALL_PRESSURE_RADIUS) and the share of his short options that are marked (no short
 * option at all = 1).
 */
function longBallPressure(holder: GamePlayer, allPlayers: GamePlayer[]): number {
  const opponents = allPlayers.filter(p => p.team !== holder.team && p.recoveryTime <= 0);
  let nearest = Infinity;
  for (const o of opponents) nearest = Math.min(nearest, Math.hypot(o.x - holder.x, o.y - holder.y));
  const onHolder = clamp(1 - nearest / A.LONG_BALL_PRESSURE_RADIUS, 0, 1);
  const short = allPlayers.filter(p =>
    p.team === holder.team && p.id !== holder.id && p.role !== 'GK'
    && Math.hypot(p.x - holder.x, p.y - holder.y) <= A.LONG_BALL_SHORT_RANGE);
  if (short.length === 0) return 1;
  const marked = short.filter(m =>
    opponents.some(o => Math.hypot(o.x - m.x, o.y - m.y) <= A.LONG_BALL_SHORT_OPEN_RADIUS)).length;
  return Math.max(onHolder, marked / short.length);
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Goal line the player attacks. */
function attackGoalX(p: Pick<GamePlayer, 'attackDir'>): number {
  return p.attackDir === 1 ? PITCH_LENGTH : 0;
}

/** True when (x, y) is inside the small box (6-yard box) of the goal whose line is at `goalX`. */
export function isInSmallBox(x: number, y: number, goalX: number): boolean {
  if (Math.abs(x - goalX) > A.SMALL_BOX_DEPTH) return false;
  return y >= GOAL_Y_MIN - A.SMALL_BOX_WIDE && y <= GOAL_Y_MAX + A.SMALL_BOX_WIDE;
}

/**
 * The keeper comes for a high ball dropping at distance `dGk` from him: in his small box when he
 * can get there (≤ SMALL_BOX_DEPTH + AERIAL_RADIUS + GK_EXTRA_REACH), or anywhere within
 * AERIAL_RADIUS + GK_EXTRA_REACH when he is the closest player (`firstThere`).
 */
export function keeperComesFor(dGk: number, inSmallBox: boolean, firstThere: boolean): boolean {
  if (inSmallBox && dGk <= A.SMALL_BOX_DEPTH + A.AERIAL_RADIUS + A.GK_EXTRA_REACH) return true;
  return firstThere && dGk <= A.AERIAL_RADIUS + A.GK_EXTRA_REACH;
}

/**
 * Crossing position: in the final third, outside the central corridor and outside the penalty
 * area (inside the box the carrier shoots, cuts back or gets fouled — measured: allowing crosses
 * there cost ~a third of the ground goals and half the penalties). Exception: right on the byline,
 * wide of the six-yard box (a cut-back cross). Goalkeepers never cross.
 */
export function isCrossPosition(p: GamePlayer): boolean {
  if (p.role === 'GK') return false;
  const goalX = attackGoalX(p);
  const distToLine = (goalX - p.x) * p.attackDir;
  if (distToLine < 0 || distToLine > A.CROSS_MAX_DIST_TO_LINE) return false;
  const width = Math.abs(p.y - CENTRE_Y);
  if (width < A.CROSS_MIN_WIDTH) return false;
  if (!isInGoalScoreArea(p.x, p.y, goalX)) return true;
  return distToLine <= A.CROSS_BYLINE_DIST && width > (GOAL_Y_MAX - GOAL_Y_MIN) / 2 + A.SMALL_BOX_WIDE;
}

/** The three cross targets for a holder: near post (his side), penalty spot, far post. */
export function crossTargetPoints(p: GamePlayer): Array<{ kind: CrossTargetKind; x: number; y: number }> {
  const goalX = attackGoalX(p);
  const fromLine = (d: number) => goalX - p.attackDir * d;
  const nearSideLow = p.y < CENTRE_Y; // crosser on the low-y touchline side
  const nearPostY = nearSideLow ? GOAL_Y_MIN : GOAL_Y_MAX;
  const farPostY = nearSideLow ? GOAL_Y_MAX + A.FAR_POST_OUTSIDE : GOAL_Y_MIN - A.FAR_POST_OUTSIDE;
  return [
    { kind: 'near_post',    x: fromLine(A.NEAR_POST_DEPTH),    y: nearPostY },
    { kind: 'penalty_spot', x: fromLine(A.PENALTY_SPOT_DEPTH), y: CENTRE_Y },
    { kind: 'far_post',     x: fromLine(A.FAR_POST_DEPTH),     y: farPostY },
  ];
}

/** Heading ability (0..1); 0.5 when a snapshot predates the field. */
export function headingOf(p: GamePlayer): number {
  return p.runtimeStats.withoutBall.heading ?? 0.5;
}

/** Jump ability (0..1); 0.5 when a snapshot predates the field. */
function jumpOf(p: GamePlayer): number {
  return p.runtimeStats.withoutBall.jump ?? 0.5;
}

/** Positional-free aerial ability: heading / jump / strength with the duel weights. */
export function aerialAbility(p: GamePlayer): number {
  return headingOf(p) * A.DUEL_HEADING_WEIGHT
    + jumpOf(p) * A.DUEL_JUMP_WEIGHT
    + (p.runtimeStats.withoutBall.strength ?? 0.5) * A.DUEL_STRENGTH_WEIGHT;
}

/**
 * Duel score of `p` for a ball landing at `point`:
 * heading × 0.45 + jump × 0.25 + strength × 0.15 + position × 0.15, position = 1 − dist / AERIAL_RADIUS.
 */
export function aerialDuelScore(p: GamePlayer, point: { x: number; y: number }): number {
  const d = Math.hypot(p.x - point.x, p.y - point.y);
  const position = clamp(1 - d / A.AERIAL_RADIUS, 0, 1);
  return aerialAbility(p) + position * A.DUEL_POSITION_WEIGHT;
}

/**
 * Score every cross target for `holder`. Empty when the holder is not in a crossing position.
 * Sorted by raw score, best first. A target with no attacker in its zone has raw 0.
 */
export function evaluateCrossTargets(holder: GamePlayer, allPlayers: GamePlayer[]): CrossTarget[] {
  if (!isCrossPosition(holder)) return [];
  const attackers = allPlayers.filter(p => p.team === holder.team && p.id !== holder.id && p.role !== 'GK');
  const defenders = allPlayers.filter(p => p.team !== holder.team && p.role !== 'GK' && p.recoveryTime <= 0);
  const gk = allPlayers.find(p => p.team !== holder.team && p.role === 'GK') ?? null;
  const goalX = attackGoalX(holder);
  const passing = holder.runtimeStats.withBall.passingSkill;
  // Close to the line the carrier has better options (cut inside, shoot, cut back, win a penalty):
  // a cross from there only wins when those options are poor.
  const distToLine = (goalX - holder.x) * holder.attackDir;
  const depthMult = distToLine < A.CROSS_DEEP_DIST ? A.CROSS_NEAR_LINE_MULT : 1;
  const R = A.TARGET_ZONE_RADIUS;
  const RA = A.ATTACKER_REACH_RADIUS;

  const out: CrossTarget[] = crossTargetPoints(holder).map(t => {
    let att = 0;
    let def = 0;
    let heading = 0;
    let bestAttackerId: number | null = null;
    let bestDist = Infinity;
    for (const p of attackers) {
      const d = Math.hypot(p.x - t.x, p.y - t.y);
      if (d >= RA) continue;
      const w = 1 - d / RA;
      att += w;
      heading = Math.max(heading, headingOf(p) * w);
      if (d < bestDist) { bestDist = d; bestAttackerId = p.id; }
    }
    for (const p of defenders) {
      const d = Math.hypot(p.x - t.x, p.y - t.y);
      if (d < R) def += 1 - d / R;
    }
    const gkClaim = gk !== null
      && keeperComesFor(Math.hypot(gk.x - t.x, gk.y - t.y), isInSmallBox(t.x, t.y, goalX), true);
    const raw = att <= 0 ? 0 : depthMult * Math.max(0,
      A.CROSS_BASE
      + (att - def * A.CROSS_DEFENDER_WEIGHT) * A.CROSS_NUMBERS_WEIGHT
      + passing * A.CROSS_PASS_WEIGHT
      + heading * A.CROSS_HEADING_WEIGHT
      - (gkClaim ? A.CROSS_GK_PENALTY : 0));
    return { ...t, attackers: att, defenders: def, heading, gkClaim, raw, bestAttackerId };
  });
  return out.sort((a, b) => b.raw - a.raw);
}

/**
 * Best long ball for `holder`: a teammate at least LONG_BALL_MIN_PROGRESS ahead and
 * LONG_BALL_MIN_DIST..MAX_DIST away, the ball aimed LONG_BALL_LEAD yards in front of him.
 * `weight` is the team's build_up appetite (`TeamPassWeights.LONG_BALL_WEIGHT`); 0 disables it.
 * Teammates beyond `offsideLine` (when given) are skipped.
 * Null when the holder is too far up the pitch or nobody qualifies.
 */
export function evaluateLongBall(
  holder: GamePlayer,
  allPlayers: GamePlayer[],
  weight: number,
  offsideLine: number | null = null,
): LongBallTarget | null {
  if (weight <= 0) return null;
  const ownGoalX = holder.attackDir === 1 ? 0 : PITCH_LENGTH;
  if (Math.abs(holder.x - ownGoalX) > A.LONG_BALL_MAX_HOLDER_DEPTH) return null;
  const defenders = allPlayers.filter(p => p.team !== holder.team && p.role !== 'GK');
  const passing = holder.runtimeStats.withBall.passingSkill;
  const pressure = longBallPressure(holder, allPlayers);
  const R = A.LONG_BALL_CONTEST_RADIUS;
  let best: LongBallTarget | null = null;
  for (const mate of allPlayers) {
    if (mate.team !== holder.team || mate.id === holder.id || mate.role === 'GK') continue;
    const progress = (mate.x - holder.x) * holder.attackDir;
    if (progress < A.LONG_BALL_MIN_PROGRESS) continue;
    // The passer reads the line: never aim at a teammate standing offside.
    if (offsideLine !== null && (mate.x - offsideLine) * holder.attackDir > 0) continue;
    const x = clamp(mate.x + holder.attackDir * A.LONG_BALL_LEAD, 1, PITCH_LENGTH - 1);
    const y = clamp(mate.y, 1, PITCH_WIDTH - 1);
    const dist = Math.hypot(x - holder.x, y - holder.y);
    if (dist < A.LONG_BALL_MIN_DIST || dist > A.LONG_BALL_MAX_DIST) continue;
    let diff = 0;
    for (const d of defenders) {
      const dd = Math.hypot(d.x - x, d.y - y);
      if (dd < R) diff -= 1 - dd / R;
    }
    for (const t of allPlayers) {
      if (t.team !== holder.team || t.id === holder.id || t.id === mate.id || t.role === 'GK') continue;
      const dd = Math.hypot(t.x - x, t.y - y);
      if (dd < R) diff += 1 - dd / R;
    }
    const numbers = clamp(0.5 + 0.25 * diff, 0, 1);
    const progressNorm = clamp(progress / A.LONG_BALL_MAX_DIST, 0, 1);
    const aerial = aerialAbility(mate);
    const raw = weight * (
      progressNorm * A.LONG_BALL_PROGRESS_WEIGHT
      + numbers * A.LONG_BALL_NUMBERS_WEIGHT
      + pressure * A.LONG_BALL_PRESSURE_WEIGHT
      + aerial * A.LONG_BALL_AERIAL_WEIGHT
      + passing * A.LONG_BALL_PASS_WEIGHT);
    if (!best || raw > best.raw) best = { targetId: mate.id, x, y, progress, numbers, pressure, aerial, raw };
  }
  return best;
}
