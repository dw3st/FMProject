/**
 * The friend's match opening by itself on the dashboard (tester report; option B of the mock of 2026-11-05): with no
 * match of your own today and a friend playing live, his broadcast opens in the corner window. "Hide" keeps that match
 * closed for the day (per browser).
 */
import type { RivalRow } from "@/types/rivalsTypes";

export const AUTO_WATCH_HIDDEN_KEY = "fm.watch.autoHidden.v1";
const KEEP = 20;

const playing = (r: RivalRow) => !!r.live && (r.live.status === "live" || r.live.status === "half");

export const hiddenKey = (saveId: string, seatId: string, day: string) => `${saveId}:${seatId}:${day}`;

/** The friend whose match opens by itself, or null: none live, a match of your own today, or hidden. */
export function autoWatchSeat(rows: readonly RivalRow[], today: string, saveId: string, hidden: readonly string[]): string | null {
  const me = rows.find((r) => r.me);
  if (!me || me.live || me.next?.date === today) return null;
  const friend = rows.find((r) => !r.me && playing(r) && !hidden.includes(hiddenKey(saveId, r.seatId, today)));
  return friend?.seatId ?? null;
}

/** True while that friend is still playing (an auto window closes when his match ends). */
export function stillPlaying(rows: readonly RivalRow[], seatId: string): boolean {
  const r = rows.find((x) => x.seatId === seatId);
  return !!r && playing(r);
}

export function readHidden(): string[] {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(AUTO_WATCH_HIDDEN_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(-KEEP) : [];
  } catch {
    return [];
  }
}

export function hideAutoWatch(key: string): void {
  try {
    const list = readHidden().filter((k) => k !== key);
    globalThis.localStorage?.setItem(AUTO_WATCH_HIDDEN_KEY, JSON.stringify([...list, key].slice(-KEEP)));
  } catch {
    // no storage: it opens again on the next dashboard
  }
}
