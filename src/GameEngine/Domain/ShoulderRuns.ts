/**
 * Runs on the last defender's shoulder (engine rebuild stage 15, `team-shape.md`; what stage 13 left out of the
 * offside: FM's offsides come from runs timed on the pass). A runner making a run (`make_run`) who stands on his read
 * of the line, with a free teammate on the ball within range, goes when the holder plays forward (a good reader at
 * once, a poor one up to REACT_S later) or now and then early, before any pass (a mistimed run). While going he is not
 * held on the line: if the pass comes after he crossed it, the call (`checkReceiverOffside`, the true line at the
 * pass) gives offside. A run lasts GO_S seconds of play.
 *
 * The tick loop calls `shoulderRunGoing` for every off-ball runner it moves; draws only with the flag on.
 */
import { TEAM_SHAPE as S } from '@/GameEngine/Configs/ShapeConfig';
import { actionClock } from '@/GameEngine/Domain/ActionHold';
import { offBallIntentOf } from '@/GameEngine/Domain/OffBallMovement';
import { anticipationOf } from '@/GameEngine/Domain/OffsideRuns';
import { matchRandom } from '@/GameEngine/Infrastructure/MatchRng';
import { gameBus } from '@/GameEngine/Infrastructure/EventBus';
import { debugLog } from '@/GameEngine/Support/DebugLog';
import type { GamePlayer } from '@/GameEngine/types';
import { registerEngineMemory, mapPart } from '@/GameEngine/Support/EngineMemory';

interface Run { until: number; cueAt?: number }
const _runs = new Map<number, Run>();
export function resetShoulderRuns(): void { _runs.clear(); }
/** He is on a shoulder run right now (the `/test` overlay). */
export function shoulderRunActive(playerId: number): boolean {
  const r = _runs.get(playerId);
  return !!r && r.cueAt === undefined && r.until > actionClock();
}

/** The holder's decision types that are a ball forward to a runner (the cue). */
const CUES = new Set(['pass', 'through_ball', 'long_ball', 'cross']);

/** On the shoulder: behind his read of the line by at most SHOULDER_YD (or a yard past it, a misread). */
export function onShoulder(player: GamePlayer, line: number): boolean {
  const gap = (line - player.x) * player.attackDir;
  return gap >= -1 && gap <= S.SHOULDER_YD;
}

/** Whether `player` is on a shoulder run this tick (starting one when the moment comes). */
export function shoulderRunGoing(
  player: GamePlayer,
  holder: GamePlayer,
  holderDecision: string | undefined,
  line: number | null,
  players: readonly GamePlayer[],
  dt: number,
  rng: () => number = matchRandom,
): boolean {
  const now = actionClock();
  const run = _runs.get(player.id);
  if (run && run.cueAt === undefined) {
    if (run.until > now && run.until - now <= S.GO_S + 1e-9) return true;
    _runs.delete(player.id);
  }
  if (line === null || holder.team !== player.team || holder.id === player.id) return false;
  if (offBallIntentOf(player.id) !== 'make_run' || !onShoulder(player, line)) return false;
  if (Math.hypot(holder.x - player.x, holder.y - player.y) > S.HOLDER_RANGE_YD) return false;
  for (const o of players) {
    if (o.team !== holder.team && Math.hypot(o.x - holder.x, o.y - holder.y) <= S.HOLDER_FREE_YD) return false;
  }
  const ant = anticipationOf(player);
  let go = false;
  let early = false;
  const pending = _runs.get(player.id);
  if (holderDecision !== undefined && CUES.has(holderDecision)) {
    // The cue: he reads the ball coming, after his reaction.
    const cueAt = pending?.cueAt ?? now + S.REACT_S * (1 - ant);
    if (now >= cueAt) go = true;
    else _runs.set(player.id, { until: -Infinity, cueAt });
  } else {
    if (pending?.cueAt !== undefined) _runs.delete(player.id);
    if (rng() < S.EARLY_PER_S * (1 - ant) * dt) { go = true; early = true; }
  }
  if (!go) return false;
  _runs.set(player.id, { until: now + S.GO_S });
  gameBus.emit('shoulderRun', { playerId: player.id, team: player.team, early });
  debugLog('offside', `${player.name} goes on the shoulder${early ? ' (early)' : ''}`, { playerId: player.id });
  return true;
}

// Stage 19 (`live-modes.md`): the runs travel with a mid-match snapshot.
registerEngineMemory('shoulderRuns', mapPart(_runs));
