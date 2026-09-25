/**
 * reconcileMatchStateSync — guards PixiPitch's internal simulation state
 * against rewinding when React (MatchScreen) echoes a `matchStateSync`
 * snapshot back at it.
 *
 * MatchScreen listens to `stateChanged`, stores it in React state, and a
 * `useEffect(() => { gameBus.emit("matchStateSync", gameState); }, [gameState])`
 * re-emits that same snapshot back onto the bus so PixiPitch can pick up
 * UI-driven edits (queuing a substitution, changing formation — both only
 * ever happen while the match is paused, from the substitution panel). That
 * effect fires on EVERY `gameState` change, including the routine ones that
 * merely mirror what PixiPitch itself just emitted — and because it goes
 * through a React render + effect round-trip, by the time it comes back
 * PixiPitch's own `stateRef.current` has typically already advanced further
 * (the render loop pumps far more often than a React round-trip completes).
 *
 * Blindly replacing `stateRef.current` with that echoed snapshot would
 * rewind matchTime, player positions, score, decisions — anything the
 * simulation itself owns — back to an earlier point, and resuming ticks from
 * there re-runs (and re-emits events for) match moments Statistics already
 * counted once. This function is the fix: only adopt the incoming snapshot
 * outright when it is not behind the current state; otherwise keep the
 * current simulation state and merge in only the fields the UI can actually
 * write.
 *
 * UI-owned fields (as of this writing — re-check MatchScreen.tsx's
 * `setGameState` call sites if this list needs to grow):
 *   - `pendingSubsA` / `pendingSubsB` — appended by `handleQueueSub` when the
 *     substitution panel queues a sub.
 *   - `formationA` / `formationB` — replaced by `handleChangeFormation` via
 *     `changeFormation()`. Note `changeFormation` also touches per-player
 *     fields (role, slotIndex, basePosition, bounds, ballSupportScale,
 *     runtimeStats) for the changed team, but never their x/y or
 *     targetPosition — this function does not attempt a partial per-player
 *     merge because both UI-driven writes only ever happen while the match
 *     is paused, i.e. `matchTime` is frozen and the snapshot is never
 *     actually stale relative to `current` (the two clocks are equal), so
 *     the outright-adopt branch below already handles that case in full.
 *     The stale branch's field-level merge is a defensive backstop, not the
 *     primary path for those edits.
 */

import type { GameState, MatchPhase } from "@/GameEngine/types";

const PHASE_ORDER: Record<MatchPhase, number> = {
  preMatch: 0,
  firstHalf: 1,
  halfTime: 2,
  secondHalf: 3,
  matchEnd: 4,
};

/** True when `a` represents an earlier point in the match than `b`. */
function isBefore(a: GameState, b: GameState): boolean {
  const phaseA = PHASE_ORDER[a.matchPhase];
  const phaseB = PHASE_ORDER[b.matchPhase];
  if (phaseA !== phaseB) return phaseA < phaseB;
  return a.matchTime < b.matchTime;
}

/** Copies only the fields the UI can legitimately write onto `current`. */
function applyUiOwnedFields(current: GameState, incoming: GameState): GameState {
  return {
    ...current,
    pendingSubsA: incoming.pendingSubsA,
    pendingSubsB: incoming.pendingSubsB,
    formationA: incoming.formationA,
    formationB: incoming.formationB,
  };
}

/**
 * Reconciles an incoming `matchStateSync` snapshot against the simulation's
 * current state. Returns `incoming` unchanged when it is not behind
 * `current` (the common case: paused, or a snapshot that's somehow ahead —
 * which never legitimately happens but is handled the same, safe way).
 * Returns `current` with only the UI-owned fields copied from `incoming`
 * when `incoming` is stale (an earlier matchPhase, or the same phase with an
 * earlier matchTime).
 */
export function reconcileMatchStateSync(current: GameState, incoming: GameState): GameState {
  return isBefore(incoming, current) ? applyUiOwnedFields(current, incoming) : incoming;
}
