/**
 * Jitter buffer for watching a friend's match (tester report: the broadcast lags, more at 2x / 4x). Frames carry the
 * sender's clock (`t`); the spectator keeps the last few and draws a fixed delay behind the newest, always between two
 * frames it already has, so a late or bunched frame never freezes the drawing. Pure.
 */
import { clamp } from "@/Domain/math";
import type { RemoteFrame, RemoteFrames } from "@/GraficsEngine/remoteInterp";

export const REMOTE_BUFFER = {
  /** Frames kept. */
  MAX: 16,
  /** Delay behind the newest frame, in average gaps between frames… */
  DELAY_GAPS: 1.6,
  /** …never below this (ms). */
  MIN_DELAY_MS: 120,
  /** The clock offset relaxes upward this much per frame (ms), so a drifting clock is followed. */
  OFFSET_RELAX_MS: 0.5,
  /** Step the pair is expressed in for `remotePositions` (ms): `last.at = now − fraction × STEP`. */
  STEP_MS: 1000,
} as const;

export interface RemoteBuffer {
  /** Frames by sender time, oldest first; `at` holds the sender time. */
  frames: RemoteFrame[];
  /** Local time minus sender time, the smallest seen (relaxed upward). */
  offset: number | null;
  /** Average gap between frames (sender ms). */
  gap: number;
}

export const EMPTY_REMOTE_BUFFER: RemoteBuffer = { frames: [], offset: null, gap: 200 };

/** Adds a frame sent at `sentAt` (sender clock) that arrived at `arrivedAt` (local clock). */
export function pushBuffered(buf: RemoteBuffer, frame: RemoteFrame, sentAt: number, arrivedAt: number): RemoteBuffer {
  const last = buf.frames[buf.frames.length - 1];
  if (last && sentAt <= last.at) return buf; // out of order or repeated
  const gap = last ? buf.gap * 0.8 + clamp(sentAt - last.at, 20, 1000) * 0.2 : buf.gap;
  const delay = arrivedAt - sentAt;
  const offset = buf.offset === null ? delay : Math.min(buf.offset + REMOTE_BUFFER.OFFSET_RELAX_MS, delay);
  const frames = [...buf.frames, { ...frame, at: sentAt }].slice(-REMOTE_BUFFER.MAX);
  return { frames, offset, gap };
}

/** How far behind the newest frame the drawing runs (ms). */
export function bufferDelay(buf: RemoteBuffer): number {
  return Math.max(REMOTE_BUFFER.MIN_DELAY_MS, buf.gap * REMOTE_BUFFER.DELAY_GAPS);
}

/**
 * The two frames to blend at local time `now`, as `remotePositions` reads them (`prev`, `last`, with `last.at` set so
 * that `(now − last.at) / STEP_MS` is the fraction between them). `seq` is the sender time of `last` (it changes
 * with the pair). Before two frames: the newest alone.
 */
export function pairAt(buf: RemoteBuffer, now: number): RemoteFrames {
  const f = buf.frames;
  if (f.length === 0 || buf.offset === null) return { prev: null, last: null, seq: 0 };
  if (f.length === 1) return { prev: null, last: { ...f[0]!, at: now }, seq: f[0]!.at };
  const target = now - buf.offset - bufferDelay(buf);
  let i = f.length - 2;
  while (i > 0 && f[i]!.at > target) i--;
  const a = f[i]!;
  const b = f[i + 1]!;
  const frac = clamp((target - a.at) / Math.max(1, b.at - a.at), 0, 1);
  return { prev: a, last: { ...b, at: now - frac * REMOTE_BUFFER.STEP_MS }, seq: b.at };
}
