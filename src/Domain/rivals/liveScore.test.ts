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
  test("a goal the VAR disallows takes exactly one back, and the next goal counts again", () => {
    const g = applyLiveFrame(null, frame({ phase: "goal", minute: 20, score: { for: 1, against: 0 }, scorer: "Silva" }), BASE, SCORERS, 1)!;
    const d = applyLiveFrame(g, frame({ phase: "disallowed", minute: 21, score: { for: 0, against: 0 } }), BASE, SCORERS, 2)!;
    expect(d).toMatchObject({ status: "live", score: { for: 0, against: 0 }, lastGoal: null });
    // Before the fix the score was frozen at 1–0 and every frame after it refused, until the score passed 1.
    expect(applyLiveFrame(d, frame({ phase: "minute", minute: 25, score: { for: 0, against: 0 } }), BASE, SCORERS, 3)).not.toBeNull();
    expect(applyLiveFrame(d, frame({ phase: "goal", minute: 30, score: { for: 0, against: 1 } }), BASE, SCORERS, 3)!.score)
      .toEqual({ for: 0, against: 1 });
    // Exactly one goal back, on one side; never without a game or on a 0–0.
    expect(applyLiveFrame(g, frame({ phase: "disallowed", minute: 21, score: { for: 1, against: 0 } }), BASE, SCORERS, 2)).toBeNull();
    const two = applyLiveFrame(g, frame({ phase: "goal", minute: 22, score: { for: 2, against: 1 } }), BASE, SCORERS, 2)!;
    expect(applyLiveFrame(two, frame({ phase: "disallowed", minute: 23, score: { for: 1, against: 0 } }), BASE, SCORERS, 3)).toBeNull();
    expect(applyLiveFrame(null, frame({ phase: "disallowed", minute: 5, score: { for: 0, against: 0 } }), BASE, SCORERS, 1)).toBeNull();
    expect(parseLiveFrame({ saveId: "s1", fixtureId: "f1", phase: "disallowed", minute: 21, score: { for: 0, against: 0 } })?.phase)
      .toBe("disallowed");
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
    // Without a previous state (the server lost the game) a minute frame rebuilds it.
    expect(applyLiveFrame(null, frame({ phase: "minute", minute: 20 }), BASE, SCORERS, 2)).toMatchObject({ minute: 20, status: "live" });
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

describe("live moments", () => {
  test("goals, VAR, red cards, half and end become moments; the score never moves on a red", () => {
    let s = applyLiveFrame(null, frame({}), BASE, SCORERS, 1)!;
    expect(s.moments).toEqual([]);
    s = applyLiveFrame(s, frame({ phase: "goal", minute: 12, score: { for: 1, against: 0 }, scorer: "Silva" }), BASE, SCORERS, 2)!;
    s = applyLiveFrame(s, frame({ phase: "red", minute: 20, score: { for: 1, against: 0 }, scorer: "Silva", side: "against" }), BASE, SCORERS, 3)!;
    s = applyLiveFrame(s, frame({ phase: "disallowed", minute: 25, score: { for: 0, against: 0 } }), BASE, SCORERS, 4)!;
    s = applyLiveFrame(s, frame({ phase: "half", minute: 45, score: { for: 0, against: 0 } }), BASE, SCORERS, 5)!;
    expect(s.moments).toEqual([
      { minute: 12, kind: "goal", side: "for", player: "Silva" },
      { minute: 20, kind: "red", side: "against", player: "Silva" },
      { minute: 25, kind: "disallowed", side: "for" },
      { minute: 45, kind: "half" },
    ]);
    expect(applyLiveFrame(s, frame({ phase: "red", minute: 50, score: { for: 1, against: 0 }, side: "for" }), BASE, SCORERS, 6)).toBeNull();
    expect(applyLiveFrame(s, frame({ phase: "red", minute: 50, score: { for: 0, against: 0 } }), BASE, SCORERS, 6)).toBeNull();
    const r = applyLiveFrame(s, frame({ phase: "red", minute: 50, score: { for: 0, against: 0 }, side: "for", scorer: "Nobody" }), BASE, SCORERS, 6)!;
    expect(r.moments.at(-1)).toEqual({ minute: 50, kind: "red", side: "for", player: null });
  });
  test("a red frame needs a side; at most LIVE_MOMENTS_MAX moments are kept", () => {
    expect(parseLiveFrame({ saveId: "s1", fixtureId: "f1", phase: "red", minute: 5, score: { for: 0, against: 0 } })).toBeNull();
    let s = applyLiveFrame(null, frame({}), BASE, SCORERS, 1)!;
    for (let i = 1; i <= RIVALS.LIVE_MOMENTS_MAX + 3; i++) {
      s = applyLiveFrame(s, frame({ phase: "goal", minute: i, score: { for: i, against: 0 } }), BASE, SCORERS, i + 1)!;
    }
    expect(s.moments.length).toBe(RIVALS.LIVE_MOMENTS_MAX);
    expect(s.moments.at(-1)!.minute).toBe(RIVALS.LIVE_MOMENTS_MAX + 3);
  });

  test("yellow cards and substitutions: one side, a moment, the score never moves (4.40.1)", () => {
    let s = applyLiveFrame(null, frame({}), BASE, SCORERS, 1)!;
    s = applyLiveFrame(s, frame({ phase: "yellow", minute: 12, side: "for", scorer: "Silva" }), BASE, SCORERS, 2)!;
    s = applyLiveFrame(s, frame({ phase: "sub", minute: 60, side: "against", scorer: "Silva", playerIn: "Nobody" }), BASE, SCORERS, 3)!;
    expect(s.moments).toEqual([
      { minute: 12, kind: "yellow", side: "for", player: "Silva" },
      { minute: 60, kind: "sub", side: "against", player: "Silva", playerIn: null },
    ]);
    expect(applyLiveFrame(s, frame({ phase: "yellow", minute: 70, score: { for: 1, against: 0 }, side: "for" }), BASE, SCORERS, 4)).toBeNull();
    expect(parseLiveFrame({ saveId: "s1", fixtureId: "f1", phase: "sub", minute: 5, score: { for: 0, against: 0 } })).toBeNull();
    expect(parseLiveFrame({ saveId: "s1", fixtureId: "f1", phase: "sub", minute: 5, score: { for: 0, against: 0 }, side: "for", scorer: "A", playerIn: "B" }))
      .toEqual({ saveId: "s1", fixtureId: "f1", phase: "sub", minute: 5, score: { for: 0, against: 0 }, side: "for", scorer: "A", playerIn: "B" });
  });
});
