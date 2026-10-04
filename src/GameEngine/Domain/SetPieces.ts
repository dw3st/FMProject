/**
 * SetPieces — pure decision-side logic of the set pieces (Etapa 14,
 * `.claude/rules/game-engine/set-pieces-play.md`):
 *
 *   - Takers: automatic pick by attribute (corners = delivery, free kicks / penalties = finishing),
 *     or the user's choice when that player is on the pitch.
 *   - Direct free kick: range/angle test, xG before the wall, wall size and spots.
 *   - Box set pieces (corner, crossed free kick): where both teams stand, and the taker's
 *     delivery options (near post / penalty spot / far post / short).
 *
 * No state mutation, no randomness of its own (the layout jitter takes an injected rng).
 * Execution lives in `gameState.ts`.
 */
import type { GamePlayer, PlayerRole } from '@/GameEngine/types';
import type { BuildUpStyle } from '@/types/tacticsTypes';
import { SET_PIECE_CONFIG as C } from '@/GameEngine/Configs/SetPieceConfig';
import { aerialAbility, crossTargetPoints, isInSmallBox, keeperComesFor, type CrossTargetKind } from '@/GameEngine/Domain/Aerial';
import { computeOpenAngle } from '@/GameEngine/Infrastructure/ActionOutcomes';
import { PITCH_LENGTH, PITCH_WIDTH, GOAL_Y_MIN, GOAL_Y_MAX, isInGoalScoreArea } from '@/GameEngine/Domain/pitch';

type Pos = { x: number; y: number };

const CENTRE_Y = PITCH_WIDTH / 2;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clampPos = (p: Pos): Pos => ({ x: clamp(p.x, 0.5, PITCH_LENGTH - 0.5), y: clamp(p.y, 0.5, PITCH_WIDTH - 0.5) });

const DEFENDER_ROLES = new Set<PlayerRole>(['CB', 'LB', 'RB', 'LWB', 'RWB']);
const FORWARD_ROLES = new Set<PlayerRole>(['ST', 'LW', 'RW']);
const MIDFIELD_ROLES = new Set<PlayerRole>(['CDM', 'CM', 'CAM', 'LM', 'RM']);

// ── Takers ────────────────────────────────────────────────────────────────────

/** The three set-piece duties a manager can assign (`TacticsSave.setPieceTakers`). */
export type SetPieceDuty = 'corners' | 'freeKicks' | 'penalties';

/** Automatic-pick score: delivery (passing + vision) for corners, finishing for free kicks / penalties. */
export function setPieceTakerScore(duty: SetPieceDuty, p: GamePlayer): number {
  const wb = p.runtimeStats.withBall;
  return duty === 'corners' ? (wb.passingSkill + wb.vision) / 2 : wb.shootAccuracy;
}

/**
 * Taker for `duty` among `pool` (one team's players on the pitch): the chosen player when he is in
 * the pool, else the best outfielder by `setPieceTakerScore` (ties: lowest slot index).
 */
export function pickSetPieceTaker(duty: SetPieceDuty, pool: GamePlayer[], preferredRosterId?: string): GamePlayer | null {
  if (pool.length === 0) return null;
  if (preferredRosterId) {
    const chosen = pool.find(p => p.rosterId === preferredRosterId);
    if (chosen) return chosen;
  }
  const outfield = pool.filter(p => p.role !== 'GK');
  const candidates = outfield.length > 0 ? outfield : pool;
  return candidates.reduce((best, p) => {
    const d = setPieceTakerScore(duty, p) - setPieceTakerScore(duty, best);
    return d > 1e-9 || (Math.abs(d) <= 1e-9 && p.slotIndex < best.slotIndex) ? p : best;
  });
}

// ── Direct free kick and the wall ─────────────────────────────────────────────

function goalXFor(attackDir: 1 | -1): number {
  return attackDir === 1 ? PITCH_LENGTH : 0;
}

/** Distance from `pos` to the centre of the goal on line `goalX`. */
export function distToGoalCentre(pos: Pos, goalX: number): number {
  return Math.hypot(goalX - pos.x, CENTRE_Y - pos.y);
}

/** Free kick at `pos` for a team attacking in `attackDir` is shot directly: within range, central, outside the box. */
export function isDirectFreeKick(pos: Pos, attackDir: 1 | -1): boolean {
  const goalX = goalXFor(attackDir);
  if (distToGoalCentre(pos, goalX) > C.DIRECT_FK_RANGE) return false;
  if ((goalX - pos.x) * attackDir < 0) return false;
  if (isInGoalScoreArea(pos.x, pos.y, goalX)) return false;
  return computeOpenAngle(pos.x, pos.y, goalX) >= C.DIRECT_FK_MIN_ANGLE;
}

