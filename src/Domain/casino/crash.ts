import { CASINO } from "@/Domain/casino/casinoConfig";

const C = CASINO.CRASH;

/** Crash point from a uniform draw: max(1, floor(100 × RTP / (1 − U)) / 100), capped at MAX_POINT. */
export function crashPoint(u: number): number {
  const raw = Math.floor((100 * C.RTP) / (1 - u)) / 100;
  return Math.min(C.MAX_POINT, Math.max(1, raw));
}

/** Multiplier shown `seconds` after the start (two decimals, never below 1). */
export function multiplierAt(seconds: number): number {
  return Math.max(1, Math.floor(100 * Math.exp(C.GROWTH * Math.max(0, seconds))) / 100);
}

/** Seconds until the multiplier reaches `m`. */
export function secondsTo(m: number): number {
  return Math.log(Math.max(1, m)) / C.GROWTH;
}

export function parseAutoCashOut(v: unknown): number | null | "invalid" {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < C.MIN_AUTO || n > C.MAX_POINT) return "invalid";
  return Math.floor(n * 100) / 100;
}

export type CrashOutcome = { won: true; multiplier: number } | { won: false };

/**
 * What a cash-out at `elapsed` seconds pays. The auto cash-out caps the multiplier (he leaves there even when the
 * request comes later); a win needs the multiplier strictly below the crash point.
 */
export function cashOutAt(elapsed: number, crash: number, auto: number | null): CrashOutcome {
  const m = auto !== null ? Math.min(multiplierAt(elapsed), auto) : multiplierAt(elapsed);
  return m < crash ? { won: true, multiplier: m } : { won: false };
}

/** Settling a round nobody cashed out: only the auto cash-out can win. */
export function settleUnclaimed(crash: number, auto: number | null): CrashOutcome {
  return auto !== null && auto < crash ? { won: true, multiplier: auto } : { won: false };
}
