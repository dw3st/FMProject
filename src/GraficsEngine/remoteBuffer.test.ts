import { describe, expect, test } from "bun:test";
import { bufferDelay, EMPTY_REMOTE_BUFFER, pairAt, pushBuffered, REMOTE_BUFFER, type RemoteBuffer } from "@/GraficsEngine/remoteBuffer";
import { remotePositions, toRemoteFrame } from "@/GraficsEngine/remoteInterp";

const fr = (x: number) => toRemoteFrame({ ball: [x, 0], players: [[1, x, 0]] }, 0);

/** Frames every `gap` sender ms from 0, arriving `lag` ms later plus a jitter per frame. */
function fill(n: number, gap: number, lag: number, jitter: (i: number) => number = () => 0): RemoteBuffer {
  let b = EMPTY_REMOTE_BUFFER;
  for (let i = 0; i < n; i++) b = pushBuffered(b, fr(i * 10), 1000 + i * gap, 5000 + i * gap + lag + jitter(i));
  return b;
}

const ballAt = (b: RemoteBuffer, now: number) => remotePositions(pairAt(b, now), now, REMOTE_BUFFER.STEP_MS, 1e9)!.ball.x;

describe("remote jitter buffer", () => {
  test("draws between two known frames, a fixed delay behind the newest", () => {
    const b = fill(10, 100, 30);
    expect(bufferDelay(b)).toBe(REMOTE_BUFFER.MIN_DELAY_MS);
    // The newest frame (x 90) arrived at 5000 + 900 + 30; 250 ms behind it the drawing sits between x 60 and x 70.
    const x = ballAt(b, 5930);
    expect(x).toBeGreaterThan(60);
    expect(x).toBeLessThan(70);
  });

  test("moves smoothly with real time even when frames arrive bunched", () => {
    const b = fill(12, 50, 40, (i) => (i % 3) * 40); // 4x: frames every 50 ms, arriving in bursts
    const xs = [0, 10, 20, 30, 40].map((d) => ballAt(b, 5560 + d));
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThan(xs[i - 1]!);
  });

  test("a late frame never moves the drawing backwards; out-of-order frames are ignored", () => {
    let b = fill(5, 100, 20);
    const before = b.frames.length;
    b = pushBuffered(b, fr(999), 1000 + 150, 6000);
    expect(b.frames.length).toBe(before);
    expect(ballAt(b, 9000)).toBe(40); // far past the newest: frozen on it
  });

  test("keeps the last MAX frames", () => {
    expect(fill(40, 100, 10).frames.length).toBe(REMOTE_BUFFER.MAX);
  });

  test("uneven arrivals make the delay longer, within its bounds", () => {
    const even = fill(16, 100, 30);
    const uneven = fill(16, 100, 30, (i) => (i % 2) * 180);
    expect(bufferDelay(uneven)).toBeGreaterThan(bufferDelay(even));
    expect(bufferDelay(uneven)).toBeLessThanOrEqual(REMOTE_BUFFER.MAX_DELAY_MS);
  });

  test("with uneven arrivals the drawing never runs out of frames (never stalls on the newest)", () => {
    const b = fill(16, 100, 30, (i) => ((i * 7) % 5) * 40);
    const newest = b.frames[b.frames.length - 1]!;
    // At every instant after the last arrival the target is still behind the newest frame's sender time.
    const now = 5000 + 15 * 100 + 30 + 160;
    expect(now - b.offset! - bufferDelay(b)).toBeLessThan(newest.at);
  });

  test("a pause of the sender freezes the drawing and resumes without inflating the delay", () => {
    let b = fill(8, 100, 30);
    const gapBefore = b.gap;
    const frozen = ballAt(b, 5000 + 700 + 30 + 5000);
    expect(frozen).toBe(70);
    // 20 s later the match goes on.
    b = pushBuffered(b, fr(80), 1000 + 800 + 20000, 5000 + 800 + 20000 + 30);
    b = pushBuffered(b, fr(90), 1000 + 900 + 20000, 5000 + 900 + 20000 + 30);
    expect(b.gap).toBeLessThanOrEqual(gapBefore);
    const x = ballAt(b, 5000 + 900 + 20000 + 30);
    expect(x).toBeGreaterThanOrEqual(70);
    expect(x).toBeLessThanOrEqual(90);
  });
});