/** Direct free-kick xG before the wall: FK_XG_BASE × distance factor × angle factor. */
export function directFreeKickXG(dist: number, openAngle: number): number {
  const distF = dist <= C.FK_XG_NEAR
    ? 1
    : clamp(1 - ((dist - C.FK_XG_NEAR) / (C.DIRECT_FK_RANGE - C.FK_XG_NEAR)) * (1 - C.FK_XG_FAR_FACTOR), C.FK_XG_FAR_FACTOR, 1);
  const angF = clamp(openAngle / C.FK_XG_REF_ANGLE, 0.3, 1);
  return C.FK_XG_BASE * distF * angF;
}

/** Wall size: WALL_MIN..WALL_MAX, more when the kick is closer and more central. */
export function wallSize(dist: number, openAngle: number): number {
  const centrality = clamp((openAngle - C.DIRECT_FK_MIN_ANGLE) / (C.FK_XG_REF_ANGLE - C.DIRECT_FK_MIN_ANGLE), 0, 1);
  const closeness = clamp(1 - (dist - C.FK_XG_NEAR) / (C.DIRECT_FK_RANGE - C.FK_XG_NEAR), 0, 1);
  return Math.round(C.WALL_MIN + (C.WALL_MAX - C.WALL_MIN) * (0.5 * centrality + 0.5 * closeness));
}

/** Chance the direct shot strikes a wall of `n` men (= the share of its xG the wall takes away). */
export function wallBlockChance(n: number): number {
  return clamp(n * C.WALL_BLOCK_FACTOR, 0, 0.5);
}

/** Wall spots: WALL_DISTANCE yards from the ball on the ball→goal-centre line, WALL_SPACING apart. */
export function wallSpots(ball: Pos, goalX: number, n: number): Pos[] {
  const dx = goalX - ball.x;
  const dy = CENTRE_Y - ball.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const cx = ball.x + ux * C.WALL_DISTANCE;
  const cy = ball.y + uy * C.WALL_DISTANCE;
  return Array.from({ length: n }, (_, i) => {
    const off = (i - (n - 1) / 2) * C.WALL_SPACING;
    return clampPos({ x: cx - uy * off, y: cy + ux * off });
  });
}

/**
 * The 10-yard rule: `pos` pushed out along the ball→pos direction to at least `min` yards from
 * `ball` (straight back toward `goalX` when it sits on the ball). Kept on the pitch.
 */
export function keepDistanceFromBall(pos: Pos, ball: Pos, goalX: number, min = C.MIN_DEFENDER_DISTANCE): Pos {
  const dx = pos.x - ball.x;
  const dy = pos.y - ball.y;
  const d = Math.hypot(dx, dy);
  if (d >= min) return pos;
  let ux = dx / (d || 1);
  let uy = dy / (d || 1);
  if (d < 0.01) {
    ux = goalX > ball.x ? 1 : -1;
    uy = 0;
  }
  return clampPos({ x: ball.x + ux * min, y: ball.y + uy * min });
}

// ── Box set pieces: layout ────────────────────────────────────────────────────

export type BoxSetPieceKind = 'corner' | 'free_kick';

export interface AttackingBoxLayout {
  positions: Map<number, Pos>;
  /** Players sent into the box, best in the air first. */
  boxAttackers: number[];
  /** Edge-of-the-box player (rebounds). */
  edgeId: number | null;
  /** Short option next to the taker. */
  shortId: number | null;
}

export interface DefendingBoxLayout {
  positions: Map<number, Pos>;
  /** Box attacker id → his marker. */
  markers: Map<number, number>;
  /** The forward left up the pitch for the counter. */
  outletId: number | null;
}

const byAerial = (a: GamePlayer, b: GamePlayer) => aerialAbility(b) - aerialAbility(a) || a.slotIndex - b.slotIndex;
const pace = (p: GamePlayer) => p.runtimeStats.withoutBall.speed + p.runtimeStats.withoutBall.acceleration;

/** Depth of the defensive line on a crossed free kick from `ball` (yards from the goal line). */
function freeKickLineDepth(ball: Pos, goalX: number): number {
  return clamp(Math.abs(goalX - ball.x) - 14, 10, 18);
}

/**
 * Where the attacking team stands for a corner / crossed free kick (`attackDir` of that team):
 * the taker on the ball, the two best aerial defenders, the centre-forward and the next best headers
 * in the box (BOX_ATTACKERS, best header on the penalty spot), a midfielder on the edge of the box,
 * a short option next to the taker, the rest (and the keeper) back. A crossed free kick lines the
 * box attackers up just onside, level with the defensive line. `rng` jitters the box spots.
 */
