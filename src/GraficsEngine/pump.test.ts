import { describe, expect, test } from "bun:test";
import { createPump, MAX_ELAPSED_SECONDS_PER_PUMP } from "@/GraficsEngine/pump";

/** A controllable fake clock in milliseconds, for deterministic pump tests. */
function fakeClock(startMs = 0) {
  let t = startMs;
  return {
    now: () => t,
    advance: (ms: number) => { t += ms; },
  };
}

describe("createPump", () => {
  test("two calls 16ms apart yield ~0.016s", () => {
    const { now, advance } = fakeClock();
    const pump = createPump(now);

    advance(16);
    const elapsed = pump(false);

    expect(elapsed).toBeCloseTo(0.016, 5);
  });

  test("a call right after creation yields ~0", () => {
    const { now } = fakeClock();
    const pump = createPump(now);

    expect(pump(false)).toBe(0);
  });

  test("caps a long gap at MAX_ELAPSED_SECONDS_PER_PUMP", () => {
    const { now, advance } = fakeClock();
    const pump = createPump(now);

    advance(10_000); // 10 real seconds
    expect(pump(false)).toBe(MAX_ELAPSED_SECONDS_PER_PUMP);
  });

  test("paused calls advance `last` and yield 0 — no backlog on resume", () => {
    const { now, advance } = fakeClock();
    const pump = createPump(now);

    advance(2000); // 2s pass while paused
    expect(pump(true)).toBe(0);

    // Only the time since the paused call should count now, not the 2s before it.
    advance(16);
    expect(pump(false)).toBeCloseTo(0.016, 5);
  });

  test("consecutive calls partition elapsed time without gaps or double counting", () => {
    const { now, advance } = fakeClock();
    const pump = createPump(now);

    advance(10);
    const a = pump(false);
    advance(6);
    const b = pump(false);

    expect(a + b).toBeCloseTo(0.016, 5);
  });

  test("interleaved fast (ticker-like) and slow (worker-like) callers never double count", () => {
    // Simulates the real PixiPitch usage: a ~60fps ticker and a ~10fps
    // worker pulse both calling the same pump instance.
    const { now, advance } = fakeClock();
    const pump = createPump(now);

    let total = 0;
    for (let i = 0; i < 6; i++) {
      advance(16); // "ticker frame"
      total += pump(false);
    }
    advance(4); // remainder up to a 100ms "worker pulse"
    total += pump(false);

    expect(total).toBeCloseTo(0.1, 5);
  });

  test("never returns a negative elapsed if the clock goes backwards", () => {
    const { now, advance } = fakeClock(1000);
    const pump = createPump(now);

    advance(-500); // clock skew
    expect(pump(false)).toBe(0);
  });
});
