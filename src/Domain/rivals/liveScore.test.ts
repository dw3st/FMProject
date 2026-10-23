import { describe, expect, test } from "bun:test";
import { applyLiveFrame, isLiveScoreView, liveStatusAt, parseLiveFrame } from "@/Domain/rivals/liveScore";
import { RIVALS } from "@/Domain/rivals/rivalsConfig";
import type { LiveBase, LiveScoreFrame } from "@/types/rivalsTypes";

const BASE: LiveBase = {
  seatId: "a", nickname: "fabio", clubId: "c1", clubName: "Vasco", opponentId: "c2", opponentName: "Bahia",
  home: true, fixtureId: "f1", date: "2027-03-10",
};
const frame = (over: Partial<LiveScoreFrame>): LiveScoreFrame => ({
  saveId: "s1", fixtureId: "f1", phase: "start", minute: 0, score: { for: 0, against: 0 }, ...over,
});
const SCORERS = new Set(["Silva"]);

describe("parseLiveFrame", () => {
  test("a good frame", () => {
    expect(parseLiveFrame({ saveId: "s1", fixtureId: "f1", phase: "goal", minute: 12, score: { for: 1, against: 0 }, scorer: " Silva " }))
      .toEqual({ saveId: "s1", fixtureId: "f1", phase: "goal", minute: 12, score: { for: 1, against: 0 }, scorer: "Silva" });
  });
  test("refuses bad frames", () => {
    const ok = { saveId: "s1", fixtureId: "f1", phase: "goal", minute: 12, score: { for: 1, against: 0 } };
    expect(parseLiveFrame({ ...ok, phase: "corner" })).toBeNull();
    expect(parseLiveFrame({ ...ok, minute: 131 })).toBeNull();
    expect(parseLiveFrame({ ...ok, minute: 1.5 })).toBeNull();
    expect(parseLiveFrame({ ...ok, score: { for: -1, against: 0 } })).toBeNull();
    expect(parseLiveFrame({ ...ok, saveId: "a b" })).toBeNull();
    expect(parseLiveFrame({ ...ok, fixtureId: "" })).toBeNull();
  });
});

