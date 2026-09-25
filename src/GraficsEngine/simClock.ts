/**
 * simClock — pulses `onPulse` independently of requestAnimationFrame.
 *
 * Section 3 of docs/superpowers/specs/2026-09-25-match-live-controls-design.md
 * ("Partida em segundo plano"): `PixiPitch` used to advance `tickState` only
 * from inside `app.ticker` (rAF). Browsers throttle/freeze rAF once the tab
 * is hidden, so a backgrounded match used to simply stop. `Worker` timers
 * are NOT subject to that throttling, so this module runs a `setInterval`
 * inside a Worker (created from an inline Blob — no separate build artifact
 * needed) and calls `onPulse` on every message.
 *
 * This module owns ONLY the "when to pulse" clock — no elapsed-time
 * bookkeeping. That logic lives in `pump.ts`'s `createPump`, which is shared
 * with the Pixi ticker (see PixiPitch.tsx): both the ticker (every rendered
 * frame, smooth while visible) and this clock (every ~100ms, keeps firing
 * while hidden) call the SAME pump instance, so there's no double-counting
 * of elapsed time between the two.
 *
 * Falls back to a plain main-thread `setInterval` when `Worker` isn't
 * available (older browsers, restricted embeds, non-browser test runners).
 * That fallback IS still subject to background-tab throttling, but it's
 * strictly no worse than the old rAF-driven behaviour it replaces.
 */

/** Target real-ms between pulses. */
export const SIM_CLOCK_PULSE_MS = 100;

export interface SimClockHandle {
  /** Stops the clock and releases the Worker/interval. Safe to call more than once. */
  destroy(): void;
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
 * Starts the clock. `onPulse()` fires with no arguments roughly every
 * `SIM_CLOCK_PULSE_MS` real-ms — callers that need elapsed time should pump
 * a shared `createPump` instance from `pump.ts` instead of tracking their
 * own timestamp here.
 */
export function startSimClock(onPulse: () => void): SimClockHandle {
  if (workerAvailable()) {
    try {
      const blob = new Blob([workerSource()], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url);
      worker.onmessage = () => onPulse();
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
  const intervalId = setInterval(onPulse, SIM_CLOCK_PULSE_MS);
  return { destroy: () => clearInterval(intervalId) };
}
