/**
 * Off-ball and defensive actions held by time (engine rebuild stage 15, `team-shape.md`; FM: the default positioning
 * is held 10–20 s, the short actions ~5 s). A clock of seconds of play the tick loop advances, and per player the short
 * action he is locked into. The default action (holding the shape / the space) has no lock: the intent hysteresis keeps it.
 */
import { TEAM_SHAPE as S } from '@/GameEngine/Configs/ShapeConfig';
import type { TeamId } from '@/GameEngine/types';
import { registerEngineMemory, mapPart } from '@/GameEngine/Support/EngineMemory';

let _clock = 0;
/** Seconds of play since the match began (live phases only). */
export function actionClock(): number { return _clock; }
export function advanceActionClock(dt: number): void { _clock += dt; }

interface Lock { intent: string; since: number; possession: TeamId }
const _locks = new Map<number, Lock>();

export function resetActionHold(): void { _clock = 0; _locks.clear(); }

/** The short action `playerId` is locked into, while the lock lasts and the same side has the ball. */
export function heldAction(playerId: number, possession: TeamId): string | undefined {
  const l = _locks.get(playerId);
  if (!l) return undefined;
  if (l.possession !== possession || _clock - l.since >= S.SHORT_HOLD_S || _clock < l.since) {
    _locks.delete(playerId);
    return undefined;
  }
  return l.intent;
}

/** Start (or keep) a lock when he takes a short action; a default action clears it. */
export function noteAction(playerId: number, intent: string, short: boolean, possession: TeamId): void {
  if (!short) { _locks.delete(playerId); return; }
  const l = _locks.get(playerId);
  if (l && l.intent === intent && l.possession === possession) return;
  _locks.set(playerId, { intent, since: _clock, possession });
}

/** How long (s) he has held his current short action; 0 = none. */
export function heldFor(playerId: number): number {
  const l = _locks.get(playerId);
  return l ? _clock - l.since : 0;
}

// Stage 19 (`live-modes.md`): the clock and the locks travel with a mid-match snapshot.
registerEngineMemory('actionHold.clock', { export: () => _clock, import: (v) => { _clock = v as number; } });
registerEngineMemory('actionHold.locks', mapPart(_locks));
