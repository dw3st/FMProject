/**
 * createPump — the single source of "how much real time elapsed" shared by
 * the Pixi ticker (rAF — smooth, ~60fps, but frozen/throttled while the tab
 * is hidden) and simClock (a Worker pulse — coarser, ~10fps, but keeps
 * firing while hidden).
 *
 * Both callers invoke the SAME pump instance every time they fire. Because
 * elapsed time is measured from one shared `last` timestamp regardless of
 * which caller fires, there is no double-counting: whichever caller runs
 * first in a given real-time slice consumes that slice, and the other sees
 * ~0 elapsed until real time actually passes again. This is what makes it
 * safe to pump from both a 60fps loop and a 10fps loop at once — see
 * PixiPitch.tsx, which calls the same `pump()` at the top of every ticker
 * frame AND from every simClock pulse.
 *
 * `now` is injected so this is pure enough to unit test without touching
 * `performance.now()` or real timers.
 */

/** Real seconds — upper bound on the elapsed time a single pump call reports. */
export const MAX_ELAPSED_SECONDS_PER_PUMP = 5;

/**
 * Call on every render frame and every clock pulse. Returns the real
 * elapsed seconds since the previous call, capped at
 * `MAX_ELAPSED_SECONDS_PER_PUMP`, or `0` when `paused` is true.
 *
 * The internal `last` timestamp always advances — even while paused, and
 * even when a negative delta would otherwise result from clock skew — so
 * pausing (or a clock going briefly backwards) never builds a backlog that
 * fast-forwards the match once play resumes.
 */
export type Pump = (paused: boolean) => number;

export function createPump(now: () => number): Pump {
  let last = now();

  return (paused: boolean): number => {
    const current = now();
    const elapsed = Math.min(MAX_ELAPSED_SECONDS_PER_PUMP, Math.max(0, (current - last) / 1000));
    last = current;
    return paused ? 0 : elapsed;
  };
}

/** Default real-time clock: `performance.now()` when available, else `Date.now()`. */
export function defaultNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
