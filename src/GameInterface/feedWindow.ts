/**
 * Floating window of the live match events (#148): open/closed and where the user left it, kept per
 * viewer in `localStorage` (a convenience: absent or blocked storage = closed, default spot).
 */
export interface FeedWindowState {
  open: boolean;
  /** Top-left corner, px from the viewport's top-left. */
  x: number;
  y: number;
}

export const FEED_WINDOW_KEY = "fm.match.feedWindow";
export const FEED_WINDOW_SIZE = { w: 320, h: 360 } as const;
/** How much of the window must stay inside the viewport when it is dragged or the page shrinks. */
const KEEP_VISIBLE = 48;

export const DEFAULT_FEED_WINDOW: FeedWindowState = { open: false, x: 24, y: 160 };

/** Keeps the window's header reachable: never above the top, at least KEEP_VISIBLE px inside. */
export function clampFeedWindow(
  pos: { x: number; y: number },
  viewport: { w: number; h: number },
  size: { w: number; h: number } = FEED_WINDOW_SIZE,
): { x: number; y: number } {
  const minX = KEEP_VISIBLE - size.w;
  const maxX = Math.max(minX, viewport.w - KEEP_VISIBLE);
  const maxY = Math.max(0, viewport.h - KEEP_VISIBLE);
  return {
    x: Math.round(Math.min(maxX, Math.max(minX, pos.x))),
    y: Math.round(Math.min(maxY, Math.max(0, pos.y))),
  };
}

/** Parses a stored value; anything malformed falls back to the default. */
export function parseFeedWindow(raw: string | null | undefined): FeedWindowState {
  if (!raw) return { ...DEFAULT_FEED_WINDOW };
  try {
    const v = JSON.parse(raw) as Partial<FeedWindowState>;
    const num = (n: unknown, d: number) => (typeof n === "number" && Number.isFinite(n) ? n : d);
    return { open: v.open === true, x: num(v.x, DEFAULT_FEED_WINDOW.x), y: num(v.y, DEFAULT_FEED_WINDOW.y) };
  } catch {
    return { ...DEFAULT_FEED_WINDOW };
  }
}

export function readFeedWindow(): FeedWindowState {
  try {
    return parseFeedWindow(globalThis.localStorage?.getItem(FEED_WINDOW_KEY));
  } catch {
    return { ...DEFAULT_FEED_WINDOW };
  }
}

export function writeFeedWindow(s: FeedWindowState): void {
  try {
    globalThis.localStorage?.setItem(FEED_WINDOW_KEY, JSON.stringify(s));
  } catch {
    // Private window / blocked storage: the choice just isn't remembered.
  }
}
