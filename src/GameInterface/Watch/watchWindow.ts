/**
 * The broadcast window of a friend's match: which match is open, per tab (`sessionStorage`), so every game screen
 * (a page of its own) opens it again and reconnects. A tiny store the button and the host share.
 */
export interface WatchTarget {
  saveId: string;
  seatId: string;
  /** Opened by itself on the dashboard (`autoWatch.ts`): the corner window, and closing it hides that match for the day. */
  auto?: { day: string };
}

export const WATCH_WINDOW_KEY = "fm.watch.window.v1";
const ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;

export function parseWatchTarget(raw: string | null | undefined): WatchTarget | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<WatchTarget> | null;
    if (!v || typeof v.saveId !== "string" || typeof v.seatId !== "string") return null;
    if (!ID_RE.test(v.saveId) || !ID_RE.test(v.seatId)) return null;
    const day = v.auto && typeof v.auto.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.auto.day) ? v.auto.day : null;
    return { saveId: v.saveId, seatId: v.seatId, ...(day ? { auto: { day } } : {}) };
  } catch {
    return null;
  }
}

let current: WatchTarget | null | undefined;
const listeners = new Set<() => void>();

export function watchTarget(): WatchTarget | null {
  if (current === undefined) {
    try {
      current = parseWatchTarget(globalThis.sessionStorage?.getItem(WATCH_WINDOW_KEY));
    } catch {
      current = null;
    }
  }
  return current;
}

export function subscribeWatchTarget(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setWatchTarget(target: WatchTarget | null): void {
  current = target;
  try {
    if (target) globalThis.sessionStorage?.setItem(WATCH_WINDOW_KEY, JSON.stringify(target));
    else globalThis.sessionStorage?.removeItem(WATCH_WINDOW_KEY);
  } catch {
    // storage off: the window just does not come back on the next screen
  }
  for (const fn of listeners) fn();
}