export function attackingBoxPositions(
  players: GamePlayer[],
  takerId: number,
  ball: Pos,
  attackDir: 1 | -1,
  kind: BoxSetPieceKind,
  rng: () => number,
): AttackingBoxLayout {
  const goalX = goalXFor(attackDir);
  const ownGoalX = attackDir === 1 ? 0 : PITCH_LENGTH;
  const fromLine = (d: number) => goalX - attackDir * d;
  const nearLow = ball.y < CENTRE_Y;
  const positions = new Map<number, Pos>();
  positions.set(takerId, { ...ball });

  const outfield = players.filter(p => p.id !== takerId && p.role !== 'GK');
  for (const gk of players.filter(p => p.id !== takerId && p.role === 'GK')) {
    positions.set(gk.id, { x: ownGoalX + attackDir * 18, y: CENTRE_Y });
  }
  const used = new Set<number>();
  const take = (p: GamePlayer | undefined) => { if (p) used.add(p.id); return p; };

  // Box group: the two best aerial defenders, the centre-forward, then the best headers left.
  const box: GamePlayer[] = [];
  for (const d of outfield.filter(p => DEFENDER_ROLES.has(p.role)).sort(byAerial).slice(0, C.BOX_DEFENDERS_UP)) box.push(take(d)!);
  const forwards = outfield.filter(p => FORWARD_ROLES.has(p.role) && !used.has(p.id));
  const cf = forwards.find(p => p.role === 'ST') ?? forwards.sort(byAerial)[0];
  if (cf && box.length < C.BOX_ATTACKERS) box.push(take(cf)!);
  for (const p of outfield.filter(p => !used.has(p.id) && !DEFENDER_ROLES.has(p.role)).sort(byAerial)) {
    if (box.length >= C.BOX_ATTACKERS) break;
    box.push(take(p)!);
  }
  box.sort(byAerial);

  const jit = () => (rng() * 2 - 1) * C.BOX_JITTER;
  if (kind === 'corner') {
    const nearPostY = nearLow ? GOAL_Y_MIN : GOAL_Y_MAX;
    const farPostY = nearLow ? GOAL_Y_MAX + 2 : GOAL_Y_MIN - 2;
    const side = nearLow ? 1 : -1; // toward the far side
    const spots: Pos[] = [
      { x: fromLine(11), y: CENTRE_Y },
      { x: fromLine(6.5), y: farPostY },
      { x: fromLine(6.5), y: nearPostY },
      { x: fromLine(8.5), y: CENTRE_Y + side * 2 },
      { x: fromLine(12.5), y: CENTRE_Y + side * 9 },
      { x: fromLine(14), y: CENTRE_Y - side * 4 },
    ];
    box.forEach((p, i) => {
      const s = spots[i % spots.length]!;
      positions.set(p.id, clampPos({ x: s.x + jit(), y: s.y + jit() }));
    });
  } else {
    // Crossed free kick: level with the defensive line (just onside), spread across the box.
    const L = freeKickLineDepth(ball, goalX);
    const offsets = [0, 5, -5, 10, -10, 14];
    box.forEach((p, i) => {
      positions.set(p.id, clampPos({ x: fromLine(L + 1.5), y: CENTRE_Y + offsets[i % offsets.length]! + jit() }));
    });
  }

  // Edge of the box: a midfielder, the best finisher.
  const mids = outfield.filter(p => !used.has(p.id) && MIDFIELD_ROLES.has(p.role));
  const edgePool = mids.length > 0 ? mids : outfield.filter(p => !used.has(p.id));
  const edge = take(edgePool.sort((a, b) =>
    b.runtimeStats.withBall.shootAccuracy - a.runtimeStats.withBall.shootAccuracy || a.slotIndex - b.slotIndex)[0]);
  if (edge) {
    const depth = kind === 'corner' ? C.EDGE_DEPTH : Math.max(C.EDGE_DEPTH, freeKickLineDepth(ball, goalX) + 6);
    positions.set(edge.id, { x: fromLine(depth), y: CENTRE_Y });
  }

  // Short option next to the taker (only when at least two players are still left to stay back).
  let short: GamePlayer | undefined;
  const left = outfield.filter(p => !used.has(p.id));
  if (left.length >= 3) {
    const spot: Pos = kind === 'corner'
      ? { x: fromLine(C.SHORT_DEPTH), y: nearLow ? C.SHORT_WIDTH : PITCH_WIDTH - C.SHORT_WIDTH }
      : clampPos({ x: ball.x - attackDir * 3, y: ball.y + (nearLow ? 1 : -1) * C.SHORT_WIDTH });
    short = take(left.reduce((a, b) =>
      Math.hypot(b.x - spot.x, b.y - spot.y) < Math.hypot(a.x - spot.x, a.y - spot.y) ? b : a));
    positions.set(short!.id, clampPos(spot));
  }

  // The rest stays back, spread across the pitch.
  const rest = outfield.filter(p => !used.has(p.id)).sort((a, b) => a.y - b.y);
  rest.forEach((p, i) => {
    const y = rest.length === 1 ? CENTRE_Y : 18 + (i * (PITCH_WIDTH - 36)) / (rest.length - 1);
    positions.set(p.id, { x: fromLine(C.REST_DEPTH), y });
  });

  return { positions, boxAttackers: box.map(p => p.id), edgeId: edge?.id ?? null, shortId: short?.id ?? null };
}

