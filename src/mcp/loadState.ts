/**
 * loadState — read a debug snapshot JSON and return the complete GameState.
 *
 * Snapshots are produced by TestScreen → POST /api/debug/snapshot. They embed
 * the full live state under `rawState`, which is already a valid GameState
 * (full GamePlayer objects with runtimeStats, baseStats, energy, decisionMemory).
 *
 * The top-level snapshot also carries `defensiveScores` and `offBallScores`
 * per player (captured from gameBus events) — these are stored on the snapshot's
 * `players[]` array, NOT inside rawState.players[]. We expose them as a side-map
 * so queries can show "what the engine emitted last time it ran" alongside
 * "what it computes now".
 */

import type { GamePlayer, GameState, TeamId } from '@/GameEngine/types';

export interface StoredScores {
  defensiveScores: unknown | null;
  offBallScores:   unknown | null;
}

export interface LoadedSnapshot {
  state: GameState;
  /** Per-player stored debug scores from the top-level snapshot, indexed by player ID. */
  storedScores: Map<number, StoredScores>;
  timestamp: string;
}

interface RawSnapshotShape {
  timestamp?: string;
  rawState?: GameState;
  players?: Array<{ id?: number; defensiveScores?: unknown; offBallScores?: unknown }>;
}

export async function loadSnapshot(path: string): Promise<LoadedSnapshot> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`snapshot not found: ${path}`);
  }
  const data = await file.json() as RawSnapshotShape;
  if (!data.rawState || !Array.isArray(data.rawState.players)) {
    throw new Error(`snapshot at ${path} is missing rawState.players — not a valid debug snapshot`);
  }

  const storedScores = new Map<number, StoredScores>();
  if (Array.isArray(data.players)) {
    for (const p of data.players) {
      if (p.id == null) continue;
      storedScores.set(p.id, {
        defensiveScores: p.defensiveScores ?? null,
        offBallScores:   p.offBallScores   ?? null,
      });
    }
  }

  return {
    state:        data.rawState,
    storedScores,
    timestamp:    data.timestamp ?? '',
  };
}

export function getPlayer(state: GameState, playerId: number): GamePlayer {
  const p = state.players.find(p => p.id === playerId);
  if (!p) {
    const ids = state.players.map(p => `${p.id}=${p.name}`).join(', ');
    throw new Error(`player ${playerId} not found. Available: ${ids}`);
  }
  return p;
}

export function getBallHolder(state: GameState): GamePlayer {
  if (state.ballHolderId == null) {
    throw new Error('no ball holder in state (ball is in flight or no possession)');
  }
  return getPlayer(state, state.ballHolderId);
}

export function teammates(state: GameState, team: TeamId, exceptId?: number): GamePlayer[] {
  return state.players.filter(p => p.team === team && p.id !== exceptId);
}

export function opponents(state: GameState, team: TeamId): GamePlayer[] {
  return state.players.filter(p => p.team !== team);
}
