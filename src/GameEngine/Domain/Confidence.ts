/**
 * In-match confidence (FM-style decisions, phase 5; `.claude/rules/game-engine/decisions.md` → "In-match confidence").
 *
 * The mood the mental rolls read was fixed at kickoff (half morale, half recent form). With the `CONFIDENCE` flag a
 * goal, an assist, a keeper's save or a won duel lifts a player's confidence, a goal conceded or a lost duel lowers it;
 * the rolls read clamp(mood + confidence, −1, 1) (`effectiveMood`). No dice: it only moves which mood band a later roll
 * uses. Flag off = nothing is written, so a match is game-for-game identical to the engine without it.
 */
import { CONFIDENCE as C, DECISION_FLAGS } from '@/GameEngine/Configs/DecisionConfig';
import type { GamePlayer, PlayerMental, TeamId } from '@/GameEngine/types';
import { gameBus } from '@/GameEngine/Infrastructure/EventBus';
import { debugLog } from '@/GameEngine/Support/DebugLog';
import { clamp } from '@/Domain/math';

export type ConfidenceReason =
  | 'goal' | 'assist' | 'team_goal' | 'conceded' | 'keeper_conceded' | 'save'
  | 'tackle_won' | 'dispossessed' | 'dribble_won' | 'beaten';

/** The mood the rolls read: the kickoff mood plus the in-match confidence (absent = the kickoff mood). */
export function effectiveMood(m: Pick<PlayerMental, 'mood' | 'confidence'>): number {
  return m.confidence === undefined ? m.mood : clamp(m.mood + m.confidence, -1, 1);
}

/** Confidence after a delta, clamped to ±CAP. */
export function nextConfidence(current: number | undefined, delta: number): number {
  return clamp((current ?? 0) + delta, -C.CAP, C.CAP);
}

export interface ConfidenceChange {
  playerId: number;
  delta: number;
  reason: ConfidenceReason;
}

/**
 * Applies the changes to the players (players without a mental profile are skipped). Returns the same array when the
 * flag is off or nothing changes. Emits `confidence` for every player whose value moved.
 */
export function applyConfidence(players: GamePlayer[], changes: readonly ConfidenceChange[]): GamePlayer[] {
  if (!DECISION_FLAGS.CONFIDENCE || changes.length === 0) return players;
  const byId = new Map<number, ConfidenceChange[]>();
  for (const c of changes) {
    if (c.delta === 0) continue;
    const list = byId.get(c.playerId);
    if (list) list.push(c); else byId.set(c.playerId, [c]);
  }
  if (byId.size === 0) return players;
  let changed = false;
  const out = players.map(p => {
    const list = byId.get(p.id);
    if (!list || !p.mental) return p;
    let value = p.mental.confidence ?? 0;
    for (const c of list) {
      const next = nextConfidence(value, c.delta);
      const applied = next - value;
      value = next;
      if (applied !== 0) {
        gameBus.emit('confidence', { playerId: p.id, team: p.team, delta: applied, value, reason: c.reason });
        if (Math.abs(applied) >= 0.1) debugLog('mind', `${p.name}: confidence ${applied > 0 ? '+' : ''}${applied.toFixed(2)} (${c.reason}) → ${value.toFixed(2)}`, { playerId: p.id });
      }
    }
    if (value === (p.mental.confidence ?? 0)) return p;
    changed = true;
    return { ...p, mental: { ...p.mental, confidence: value } };
  });
  return changed ? out : players;
}

/** A goal: the scorer, the assister, the rest of the scoring side, the conceding side and its keeper. */
export function goalConfidenceChanges(
  players: readonly GamePlayer[], team: TeamId, scorerId: number, assistId?: number,
): ConfidenceChange[] {
  const out: ConfidenceChange[] = [];
  for (const p of players) {
    if (p.team === team) {
      if (p.id === scorerId) out.push({ playerId: p.id, delta: C.GOAL, reason: 'goal' });
      else if (p.id === assistId) out.push({ playerId: p.id, delta: C.ASSIST, reason: 'assist' });
      else out.push({ playerId: p.id, delta: C.TEAM_GOAL, reason: 'team_goal' });
    } else {
      out.push({ playerId: p.id, delta: C.TEAM_CONCEDED, reason: 'conceded' });
      if (p.role === 'GK') out.push({ playerId: p.id, delta: C.KEEPER_CONCEDED, reason: 'keeper_conceded' });
    }
  }
  return out;
}

/** A goal on the state's players (no-op when the flag is off). */
export function withGoalConfidence(players: GamePlayer[], team: TeamId, scorerId: number, assistId?: number): GamePlayer[] {
  if (!DECISION_FLAGS.CONFIDENCE) return players;
  return applyConfidence(players, goalConfidenceChanges(players, team, scorerId, assistId));
}

/** A won duel: the winner up, the loser down. */
export function withDuelConfidence(
  players: GamePlayer[], winnerId: number, loserId: number, kind: 'tackle' | 'dribble',
): GamePlayer[] {
  if (!DECISION_FLAGS.CONFIDENCE) return players;
  return applyConfidence(players, kind === 'tackle'
    ? [{ playerId: winnerId, delta: C.TACKLE_WON, reason: 'tackle_won' }, { playerId: loserId, delta: C.DISPOSSESSED, reason: 'dispossessed' }]
    : [{ playerId: winnerId, delta: C.DRIBBLE_WON, reason: 'dribble_won' }, { playerId: loserId, delta: C.BEATEN, reason: 'beaten' }]);
}

/** A keeper's save. */
export function withSaveConfidence(players: GamePlayer[], keeperId: number): GamePlayer[] {
  if (!DECISION_FLAGS.CONFIDENCE) return players;
  return applyConfidence(players, [{ playerId: keeperId, delta: C.SAVE, reason: 'save' }]);
}
