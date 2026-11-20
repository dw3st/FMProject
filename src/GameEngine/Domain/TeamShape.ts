/**
 * Team shape, out-of-possession zones and pressing in the pass shadow (engine rebuild stage 15, `team-shape.md`).
 *
 * Pure apart from two per-tick registries the tick loop fills (the team's formation, the zone covers), the same
 * pattern as the back line (`setBackLineX`). Constants in `Configs/ShapeConfig.ts`.
 */
import { TEAM_SHAPE as S } from '@/GameEngine/Configs/ShapeConfig';
import { PITCH_LENGTH, PITCH_WIDTH } from '@/GameEngine/Domain/pitch';
import { getMainRole } from '@/Domain/roles';
import { clamp } from '@/Domain/math';
import type { Formation, FormationSlotDef, GamePlayer, Phase, TeamId } from '@/GameEngine/types';

type Pt = { x: number; y: number };

// ── 1. The block ──────────────────────────────────────────────────────────────

/** A formation phase's outfield geometry in its own frame (x = yd from own goal): back four, front two, width. */
export interface ShapeTemplate { back: number; front: number; minY: number; maxY: number }

const _templates = new WeakMap<Formation, { attacking: ShapeTemplate; defending: ShapeTemplate }>();

const meanOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function templateOfSlots(slots: readonly FormationSlotDef[]): ShapeTemplate {
  const out = slots.filter(s => s.role !== 'GK');
  if (out.length === 0) return { back: 20, front: 50, minY: 10, maxY: 64 };
  const xs = out.map(s => s.x).sort((a, b) => a - b);
  const ys = out.map(s => s.y);
  return {
    back: meanOf(xs.slice(0, Math.min(4, xs.length))),
    front: meanOf(xs.slice(-Math.min(2, xs.length))),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

export function shapeTemplate(formation: Formation, phase: Phase): ShapeTemplate {
  let t = _templates.get(formation);
  if (!t) {
    t = { attacking: templateOfSlots(formation.attacking), defending: templateOfSlots(formation.defending) };
    _templates.set(formation, t);
  }
  return t[phase];
}

const _formation: Partial<Record<TeamId, Formation>> = {};
/** The tick loop registers each team's formation (the off-ball scoring has no formation in hand). */
export function setShapeFormations(a: Formation, b: Formation): void { _formation.A = a; _formation.B = b; }
export function shapeFormationOf(team: TeamId): Formation | undefined { return _formation[team]; }

/** Depth of `x` from the own goal line of a side attacking `attackDir`. */
export const fromOwnGoal = (x: number, attackDir: 1 | -1) => (attackDir === 1 ? x : PITCH_LENGTH - x);

/**
 * Where the back line stands (yd from its own goal) in a phase with the ball `ballDepth` yd from that goal: FM's mean
 * at halfway, sliding with the ball, within the phase's limits. `lineHeight` is the defensive-line tactic
 * (DEFENSIVE_LINE_HEIGHT, 0.6 = normal), out of possession only.
 */
export function backLineTarget(phase: Phase, ballDepth: number, lineHeight = 0.6): number {
  const half = PITCH_LENGTH / 2;
  if (phase === 'attacking') return clamp(S.IN_BACK_YD + S.IN_BALL_SLOPE * (ballDepth - half), S.IN_MIN_YD, S.IN_MAX_YD);
  const tactic = (lineHeight - 0.6) * S.LINE_TACTIC_YD;
  return clamp(S.OUT_BACK_YD + tactic + S.OUT_BALL_SLOPE * (ballDepth - half), S.OUT_MIN_YD, S.OUT_MAX_YD);
}

/**
 * A slot's anchor in FM's block: the formation's back four placed on the phase's back line, the shape scaled to the
 * phase's span (back four → front two) and width. `slot` is the absolute slot position (instruction offset included),
 * `ball` the ball point the shape reads. Width × `widthMult` (the tactic) on top.
 */
export function fmShapePoint(
  slot: Pt,
  player: { attackDir: 1 | -1 },
  ball: Pt,
  phase: Phase,
  formation: Formation,
  lineHeight = 0.6,
  widthMult = 1,
): Pt {
  const t = shapeTemplate(formation, phase);
  const dir = player.attackDir;
  const rel = fromOwnGoal(slot.x, dir);
  const back = backLineTarget(phase, fromOwnGoal(ball.x, dir), lineHeight);
  const span = phase === 'attacking' ? S.IN_SPAN_YD : S.OUT_SPAN_YD;
  const k = t.front - t.back > 1 ? span / (t.front - t.back) : 1;
  const relNew = clamp(back + (rel - t.back) * k, 1, PITCH_LENGTH - 1);
  const width = (phase === 'attacking' ? S.IN_WIDTH_YD : S.OUT_WIDTH_YD) * widthMult;
  const spread = t.maxY - t.minY;
  const c = PITCH_WIDTH / 2;
  const y = spread > 1 ? c + (slot.y - c) * (width / spread) : slot.y;
  return { x: dir === 1 ? relNew : PITCH_LENGTH - relNew, y: clamp(y, 1, PITCH_WIDTH - 1) };
}

// ── 2. Pressing states and the pass shadow ────────────────────────────────────

/**
 * FM's pressing state: the (predicted) ball in a 3×3 grid, mirrored per team. 3 × depth third (0 = the defending
 * side's own third) + lateral third (0 = its left). The meaning FM gives each state is not known; we read 0–2 as the
 * ball in our defensive third.
 */
export function pressStateOf(ball: Pt, defendingAttackDir: 1 | -1): number {
  const depth = Math.min(2, Math.floor(fromOwnGoal(ball.x, defendingAttackDir) / (PITCH_LENGTH / 3)));
  const yLeft = defendingAttackDir === 1 ? ball.y : PITCH_WIDTH - ball.y;
  const lat = Math.min(2, Math.max(0, Math.floor(yLeft / (PITCH_WIDTH / 3))));
  return depth * 3 + lat;
}

/**
 * The attacker's press point (FM: the midpoint between the carrier and the receiver, the cover shadow): among the
 * holder's teammates within SHADOW_RECEIVER_YD, the lane whose midpoint is nearest the presser, never closer than
 * SHADOW_MIN_HOLDER_YD to the holder. `null` = no receiver in range.
 */
export function passShadowPoint(presser: GamePlayer, holder: GamePlayer, players: readonly GamePlayer[]): (Pt & { receiverId: number }) | null {
  let best: (Pt & { receiverId: number }) | null = null;
  let bestD = Infinity;
  for (const r of players) {
    if (r.team !== holder.team || r.id === holder.id) continue;
    const d = Math.hypot(r.x - holder.x, r.y - holder.y);
    if (d > S.SHADOW_RECEIVER_YD || d < 1) continue;
    const h = Math.max(0.5, S.SHADOW_MIN_HOLDER_YD / d);
    const mx = holder.x + (r.x - holder.x) * h, my = holder.y + (r.y - holder.y) * h;
    const dp = Math.hypot(mx - presser.x, my - presser.y);
    if (dp < bestD) { bestD = dp; best = { x: mx, y: my, receiverId: r.id }; }
  }
  return best;
}

// ── 3. Out-of-possession zones ────────────────────────────────────────────────

type Line = 0 | 1 | 2; // 0 = defence, 1 = midfield, 2 = attack
const lineOfRole = (role: string): Line => {
  const m = getMainRole(role);
  return m === 'Defender' ? 0 : m === 'Forward' ? 2 : 1;
};
const COVERING = new Set(['CDM']);

/**
 * FM's position score of a player for a zone (0..20): his home zone, a lateral neighbour in his line, the nearest
 * zone of the next line, the rest far. A covering role (CDM, `cb_cover`) scores the zone behind higher, a forward the
 * zone ahead; a centre-back only scores his own line.
 */
export function zoneScore(
  player: { role: string; instruction?: { variant?: string } },
  zone: { role: string; rank: number },
  home: { role: string; rank: number },
  sameZone: boolean,
): number {
  if (sameZone) return S.ZONE_HOME;
  const pl = lineOfRole(home.role), zl = lineOfRole(zone.role);
  const lateral = Math.abs(zone.rank - home.rank);
  if (pl === zl) return lateral <= 1 ? S.ZONE_NEIGHBOUR : S.ZONE_NEXT_LINE - 3;
  if (player.role === 'CB' && player.instruction?.variant !== 'cb_cover') return 0;
  let s = Math.abs(pl - zl) === 1 && lateral <= 1 ? S.ZONE_NEXT_LINE : S.ZONE_FAR;
  const covering = COVERING.has(player.role) || player.instruction?.variant === 'cb_cover';
  if (covering && zl < pl) s += S.ZONE_ROLE_BONUS;
  if (pl === 2 && zl > pl) s += S.ZONE_ROLE_BONUS;
  return s;
}

/** One zone of the shape: its anchor, the slot it belongs to and its lateral rank within its line. */
export interface ShapeZone extends Pt { ownerId: number; role: string; rank: number }

/** Lateral rank of each outfield player within his line (by the anchor's y). */
export function zonesOf(players: readonly GamePlayer[], anchors: ReadonlyMap<number, Pt>): ShapeZone[] {
  const zones: ShapeZone[] = [];
  for (const p of players) {
    const a = anchors.get(p.id);
    if (!a || p.role === 'GK') continue;
    zones.push({ x: a.x, y: a.y, ownerId: p.id, role: p.role, rank: 0 });
  }
  for (const line of [0, 1, 2] as Line[]) {
    const inLine = zones.filter(z => lineOfRole(z.role) === line).sort((a, b) => a.y - b.y);
    inLine.forEach((z, i) => { z.rank = i; });
  }
  return zones;
}

/**
 * Who covers a vacated zone (FM: out-of-possession positions assigned by score). A zone is vacant when its owner is
 * not holding the shape (pressing, marking, chasing, recovering) or is ZONE_LEFT_YD away from it. A vacant zone within
 * COVER_BALL_YD of the ball is taken, the one nearest the ball first, by the holder with the best value (his score for
 * it − ZONE_DIST_COST × the distance), among those whose score is at least ZONE_NEXT_LINE, within COVER_MAX_YD of it,
 * for whom it is more important than his own zone (deeper or nearer the ball by COVER_GAIN_YD): his own zone, further
 * from the danger, is the one left empty. One step only (no chains). Returns holderId → the zone he covers.
 */
export function assignZoneCover(
  players: readonly GamePlayer[],
  zones: readonly ShapeZone[],
  holding: (p: GamePlayer) => boolean,
  ball: Pt,
  attackDir: 1 | -1,
  /** Last tick's covers (holderId → zone owner): a cover still valid is kept, so the assignment does not flicker. */
  prev?: ReadonlyMap<number, number>,
): Map<number, ShapeZone> {
  const byId = new Map(players.map(p => [p.id, p] as const));
  const zoneOf = new Map(zones.map(z => [z.ownerId, z] as const));
  const dBall = (z: Pt) => Math.hypot(z.x - ball.x, z.y - ball.y);
  const isVacant = (z: ShapeZone) => {
    const o = byId.get(z.ownerId);
    return !o || !holding(o) || Math.hypot(o.x - z.x, o.y - z.y) > S.ZONE_LEFT_YD;
  };
  const vacant = zones.filter(z => isVacant(z) && dBall(z) <= S.COVER_BALL_YD).sort((a, b) => dBall(a) - dBall(b));
  const out = new Map<number, ShapeZone>();
  const used = new Set<number>();
  const taken = new Set<ShapeZone>();
  for (const [holderId, ownerId] of prev ?? []) {
    const vz = vacant.find(z => z.ownerId === ownerId);
    const c = byId.get(holderId);
    const home = zoneOf.get(holderId);
    if (!vz || !c || !home || !holding(c) || used.has(holderId)) continue;
    if (Math.hypot(c.x - vz.x, c.y - vz.y) > S.COVER_MAX_YD) continue;
    out.set(holderId, vz); used.add(holderId); taken.add(vz);
  }
  for (const vz of vacant) {
    if (taken.has(vz)) continue;
    let best: GamePlayer | null = null;
    let bestVal = -Infinity;
    for (const z of zones) {
      if (z === vz || used.has(z.ownerId)) continue;
      const c = byId.get(z.ownerId)!;
      // A candidate holds his own zone (or was covering last tick, away from it on purpose).
      if (!c || !holding(c) || (isVacant(z) && !prev?.has(c.id))) continue;
      const home = zoneOf.get(c.id)!;
      const score = zoneScore(c, vz, home, false);
      const dist = Math.hypot(c.x - vz.x, c.y - vz.y);
      if (score < S.ZONE_NEXT_LINE || dist > S.COVER_MAX_YD) continue;
      const deeper = fromOwnGoal(home.x, attackDir) - fromOwnGoal(vz.x, attackDir);
      const nearer = dBall(home) - dBall(vz);
      if (Math.max(deeper, nearer) < S.COVER_GAIN_YD) continue;
      const val = score - S.ZONE_DIST_COST * dist;
      if (val > bestVal) { bestVal = val; best = c; }
    }
    if (best) { out.set(best.id, vz); used.add(best.id); }
  }
  return out;
}

const _cover: Partial<Record<TeamId, Map<number, ShapeZone>>> = {};
/** The tick loop hands each side's zone covers for this tick. */
export function setZoneCover(team: TeamId, cover: Map<number, ShapeZone> | null): void { _cover[team] = cover ?? undefined; }
export function zoneCoverOf(player: { id: number; team: TeamId }): ShapeZone | undefined { return _cover[player.team]?.get(player.id); }
