/**
 * Real time handed back to the server between long CPU steps of a day (a full-engine match takes ~1.5 s, and the
 * day's other awaits resolve from the buffer as microtasks, so without this the server answers nothing for the whole
 * round). One macrotask is not enough: a request needs a turn per I/O step, so the day sleeps a short window in which
 * other requests run several steps. Changes no ordering or random draw.
 */
export const DAY_YIELD_MS = Number(process.env.DAY_YIELD_MS ?? 60);

export function yieldToEventLoop(ms = DAY_YIELD_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
