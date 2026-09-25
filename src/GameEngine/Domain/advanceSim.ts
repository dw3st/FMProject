/**
 * advanceSim — pure batch driver for the simulation clock.
 *
 * Section 3 of docs/superpowers/specs/2026-09-25-match-live-controls-design.md
 * ("Partida em segundo plano"): the simulation must keep advancing even when
 * the tab is backgrounded (requestAnimationFrame is frozen by the browser in
 * that case). PixiPitch pumps this function once per render frame (while
 * visible) or once per simClock Worker pulse (while hidden) to turn
 * "N real seconds elapsed × gameSpeed" into game-time progress.
 *
 * `advanceSim` runs `tickState` in WHOLE fixed steps of `step` game-seconds
 * (default 1/60s) — never a partial step — so gameplay feel stays identical
 * regardless of how often or how irregularly the caller pumps. A naive
 * "feed whatever elapsed time is left" approach would call `tickState` with
 * a different `dt` on every pump (e.g. a slightly-late frame), which is
 * exactly the frame-rate-dependent behavior the fixed step is meant to
 * eliminate.
 *
 * Because callers rarely pump in exact multiples of `step`, `advanceSim`
 * takes a `carry` — the leftover game-time (always `< step`) from the
 * previous call — adds it to `gameSeconds`, runs as many whole `step`s as
 * that total allows, and returns the new remainder as the result's `carry`.
 * The caller threads `carry` back in on the next call:
 *
 *   let carry = 0;
 *   function onPump(elapsedRealSeconds: number) {
 *     const result = advanceSim(state, elapsedRealSeconds * gameSpeed, carry);
 *     state = result.state;
 *     carry = result.carry;
 *   }
 *
 * It stops early — discarding whatever whole steps were still left to run —
 * the moment a step scores a goal (`goalScored !== null`) or changes
 * `matchPhase`, resetting `carry` to 0 in that case. This is NOT what makes
 * goal/half-time/full-time presentation pauses work — `tickState` already
 * owns that entirely on its own (its `presentationCountdown` / `setPiece`
 * countdown gating means further `tickState(dt)` calls are simply no-ops
 * until the countdown drains, whether or not `advanceSim` keeps calling it).
 * Stopping early here is a safety/bookkeeping measure: it keeps a single
 * `advanceSim` call from silently blasting through several discrete match
 * moments in one go (e.g. a goal AND the following kickoff AND a second
 * goal, all within one 4x/backgrounded-tab batch), which would otherwise
 * emit a burst of events in one synchronous call and make each one much
 * harder to reason about or debug.
 */

import type { GameState } from "@/GameEngine/types";
import { tickState, type TickResult } from "@/GameEngine/Domain/gameState";

/** Fixed step size, in game-seconds. */
export const SIM_STEP = 1 / 60;

export type AdvanceSimStopReason = "goal" | "phase";

export interface AdvanceSimResult {
  state: GameState;
  /**
   * Leftover game-seconds (always in `[0, step)`) that didn't amount to a
   * whole step — feed this back in as `carry` on the next call. Always `0`
   * when `stoppedBy` is set.
   */
  carry: number;
  /** Present only when the batch stopped early — why it stopped. */
  stoppedBy?: AdvanceSimStopReason;
}

/** Matches `tickState`'s signature — injectable only for tests. */
type TickFn = (state: GameState, dt: number) => TickResult;

/**
 * Advance `state` by `carry + gameSeconds` of game time, in WHOLE fixed
 * steps of `step` game-seconds — never a partial step. Pure with respect to
 * its own inputs/outputs — `tick` (defaults to `tickState`) may still emit
 * on the shared gameBus, exactly as a normal `tickState` call does.
 *
 * Returns the same `state` reference (no new object) when zero whole steps
 * ran — callers can use that to skip re-emitting/re-rendering.
 */
export function advanceSim(
  state: GameState,
  gameSeconds: number,
  carry: number = 0,
  step: number = SIM_STEP,
  tick: TickFn = tickState,
): AdvanceSimResult {
  let total = carry + gameSeconds;
  if (total <= 0) {
    return { state, carry: Math.max(0, total) };
  }

  let current = state;

  // Epsilon guard against floating-point residue (summing many 1/60 steps
  // can leave `total` sitting a hair below a step boundary it should have
  // reached, e.g. 0.016666666666666663 instead of 1/60).
  const EPS = 1e-9;

  while (total + EPS >= step) {
    const phaseBefore = current.matchPhase;

    const { state: next, goalScored } = tick(current, step);
    current = next;
    total -= step;

    if (goalScored !== null) {
      return { state: current, carry: 0, stoppedBy: "goal" };
    }
    if (current.matchPhase !== phaseBefore) {
      return { state: current, carry: 0, stoppedBy: "phase" };
    }
  }

  return { state: current, carry: Math.max(0, total) };
}