describe("applyLiveFrame", () => {
  test("start, goal with a known scorer, half, end", () => {
    const s = applyLiveFrame(null, frame({}), BASE, SCORERS, 1)!;
    expect(s).toMatchObject({ status: "live", minute: 0, score: { for: 0, against: 0 }, events: 1, lastGoal: null });
    const g = applyLiveFrame(s, frame({ phase: "goal", minute: 12, score: { for: 1, against: 0 }, scorer: "Silva" }), BASE, SCORERS, 2)!;
    expect(g.lastGoal).toEqual({ minute: 12, side: "for", scorer: "Silva" });
    const g2 = applyLiveFrame(g, frame({ phase: "goal", minute: 30, score: { for: 1, against: 1 }, scorer: "Hacker <b>" }), BASE, SCORERS, 3)!;
    expect(g2.lastGoal).toEqual({ minute: 30, side: "against", scorer: null });
    const h = applyLiveFrame(g2, frame({ phase: "half", minute: 45, score: { for: 1, against: 1 } }), BASE, SCORERS, 4)!;
    expect(h.status).toBe("half");
    const e = applyLiveFrame(h, frame({ phase: "end", minute: 94, score: { for: 1, against: 1 } }), BASE, SCORERS, 5)!;
    expect(e).toMatchObject({ status: "ended", events: 5, updatedAt: 5 });
    expect(applyLiveFrame(e, frame({ phase: "goal", minute: 95, score: { for: 2, against: 1 } }), BASE, SCORERS, 6)).toBeNull();
  });
  test("the score never goes down and a goal must add one", () => {
    const s = applyLiveFrame(null, frame({ phase: "goal", minute: 5, score: { for: 1, against: 0 } }), BASE, SCORERS, 1)!;
    expect(applyLiveFrame(s, frame({ phase: "goal", minute: 6, score: { for: 0, against: 1 } }), BASE, SCORERS, 2)).toBeNull();
    expect(applyLiveFrame(s, frame({ phase: "goal", minute: 6, score: { for: 1, against: 0 } }), BASE, SCORERS, 2)).toBeNull();
    expect(applyLiveFrame(s, frame({ phase: "half", minute: 45, score: { for: 2, against: 0 } }), BASE, SCORERS, 2)).toBeNull();
  });
  test("the minute never goes back", () => {
    const s = applyLiveFrame(null, frame({ phase: "goal", minute: 40, score: { for: 1, against: 0 } }), BASE, SCORERS, 1)!;
    expect(applyLiveFrame(s, frame({ phase: "half", minute: 30, score: { for: 1, against: 0 } }), BASE, SCORERS, 2)).toBeNull();
  });
  test("another fixture starts over", () => {
    const s = applyLiveFrame(null, frame({ phase: "goal", minute: 40, score: { for: 3, against: 0 } }), BASE, SCORERS, 1)!;
    const other = applyLiveFrame(s, frame({ fixtureId: "f2" }), { ...BASE, fixtureId: "f2" }, SCORERS, 2)!;
    expect(other).toMatchObject({ fixtureId: "f2", score: { for: 0, against: 0 }, events: 1 });
  });
  test("a minute frame moves the clock, keeps the score and does not count as an event", () => {
    const s = applyLiveFrame(null, frame({ phase: "goal", minute: 12, score: { for: 1, against: 0 } }), BASE, SCORERS, 1)!;
    const m = applyLiveFrame(s, frame({ phase: "minute", minute: 20, score: { for: 1, against: 0 } }), BASE, SCORERS, 2)!;
    expect(m).toMatchObject({ status: "live", minute: 20, score: { for: 1, against: 0 }, events: s.events, updatedAt: 2 });
    expect(m.lastGoal).toEqual(s.lastGoal);
    // After half-time the clock frame puts the game back to live.
    const h = applyLiveFrame(m, frame({ phase: "half", minute: 45, score: { for: 1, against: 0 } }), BASE, SCORERS, 3)!;
    expect(applyLiveFrame(h, frame({ phase: "minute", minute: 50, score: { for: 1, against: 0 } }), BASE, SCORERS, 4)!.status).toBe("live");
  });
  test("a minute frame must move the clock and never changes the score", () => {
    const s = applyLiveFrame(null, frame({ phase: "goal", minute: 12, score: { for: 1, against: 0 } }), BASE, SCORERS, 1)!;
    expect(applyLiveFrame(s, frame({ phase: "minute", minute: 12, score: { for: 1, against: 0 } }), BASE, SCORERS, 2)).toBeNull();
    expect(applyLiveFrame(s, frame({ phase: "minute", minute: 20, score: { for: 2, against: 0 } }), BASE, SCORERS, 2)).toBeNull();
    expect(applyLiveFrame(null, frame({ phase: "minute", minute: 20 }), BASE, SCORERS, 2)).toBeNull();
    expect(parseLiveFrame({ saveId: "s1", fixtureId: "f1", phase: "minute", minute: 20, score: { for: 0, against: 0 } })?.phase).toBe("minute");
  });
  test("minute frames still go through once the event cap is reached", () => {
    let s = applyLiveFrame(null, frame({}), BASE, SCORERS, 1)!;
    for (let i = 1; i < RIVALS.LIVE_MAX_EVENTS; i++) s = applyLiveFrame(s, frame({ phase: "start", minute: 0 }), BASE, SCORERS, 1)!;
    expect(applyLiveFrame(s, frame({ phase: "minute", minute: 5 }), BASE, SCORERS, 2)?.minute).toBe(5);
  });
  test("at most LIVE_MAX_EVENTS events", () => {
    let s = applyLiveFrame(null, frame({}), BASE, SCORERS, 1)!;
    for (let i = 1; i < RIVALS.LIVE_MAX_EVENTS; i++) s = applyLiveFrame(s, frame({ phase: "start", minute: 0 }), BASE, SCORERS, 1)!;
    expect(s.events).toBe(RIVALS.LIVE_MAX_EVENTS);
    expect(applyLiveFrame(s, frame({}), BASE, SCORERS, 1)).toBeNull();
  });
});

describe("liveStatusAt", () => {
  const live = applyLiveFrame(null, frame({}), BASE, SCORERS, 0)!;
  test("stale, then gone", () => {
    expect(liveStatusAt(live, RIVALS.LIVE_STALE_MS - 1)).toBe("live");
    expect(liveStatusAt(live, RIVALS.LIVE_STALE_MS + 1)).toBe("stale");
    expect(liveStatusAt(live, RIVALS.LIVE_DROP_MS + 1)).toBe("gone");
  });
  test("an ended game stays 10 minutes", () => {
    const ended = { ...live, status: "ended" as const };
    expect(liveStatusAt(ended, RIVALS.LIVE_ENDED_KEEP_MS - 1)).toBe("ended");
    expect(liveStatusAt(ended, RIVALS.LIVE_ENDED_KEEP_MS + 1)).toBe("gone");
  });
  test("isLiveScoreView", () => {
    expect(isLiveScoreView(live)).toBe(true);
    expect(isLiveScoreView({ seatId: "a" })).toBe(false);
  });
});
