/**
 * simClock — pulses the match simulation independently of requestAnimationFrame.
 *
 * Section 3 of docs/superpowers/specs/2026-09-25-match-live-controls-design.md
 * ("Partida em segundo plano"): `PixiPitch` used to advance `tickState` from
 * inside `app.ticker` (rAF). Browsers throttle/freeze rAF once the tab is
 * hidden, so a backgrounded match used to simply stop. `Worker` timers are
 * NOT subject to that throttling, so this module runs a `setInterval` inside
 * a Worker (created from an inline Blob — no separate build artifact needed)
 * and calls `onPulse` on every message.
 *
 * `onPulse` receives the real elapsed seconds since the previous pulse,
 * already capped at `MAX_ELAPSED_SECONDS_PER_PULSE` so a long stall (laptop
 * sleep, a discarded/frozen tab restored, a huge GC pause) can't fast-forward
 * the match by minutes in one go. The caller is responsible for multiplying
 * by game speed, checking whether the match is paused, and driving
 * `advanceSim` — this module only owns the clock.
 *
 * Falls back to a plain main-thread `setInterval` when `Worker` isn't
 * available (older browsers, restricted embeds, non-browser test runners).
 * That fallback IS still subject to background-tab throttling, but it's
 * strictly no worse than the old rAF-driven behaviour it replaces.
 */

/** Target real-ms between pulses. */
export const SIM_CLOCK_PULSE_MS = 100;

/**
 * Upper bound, in real seconds, on the elapsed time reported for a single
 * pulse. Protects against fast-forwarding the match after a long stall.
 */
export const MAX_ELAPSED_SECONDS_PER_PULSE = 5;

export interface SimClockHandle {
  /** Stops the clock and releases the Worker/interval. Safe to call more than once. */
  destroy(): void;
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** The Worker's entire program: pulse a message every SIM_CLOCK_PULSE_MS. */
function workerSource(): string {
  return `setInterval(() => { postMessage(0); }, ${SIM_CLOCK_PULSE_MS});`;
}

function workerAvailable(): boolean {
  return (
    typeof Worker !== "undefined" &&
    typeof Blob !== "undefined" &&
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function"
  );
}

/**
 * Starts the clock. `onPulse(elapsedRealSeconds)` fires roughly every
 * `SIM_CLOCK_PULSE_MS`, with `elapsedRealSeconds` clamped to
 * `[0, MAX_ELAPSED_SECONDS_PER_PULSE]`.
 *
 * The elapsed-time bookkeeping (`last` pulse timestamp) always advances,
 * even if the caller's `onPulse` chooses not to act on a given pulse (e.g.
 * because the match is paused) — so pausing never causes a backlog that
 * fast-forwards the match once resumed.
 */
export function startSimClock(onPulse: (elapsedRealSeconds: number) => void): SimClockHandle {
  let last = nowMs();

  const pulse = () => {
    const current = nowMs();
    const elapsed = Math.min(MAX_ELAPSED_SECONDS_PER_PULSE, Math.max(0, (current - last) / 1000));
    last = current;
    onPulse(elapsed);
  };

  if (workerAvailable()) {
    try {
      const blob = new Blob([workerSource()], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url);
      worker.onmessage = pulse;
      return {
        destroy: () => {
          worker.onmessage = null;
          worker.terminate();
          URL.revokeObjectURL(url);
        },
      };
    } catch {
      // Worker construction can still throw at runtime (e.g. a CSP blocking
      // blob: workers) even though the constructor exists — fall through to
      // the main-thread interval below.
    }
  }

  // Fallback: main-thread interval (still throttled by hidden tabs, but no
  // worse than the previous rAF-driven behaviour).
  const intervalId = setInterval(pulse, SIM_CLOCK_PULSE_MS);
  return { destroy: () => clearInterval(intervalId) };
}
