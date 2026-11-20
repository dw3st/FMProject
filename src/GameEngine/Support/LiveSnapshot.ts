/**
 * A mid-match snapshot ("retrato", engine rebuild stage 19, `live-modes.md`): everything a match needs to go on exactly
 * as it would have — the `GameState` (the RNG is in it, `GameState.rng`), the Statistics / PlayerRating counters, the
 * highlight layer (inside the stats snapshot) and the engine memory (`EngineMemory.ts`: per-team tactic configs,
 * decision caches). Plain data: it crosses to the highlights Worker and into the resume snapshot.
 *
 * `restoreLiveSnapshot` puts the counters and the memory in place and returns the state to tick from. The same
 * snapshot restored twice plays the same match (`LiveSnapshot.test.ts`).
 */
import type { GameState } from '@/GameEngine/types';
import { exportStatsState, importStatsState, type StatsSnapshot } from '@/GameEngine/Domain/Statistics';
import { exportRatings, importRatings } from '@/GameEngine/Domain/PlayerRating';
import { exportEngineMemory, importEngineMemory, type EngineMemory } from '@/GameEngine/Support/EngineMemory';
import { loadMatchRng } from '@/GameEngine/Infrastructure/MatchRng';

export interface LiveSnapshot {
  state: GameState;
  stats: StatsSnapshot;
  ratings: Array<[number, number]>;
  memory: EngineMemory;
}

/** The state as a snapshot carries it: the through-ball cell cache is rebuilt on the next tick. */
export function snapshotState(state: GameState): GameState {
  return state.throughBallCellsCache ? { ...state, throughBallCellsCache: null } : state;
}

/**
 * Takes the snapshot now (the counters and the memory as the last tick left them). The state is not copied: engine
 * states are never mutated, a tick returns a new one.
 */
export function captureLiveSnapshot(state: GameState): LiveSnapshot {
  return { state: snapshotState(state), stats: exportStatsState(), ratings: exportRatings(), memory: exportEngineMemory() };
}

/** Restores the counters, the memory and the generator; returns the state to tick from. */
export function restoreLiveSnapshot(snap: LiveSnapshot): GameState {
  importStatsState(snap.stats);
  importRatings(snap.ratings);
  importEngineMemory(snap.memory);
  if (snap.state.rng !== undefined) loadMatchRng(snap.state.rng);
  return snap.state;
}
