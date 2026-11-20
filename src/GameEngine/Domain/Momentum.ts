/**
 * Stage 17 (`player-scores.md` → "Momentum"): FM's momentum, as a statistic and a bar — never read by the engine.
 *
 *  - Detection (engine side): `simStep` keeps every player's position; touches (a new holder), completed passes and
 *    shots by outcome become `momentumPoints` events with FM's points for the zone (`MOMENTUM_TABLE`). Without a
 *    `simStep` in the match (a browser that only replays the server's events) nothing is detected here: the forwarded
 *    `momentumPoints` events feed the bar instead.
 *  - Bar: points per match minute per side; `momentumBar` is the decayed difference (−1 B .. +1 A).
 */
import { gameBus } from '@/GameEngine/Infrastructure/EventBus';
import { MOMENTUM, MOMENTUM_TABLE, type MomentumEvent } from '@/GameEngine/Configs/MomentumConfig';
import { PITCH_LENGTH, PITCH_WIDTH } from '@/GameEngine/Domain/pitch';
import type { GameState, MatchPhase, TeamId } from '@/GameEngine/types';

/** `matchMinute` (gameState.ts), inlined so this module never imports the engine. */
const OFFSET: Partial<Record<MatchPhase, number>> = { secondHalf: 45, extraTimeBreak: 45, extraTimeFirst: 90, extraTimeSecond: 105, penalties: 105 };
const minuteOf = (s: GameState): number => Math.floor(s.matchTime / 60) + (OFFSET[s.matchPhase] ?? 0);

/** Sixth (0..5) from the attacking side and third (0 left, 1 central, 2 right from the attacker's view). */
export function momentumZone(x: number, y: number, attackDir: 1 | -1): { sixth: number; third: number } {
  const progress = attackDir === 1 ? x : PITCH_LENGTH - x;
  const sixth = Math.max(0, Math.min(5, Math.floor(progress / (PITCH_LENGTH / 6))));
  const yFromLeft = attackDir === 1 ? y : PITCH_WIDTH - y;
  const third = Math.max(0, Math.min(2, Math.floor(yFromLeft / (PITCH_WIDTH / 3))));
  return { sixth, third };
}

/** FM's points for an event at a spot (0 in the own half and the 3rd sixth). */
export function momentumPointsAt(kind: MomentumEvent, x: number, y: number, attackDir: 1 | -1): number {
  const { sixth, third } = momentumZone(x, y, attackDir);
  if (sixth < 3) return 0;
  return MOMENTUM_TABLE[kind][sixth - 3]![third]!;
}

/** Points per side per match minute (index = `matchMinute`). */
export type MomentumMinutes = Array<{ A: number; B: number }>;

/** The bar at `minute`: decayed points of A minus B over the window, −1 (B on top) .. +1 (A on top). */
export function momentumBar(minutes: MomentumMinutes, minute: number): number {
  let a = 0, b = 0;
  for (let m = Math.max(0, minute - MOMENTUM.WINDOW_MIN); m <= minute && m < minutes.length; m++) {
    const w = Math.pow(0.5, (minute - m) / MOMENTUM.HALF_LIFE_MIN);
    a += (minutes[m]?.A ?? 0) * w;
    b += (minutes[m]?.B ?? 0) * w;
  }
  return (a - b) / (a + b + MOMENTUM.CALM);
}

// ── Tracker ───────────────────────────────────────────────────────────────────

const pos = new Map<number, { x: number; y: number; team: TeamId; dir: 1 | -1 }>();
let live = false;
let minute = 0;
let prevHolder: number | null = null;
let perMinute: MomentumMinutes = [];
const totals: Record<TeamId, number> = { A: 0, B: 0 };

function emit(kind: MomentumEvent, playerId: number, x?: number, y?: number): void {
  if (!live) return;
  const p = pos.get(playerId);
  if (!p) return;
  const points = momentumPointsAt(kind, x ?? p.x, y ?? p.y, p.dir);
  if (points > 0) gameBus.emit('momentumPoints', { team: p.team, kind, points, minute });
}

gameBus.on('simStep', e => {
  live = true;
  const s = e.state;
  minute = minuteOf(s);
  for (const p of s.players) pos.set(p.id, { x: p.x, y: p.y, team: p.team, dir: p.attackDir });
  if (s.ballHolderId !== null && s.ballHolderId !== prevHolder) emit('touch', s.ballHolderId);
  prevHolder = s.ballHolderId;
});
gameBus.on('passCompleted', e => emit('pass', e.toId));
gameBus.on('shotResolved', e => {
  const kind: MomentumEvent = e.isGoal ? 'goal' : e.outcome === 'woodwork' ? 'woodwork' : e.outcome === 'saved' || (e.outcome === undefined && e.inPosts) ? 'saved' : 'missed';
  emit(kind, e.player, e.fromX, e.fromY);
});
gameBus.on('shotBlocked', e => emit('blocked', e.player));
gameBus.on('penaltyResolved', e => emit(e.scored ? 'goal' : 'saved', e.takerId));
gameBus.on('momentumPoints', e => {
  while (perMinute.length <= e.minute) perMinute.push({ A: 0, B: 0 });
  perMinute[e.minute]![e.team] += e.points;
  totals[e.team] += e.points;
  minute = Math.max(minute, e.minute);
});

/** Reset for a new match (called by `initStats`). */
export function resetMomentum(): void {
  pos.clear(); live = false; minute = 0; prevHolder = null; perMinute = []; totals.A = 0; totals.B = 0;
}

/** The bar now (−1..+1, + = A on top), the minute it reads, and each side's points so far. */
export function getMomentum(): { bar: number; minute: number; points: { A: number; B: number } } {
  return { bar: momentumBar(perMinute, minute), minute, points: { ...totals } };
}

/** The bar at every minute played so far (the momentum graph). */
export function getMomentumTimeline(): number[] {
  return perMinute.map((_, m) => momentumBar(perMinute, m));
}

export interface MomentumState { perMinute: MomentumMinutes; minute: number; totals: { A: number; B: number } }
export function exportMomentumState(): MomentumState {
  return { perMinute: perMinute.map(p => ({ ...p })), minute, totals: { ...totals } };
}
export function importMomentumState(st: MomentumState): void {
  perMinute = st.perMinute.map(p => ({ ...p })); minute = st.minute; totals.A = st.totals.A; totals.B = st.totals.B;
}