/**
 * Where the defending team stands against `att` (its own goal line at `goalX`): the keeper on his
 * line, a marker goal-side of every box attacker (best headers on the best headers), a man on the
 * near post (corner), one on the edge player and one on the short option, the fastest forward left
 * up as the outlet, the rest zonal in the box.
 */
export function defendingBoxPositions(
  players: GamePlayer[],
  att: AttackingBoxLayout,
  ball: Pos,
  goalX: number,
  kind: BoxSetPieceKind,
): DefendingBoxLayout {
  const s = goalX === PITCH_LENGTH ? 1 : -1; // +x toward the goal
  const fromLine = (d: number) => goalX - s * d;
  const nearLow = ball.y < CENTRE_Y;
  const positions = new Map<number, Pos>();
  const markers = new Map<number, number>();
  const towardGoal = (p: Pos, d: number): Pos => {
    const dx = goalX - p.x;
    const dy = CENTRE_Y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    return clampPos({ x: p.x + (dx / len) * d, y: p.y + (dy / len) * d });
  };

  for (const gk of players.filter(p => p.role === 'GK')) {
    positions.set(gk.id, kind === 'corner'
      ? { x: fromLine(0.7), y: CENTRE_Y + (nearLow ? -1 : 1) }
      : { x: fromLine(4), y: CENTRE_Y });
  }
  const outfield = players.filter(p => p.role !== 'GK');
  const used = new Set<number>();

  // Outlet: the fastest forward stays up.
  const fwd = outfield.filter(p => FORWARD_ROLES.has(p.role)).sort((a, b) => pace(b) - pace(a) || a.slotIndex - b.slotIndex)[0];
  let outletId: number | null = null;
  if (fwd && outfield.length > 4) {
    outletId = fwd.id;
    used.add(fwd.id);
    positions.set(fwd.id, { x: fromLine(C.OUTLET_DEPTH), y: CENTRE_Y });
  }

  const pool = () => outfield.filter(p => !used.has(p.id)).sort(byAerial);
  const posOf = (id: number) => att.positions.get(id);

  // Markers: best headers on the best headers (att.boxAttackers is sorted best first).
  for (const aid of att.boxAttackers) {
    const a = posOf(aid);
    const m = pool()[0];
    if (!a || !m) break;
    used.add(m.id);
    markers.set(aid, m.id);
    positions.set(m.id, kind === 'corner' ? towardGoal(a, 1.2) : clampPos({ x: a.x + s * 0.6, y: a.y }));
  }

  const place = (p: Pos | null) => {
    const m = pool()[0];
    if (!m || !p) return;
    used.add(m.id);
    positions.set(m.id, clampPos(p));
  };
  if (kind === 'corner') place({ x: fromLine(1.5), y: nearLow ? GOAL_Y_MIN + 0.5 : GOAL_Y_MAX - 0.5 });
  if (att.edgeId !== null) { const e = posOf(att.edgeId); place(e ? towardGoal(e, 1.5) : null); }
  if (att.shortId !== null) { const sh = posOf(att.shortId); place(sh ? towardGoal(sh, 3) : null); }

  // Zonal: the rest inside the box (or holding the line on a free kick).
  const lineDepth = kind === 'corner' ? 9 : freeKickLineDepth(ball, goalX);
  const zones = [0, -6, 6, -11, 11, 3, -3];
  pool().forEach((p, i) => {
    positions.set(p.id, clampPos({ x: fromLine(kind === 'corner' ? lineDepth - (i % 2) * 2 : lineDepth), y: CENTRE_Y + zones[i % zones.length]! }));
  });
  // The 10-yard rule (the short-option marker is the one that can end up too close).
  for (const [id, pos] of positions) positions.set(id, keepDistanceFromBall(pos, ball, goalX));
  return { positions, markers, outletId };
}

