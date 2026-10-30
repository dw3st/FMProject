/**
 * Floating windows (friends panel, chats, the broadcast of a friend's match): where each one sits, its size and the
 * stacking order. Pure geometry plus a tiny store; position and size are kept per tab in `sessionStorage`, so every
 * game screen (a page of its own) puts the window back where it was.
 */

export interface FloatRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  w: number;
  h: number;
}

/** Edges a window is resized from: any combination of n/s and e/w. */
export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const FLOAT = {
  /** Kept clear for the top bar and the status bar (they sit above the windows). */
  TOP_INSET: 56,
  BOTTOM_INSET: 48,
  /** Below this width a window docks full width at the bottom and does not move. */
  NARROW_WIDTH: 640,
  /** Stacking: windows go from Z_BASE up, under the bars and the modals (z-50). */
  Z_BASE: 40,
  Z_MAX: 49,
  STORAGE_PREFIX: "fm.window.",
} as const;

const clampNum = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function isNarrow(viewport: Size): boolean {
  return viewport.w < FLOAT.NARROW_WIDTH;
}

/** The area a window may use (between the bars). */
function area(viewport: Size): { top: number; bottom: number; w: number; h: number } {
  const top = FLOAT.TOP_INSET;
  const bottom = Math.max(top + 120, viewport.h - FLOAT.BOTTOM_INSET);
  return { top, bottom, w: viewport.w, h: bottom - top };
}

/**
 * Keeps the whole window inside the area between the bars: the size within `min`..`max` (and the area), then the
 * position so no edge is outside.
 */
export function clampRect(rect: FloatRect, viewport: Size, min: Size, max?: Size): FloatRect {
  const a = area(viewport);
  const maxW = Math.max(120, Math.min(max?.w ?? Infinity, a.w));
  const maxH = Math.max(120, Math.min(max?.h ?? Infinity, a.h));
  const w = Math.round(clampNum(rect.w, Math.min(min.w, maxW), maxW));
  const h = Math.round(clampNum(rect.h, Math.min(min.h, maxH), maxH));
  const x = Math.round(clampNum(rect.x, 0, Math.max(0, a.w - w)));
  const y = Math.round(clampNum(rect.y, a.top, Math.max(a.top, a.bottom - h)));
  return { x, y, w, h };
}

/** Dragged by `dx`, `dy` from where the drag started. */
export function moveRect(start: FloatRect, dx: number, dy: number, viewport: Size, min: Size, max?: Size): FloatRect {
  return clampRect({ ...start, x: start.x + dx, y: start.y + dy }, viewport, min, max);
}

/**
 * Resized from `edge` by `dx`, `dy` from where the drag started. The opposite edge stays put, the size never goes
 * under `min` nor over `max`, and the window stays inside the area.
 */
export function resizeRect(
  start: FloatRect, edge: ResizeEdge, dx: number, dy: number, viewport: Size, min: Size, max?: Size,
): FloatRect {
  const a = area(viewport);
  const maxW = Math.min(max?.w ?? Infinity, a.w);
  const maxH = Math.min(max?.h ?? Infinity, a.h);
  let { x, y, w, h } = start;
  if (edge.includes("e")) w = clampNum(start.w + dx, min.w, Math.min(maxW, a.w - start.x));
  if (edge.includes("s")) h = clampNum(start.h + dy, min.h, Math.min(maxH, a.bottom - start.y));
  if (edge.includes("w")) {
    const right = start.x + start.w;
    w = clampNum(start.w - dx, min.w, Math.min(maxW, right));
    x = right - w;
  }
  if (edge.includes("n")) {
    const bottom = start.y + start.h;
    h = clampNum(start.h - dy, min.h, Math.min(maxH, bottom - a.top));
    y = bottom - h;
  }
  return clampRect({ x, y, w, h }, viewport, min, max);
}

/** Narrow screens: full width, at the bottom, at most `h` tall. */
export function dockedRect(viewport: Size, h: number): FloatRect {
  const a = area(viewport);
  const height = Math.min(h, a.h);
  return { x: 0, y: a.bottom - height, w: viewport.w, h: height };
}

export function parseRect(raw: string | null | undefined): FloatRect | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<FloatRect> | null;
    if (!v || typeof v !== "object") return null;
    const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
    if (!ok(v.x) || !ok(v.y) || !ok(v.w) || !ok(v.h) || v.w <= 0 || v.h <= 0) return null;
    return { x: v.x, y: v.y, w: v.w, h: v.h };
  } catch {
    return null;
  }
}

export function readRect(id: string): FloatRect | null {
  try {
    return parseRect(globalThis.sessionStorage?.getItem(FLOAT.STORAGE_PREFIX + id));
  } catch {
    return null;
  }
}

export function writeRect(id: string, rect: FloatRect): void {
  try {
    globalThis.sessionStorage?.setItem(FLOAT.STORAGE_PREFIX + id, JSON.stringify(rect));
  } catch {
    // storage off: the window just opens at its default spot next time
  }
}

/** Stacking order, bottom first: the window last focused is on top. */
let order: string[] = [];
const listeners = new Set<() => void>();

export function subscribeStack(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Order after `id` is brought to the front (pure). */
export function frontOf(stack: readonly string[], id: string): string[] {
  return [...stack.filter((s) => s !== id), id];
}

export function bringToFront(id: string): void {
  if (order[order.length - 1] === id) return;
  order = frontOf(order, id);
  for (const fn of listeners) fn();
}

export function dropFromStack(id: string): void {
  if (!order.includes(id)) return;
  order = order.filter((s) => s !== id);
  for (const fn of listeners) fn();
}

/** z-index of a window: its place in the stack, within Z_BASE..Z_MAX. */
export function zIndexOf(stack: readonly string[], id: string): number {
  const i = stack.indexOf(id);
  const fromTop = i < 0 ? stack.length : stack.length - 1 - i;
  return Math.max(FLOAT.Z_BASE, FLOAT.Z_MAX - fromTop);
}

export function stackSnapshot(): readonly string[] {
  return order;
}
