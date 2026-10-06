import { describe, expect, test } from "bun:test";
import { createUiStateThrottle, isUrgentStateChange, UI_STATE_INTERVAL_MS } from "@/GameInterface/uiStateThrottle";

function harness(isUrgent?: (prev: number | null, next: number) => boolean) {
  let clock = 0;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  let nextId = 1;
  const delivered: number[] = [];
  const th = createUiStateThrottle<number>({
    deliver: (v) => delivered.push(v),
    isUrgent,
    now: () => clock,
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.push({ at: clock + ms, fn, id });
      return id;
    },
    clearTimer: (h) => {
      const i = timers.findIndex((x) => x.id === h);
      if (i >= 0) timers.splice(i, 1);
    },
  });
  const advance = (ms: number) => {
    clock += ms;
    for (const tm of [...timers].sort((a, b) => a.at - b.at)) {
      if (tm.at <= clock) {
        timers.splice(timers.indexOf(tm), 1);
        tm.fn();
      }
    }
  };
  return { th, delivered, advance, timers };
}

describe("createUiStateThrottle", () => {
  test("delivers the first, holds the next ones, and the trailing delivers the last", () => {
    const { th, delivered, advance } = harness();
    th.push(1);
    expect(delivered).toEqual([1]);
    advance(16); th.push(2);
    advance(16); th.push(3);
    advance(16); th.push(4);
    expect(delivered).toEqual([1]);
    advance(UI_STATE_INTERVAL_MS);
    expect(delivered).toEqual([1, 4]);
  });

  test("the trailing fires at lastAt + interval, not interval after the push", () => {
    const { th, delivered, advance, timers } = harness();
    th.push(1); // delivered at t = 0
    advance(60);
    th.push(2); // t = 60: waits 40 ms (100 − 60)
    expect(timers).toHaveLength(1);
    expect(timers[0]!.at).toBe(UI_STATE_INTERVAL_MS);
    advance(39);
    expect(delivered).toEqual([1]);
    advance(1);
    expect(delivered).toEqual([1, 2]);
  });

  test("a push after the interval is delivered at once", () => {
    const { th, delivered, advance, timers } = harness();
    th.push(1);
    advance(UI_STATE_INTERVAL_MS);
    th.push(2);
    expect(delivered).toEqual([1, 2]);
    expect(timers).toHaveLength(0);
  });

  test("immediate and urgent values skip the wait and cancel the trailing", () => {
    const { th, delivered, advance, timers } = harness((prev, next) => prev !== null && next >= 100);
    th.push(1);
    advance(10); th.push(2);
    expect(timers).toHaveLength(1);
    advance(10); th.push(3, true);
    expect(delivered).toEqual([1, 3]);
    expect(timers).toHaveLength(0);
    advance(10); th.push(100);
    expect(delivered).toEqual([1, 3, 100]);
    advance(500);
    expect(delivered).toEqual([1, 3, 100]);
  });

  test("flush delivers the pending value; cancel drops it", () => {
    const { th, delivered, advance } = harness();
    th.push(1);
    advance(5); th.push(2);
    th.flush();
    expect(delivered).toEqual([1, 2]);
    advance(5); th.push(3);
    th.cancel();
    advance(500);
    expect(delivered).toEqual([1, 2]);
  });
});

describe("isUrgentStateChange", () => {
  const s = (matchPhase: string, A: number, B: number) => ({ matchPhase, score: { A, B } }) as never;
  test("phase or score change is urgent; nothing else is", () => {
    expect(isUrgentStateChange(null, s("firstHalf", 0, 0))).toBe(true);
    expect(isUrgentStateChange(s("firstHalf", 0, 0), s("firstHalf", 0, 0))).toBe(false);
    expect(isUrgentStateChange(s("firstHalf", 0, 0), s("halfTime", 0, 0))).toBe(true);
    expect(isUrgentStateChange(s("firstHalf", 0, 0), s("firstHalf", 1, 0))).toBe(true);
  });
});
