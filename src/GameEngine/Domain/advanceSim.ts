/**
 * advanceSim — pure batch driver for the simulation clock.
 *
 * Section 3 of docs/superpowers/specs/2026-09-25-match-live-controls-design.md
 * ("Partida em segundo plano"): the simulation must keep advancing even when
 * the tab is backgrounded (requestAnimationFrame is frozen by the browser in
 * that case). `simClock.ts` drives the match from a Worker/interval pulse
 * instead of the Pixi ticker, and calls this function once per pulse to turn
 * "N real seconds elapsed × gameSpeed" into game-time progress.
 *
 * `advanceSim` runs `tickState` in fixed steps of `step` game-seconds
 * (default 1/60s) so gameplay feel stays identical regardless of how often
 * the caller pulses or what the real frame rate is — the old Pixi-ticker
 * loop fed the raw per-frame `dt` straight into `tickState`, which made the
 * simulation's "feel" depend on the render frame rate. Fixed steps decouple
 * the two.
 *
 * It stops early — discarding whatever of `gameSeconds` is left — the moment
 * a step scores a goal (`goalScored !== null`) or changes `matchPhase`. Both
 * of those are the exact moments `tickState` emits a presentation event
 * (`goalScored`, `halfTime`, `matchEnd`) that the UI reacts to by pausing /
 * showing an overlay. Without stopping the batch there, a single pulse at
 * 4x speed with a backgrounded tab (elapsed capped at 5s → up to 20 game
 * seconds → 1200 fixed steps) could blast straight through a goal
 * celebration, half-time, and deep into the next half before the UI ever
 * sees the intermediate state. Stopping at the boundary means the very next
 * pulse (at most `PULSE_INTERVAL` real-ms later) will resume from exactly
 * that point, so presentation pauses behave the same as they did on the old
 * per-frame ticker.
 */

import type { GameState } from "@/GameEngine/types";
import { tickState, type TickResult } from "@/GameEngine/Domain/gameState";

/** Default fixed step size, in game-seconds. Matches the spec's SIM_STEP. */
export const SIM_STEP = 1 / 60;

export type AdvanceSimStopReason = "goal" | "phase";

export interface AdvanceSimResult {
  state: GameState;
  /** True when the full `gameSeconds` requested was consumed (no early stop). */
  consumedAll: boolean;
  /** Present only when the batch stopped early — why it stopped. */
  stoppedBy?: AdvanceSimStopReason;
}

/** Matches `tickState`'s signature — injectable only for tests. */
type TickFn = (state: GameState, dt: number) => TickResult;

/**
 * Advance `state` by `gameSeconds` of game time, in fixed steps of `step`
 * game-seconds. Pure with respect to its own inputs/outputs — `tick`
 * (defaults to `tickState`) may still emit on the shared gameBus, exactly as
 * a normal `tickState` call does.
 *
 * `gameSeconds <= 0` is a no-op: returns `state` unchanged with
 * `consumedAll: true`.
 */
export function advanceSim(
  state: GameState,
  gameSeconds: number,
  step: number = SIM_STEP,
  tick: TickFn = tickState,
): AdvanceSimResult {
  if (gameSeconds <= 0) {
    return { state, consumedAll: true };
  }

  let current = state;
  let remaining = gameSeconds;

  // Epsilon guard against floating-point residue (summing many 1/60 steps
  // can leave a remainder like 1e-14 that would otherwise trigger one more
  // near-zero-dt tick).
  const EPS = 1e-9;

  while (remaining > EPS) {
    const dt = Math.min(step, remaining);
    const phaseBefore = current.matchPhase;

    const { state: next, goalScored } = tick(current, dt);
    current = next;
    remaining -= dt;

    if (goalScored !== null) {
      return { state: current, consumedAll: false, stoppedBy: "goal" };
    }
    if (current.matchPhase !== phaseBefore) {
      return { state: current, consumedAll: false, stoppedBy: "phase" };
    }
  }

  return { state: current, consumedAll: true };
}
