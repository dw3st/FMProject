/**
 * Throttle for the live match's React state (spec 2026-10-06-match-smooth-ball §2).
 *
 * The pitch emits `stateChanged` after every simulated frame (~60/s); re-rendering the whole match screen that
 * often costs frames. The screens keep a ref updated on every emission and hand the React state over at most
 * every `UI_STATE_INTERVAL_MS`, with a trailing delivery so the last state always arrives. A state that the
 * player must see at once (phase change, goal, paused match, a /test command) goes through immediately.
 */
import type { GameState } from "@/GameEngine/types";

export const UI_STATE_INTERVAL_MS = 100;

/** A change the screen must show at once: a new phase (overlays) or a new score (scoreboard, goal flash). */
export function isUrgentStateChange(
  prev: Pick<GameState, "matchPhase" | "score"> | null,
  next: Pick<GameState, "matchPhase" | "score">,
): boolean {
  if (!prev) return true;
  if (prev.matchPhase !== next.matchPhase) return true;
  const a = prev.score ?? { A: 0, B: 0 };
  const b = next.score ?? { A: 0, B: 0 };
  return a.A !== b.A || a.B !== b.B;
}

export interface UiStateThrottleOptions<T> {
  deliver: (value: T) => void;
  /** True when `next` must be delivered right away (compared to the last DELIVERED value). */
  isUrgent?: (lastDelivered: T | null, next: T) => boolean;
  intervalMs?: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface UiStateThrottle<T> {
  /** Offer a new value; `immediate` forces delivery now (paused match, state from a command). */
  push(value: T, immediate?: boolean): void;
  /** Deliver the pending value now, if any. */
  flush(): void;
  /** Drop the pending value and its timer (unmount). */
  cancel(): void;
}

export function createUiStateThrottle<T>(opts: UiStateThrottleOptions<T>): UiStateThrottle<T> {
  const interval = opts.intervalMs ?? UI_STATE_INTERVAL_MS;
  const now = opts.now ?? (() => performance.now());
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let lastAt = -Infinity;
  let lastDelivered: T | null = null;
  let pending: { value: T } | null = null;
  let timer: unknown = null;

  const stopTimer = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const deliverNow = (value: T) => {
    stopTimer();
    pending = null;
    lastAt = now();
    lastDelivered = value;
    opts.deliver(value);
  };

  return {
    push(value, immediate = false) {
      const t = now();
      if (immediate || t - lastAt >= interval || (opts.isUrgent?.(lastDelivered, value) ?? false)) {
        deliverNow(value);
        return;
      }
      pending = { value };
      if (timer === null) {
        timer = setTimer(() => {
          timer = null;
          if (pending) deliverNow(pending.value);
        }, Math.max(0, lastAt + interval - t));
      }
    },
    flush() {
      if (pending) deliverNow(pending.value);
    },
    cancel() {
      stopTimer();
      pending = null;
    },
  };
}