// ── Box set pieces: the taker's options ───────────────────────────────────────

export interface SetPieceOption {
  kind: CrossTargetKind | 'short';
  x: number;
  y: number;
  /** Raw score (higher = better); not compressed. */
  raw: number;
  /** Receiver of the short option / attacker closest to a delivery target. */
  targetId: number | null;
  /** Proximity-weighted aerial ability of attackers / defenders in the target zone. */
  attackers: number;
  defenders: number;
}

/**
 * Delivery options of a corner / crossed free-kick taker: the three cross targets (near post,
 * penalty spot, far post) scored by the aerial ability of the attackers vs defenders in each zone
 * and the taker's delivery, minus a keeper-claim penalty; plus the short pass to the nearest
 * teammate (favoured by `possession`, disfavoured by `direct`). Sorted best first.
 */
export function evaluateBoxSetPiece(
  taker: GamePlayer,
  allPlayers: GamePlayer[],
  buildUp: BuildUpStyle,
  kind: BoxSetPieceKind = 'corner',
): SetPieceOption[] {
  const goalX = goalXFor(taker.attackDir);
  const mates = allPlayers.filter(p => p.team === taker.team && p.id !== taker.id && p.role !== 'GK');
  const opps = allPlayers.filter(p => p.team !== taker.team && p.role !== 'GK' && p.recoveryTime <= 0);
  const gk = allPlayers.find(p => p.team !== taker.team && p.role === 'GK') ?? null;
  const delivery = (taker.runtimeStats.withBall.passingSkill + taker.runtimeStats.withBall.vision) / 2;
  const R = kind === 'corner' ? C.TARGET_ZONE_RADIUS : C.FK_TARGET_ZONE_RADIUS;

  // A crossed free kick: both lines start level and run onto the ball, so the head count is taken
  // where the lines stand, across from the target.
  const lineX = goalX - taker.attackDir * freeKickLineDepth({ x: taker.x, y: taker.y }, goalX);
  const out: SetPieceOption[] = crossTargetPoints(taker).map(t => {
    const zone = kind === 'corner' ? t : { x: lineX, y: t.y };
    let att = 0;
    let def = 0;
    let targetId: number | null = null;
    let best = Infinity;
    let nearestMate = Infinity;
    for (const p of mates) {
      const d = Math.hypot(p.x - zone.x, p.y - zone.y);
      if (d < R) att += aerialAbility(p) * (1 - d / R);
      if (d < best) { best = d; targetId = p.id; }
      nearestMate = Math.min(nearestMate, Math.hypot(p.x - t.x, p.y - t.y));
    }
    for (const p of opps) {
      const d = Math.hypot(p.x - zone.x, p.y - zone.y);
      if (d < R) def += aerialAbility(p) * (1 - d / R);
    }
    const dGk = gk ? Math.hypot(gk.x - t.x, gk.y - t.y) : Infinity;
    const gkClaim = gk !== null && keeperComesFor(dGk, isInSmallBox(t.x, t.y, goalX), dGk < nearestMate);
    const raw = att <= 0 ? 0 : Math.max(0,
      C.CORNER_BASE
      + (att - def * C.CORNER_DEFENDER_WEIGHT) * C.CORNER_NUMBERS_WEIGHT
      + delivery * C.CORNER_DELIVERY_WEIGHT
      - (gkClaim ? C.CORNER_GK_PENALTY : 0));
    return { kind: t.kind, x: t.x, y: t.y, raw, targetId, attackers: att, defenders: def };
  });

  if (mates.length > 0) {
    const short = mates.reduce((a, b) =>
      Math.hypot(b.x - taker.x, b.y - taker.y) < Math.hypot(a.x - taker.x, a.y - taker.y) ? b : a);
    const open = !opps.some(o => Math.hypot(o.x - short.x, o.y - short.y) < C.SHORT_OPEN_RADIUS);
    const raw = C.SHORT_BASE + (open ? C.SHORT_OPEN_BONUS : 0)
      + (buildUp === 'possession' ? C.SHORT_POSSESSION_BONUS : 0)
      - (buildUp === 'direct' ? C.SHORT_DIRECT_PENALTY : 0);
    out.push({ kind: 'short', x: short.x, y: short.y, raw, targetId: short.id, attackers: 0, defenders: 0 });
  }
  return out.sort((a, b) => b.raw - a.raw);
}
