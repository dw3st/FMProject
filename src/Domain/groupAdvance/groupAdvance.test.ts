import { describe, expect, test } from "bun:test";
import {
  assistantPatches, errorRetryAt, errorRetryDue, errorGaveUp, nextUndecided, trimPendingSummary, computeGroupTarget, deadlineAt, deadlinePassed, seatStops, isGroupWorld, laterDate, memberStatus, resolveReadyUntil, type GroupSeatInput,
} from "@/Domain/groupAdvance/groupAdvance";

describe("isGroupWorld", () => {
  test("only a multi world with a world state", () => {
    expect(isGroupWorld({ mode: "multi", world: { phase: "running" } })).toBe(true);
    expect(isGroupWorld({ mode: "multi", world: { phase: "lobby" } })).toBe(true);
    expect(isGroupWorld({ mode: "multi" })).toBe(false);
    expect(isGroupWorld({ mode: "solo" })).toBe(false);
  });
});

describe("resolveReadyUntil", () => {
  const today = "2027-03-10";
  test("null unmarks", () => {
    expect(resolveReadyUntil(null, today, null)).toEqual({ ok: true, readyUntil: null });
  });
  test("tomorrow is one day", () => {
    expect(resolveReadyUntil("tomorrow", today, "2027-03-14")).toEqual({ ok: true, readyUntil: "2027-03-11" });
  });
  test("next_match stops ON the match day", () => {
    expect(resolveReadyUntil("next_match", today, "2027-03-14")).toEqual({ ok: true, readyUntil: "2027-03-14" });
  });
  test("next_match without a match is tomorrow", () => {
    expect(resolveReadyUntil("next_match", today, null)).toEqual({ ok: true, readyUntil: "2027-03-11" });
  });
  test("a date from tomorrow on", () => {
    expect(resolveReadyUntil("2027-03-20", today, null)).toEqual({ ok: true, readyUntil: "2027-03-20" });
  });
  test("today, the past, an impossible date, a far date and garbage are refused", () => {
    for (const bad of ["2027-03-10", "2027-03-01", "2027-02-30", "2029-01-01", "soon", 42, undefined]) {
      expect(resolveReadyUntil(bad, today, null)).toEqual({ ok: false, error: "invalidDate" });
    }
  });
});

describe("laterDate", () => {
  test("the later of two dates, null-safe", () => {
    expect(laterDate("2027-03-11", "2027-03-12")).toBe("2027-03-12");
    expect(laterDate(null, "2027-03-12")).toBe("2027-03-12");
    expect(laterDate(undefined, "2027-03-12")).toBe("2027-03-12");
  });
});

const seat = (seatId: string, over: Partial<GroupSeatInput> = {}): GroupSeatInput => ({
  seatId, readyUntil: null, matchDates: [], decisionDate: null, unemployed: false, ...over,
});

describe("computeGroupTarget", () => {
  const today = "2027-03-10";
  test("the smallest ready date of all seats", () => {
    const plan = computeGroupTarget(today, [seat("a", { readyUntil: "2027-03-14" }), seat("b", { readyUntil: "2027-03-12" })]);
    expect(plan).toEqual({ target: "2027-03-12", waitingFor: [], matchWaiting: [] });
  });
  test("a seat not ready holds the world today", () => {
    const plan = computeGroupTarget(today, [seat("a", { readyUntil: "2027-03-14" }), seat("b")]);
    expect(plan).toEqual({ target: today, waitingFor: ["b"], matchWaiting: [] });
  });
  test("a readyUntil in the past counts as not ready", () => {
    const plan = computeGroupTarget(today, [seat("a", { readyUntil: "2027-03-09" })]);
    expect(plan.waitingFor).toEqual(["a"]);
  });
  test("an undecided game stops ON its day", () => {
    const plan = computeGroupTarget(today, [
      seat("a", { readyUntil: "2027-03-20", matchDates: ["2027-03-13"] }),
      seat("b", { readyUntil: "2027-03-20" }),
    ]);
    expect(plan.target).toBe("2027-03-13");
  });
  test("an undecided game today holds the world and is a match wait", () => {
    const plan = computeGroupTarget(today, [seat("a", { readyUntil: "2027-03-20", matchDates: [today] })]);
    expect(plan).toEqual({ target: today, waitingFor: ["a"], matchWaiting: ["a"] });
  });
  test("a decided game does not stop", () => {
    const plan = computeGroupTarget(today, [seat("a", { readyUntil: "2027-03-20", matchDates: [today], decisionDate: today })]);
    expect(plan.target).toBe("2027-03-20");
  });
  test("an unemployed seat has no game stop but still needs a date", () => {
    expect(computeGroupTarget(today, [seat("a", { unemployed: true, matchDates: [today], readyUntil: "2027-03-15" })]).target)
      .toBe("2027-03-15");
    expect(computeGroupTarget(today, [seat("a", { unemployed: true })]).waitingFor).toEqual(["a"]);
  });
  test("no seats: no target", () => {
    expect(computeGroupTarget(today, [])).toEqual({ target: today, waitingFor: [], matchWaiting: [] });
  });
});

describe("memberStatus", () => {
  const today = "2027-03-10";
  test("ready, match, late, no club", () => {
    expect(memberStatus(seat("a", { readyUntil: "2027-03-12" }), today)).toBe("ready");
    expect(memberStatus(seat("a", { readyUntil: "2027-03-12", matchDates: [today] }), today)).toBe("match");
    expect(memberStatus(seat("a"), today)).toBe("late");
    expect(memberStatus(seat("a", { unemployed: true, readyUntil: "2027-03-12" }), today)).toBe("no_club");
  });
});

describe("deadline", () => {
  const since = "2027-01-01T10:00:00.000Z";
  test("deadlineAt adds the hours; null without a deadline or a wait", () => {
    expect(deadlineAt(since, 24)).toBe("2027-01-02T10:00:00.000Z");
    expect(deadlineAt(since, null)).toBeNull();
    expect(deadlineAt(null, 24)).toBeNull();
  });
  test("deadlinePassed from the exact instant", () => {
    expect(deadlinePassed(since, 12, Date.parse("2027-01-01T21:59:59.000Z"))).toBe(false);
    expect(deadlinePassed(since, 12, Date.parse("2027-01-01T22:00:00.000Z"))).toBe(true);
    expect(deadlinePassed(since, null, Date.parse("2030-01-01T00:00:00.000Z"))).toBe(false);
    expect(deadlinePassed(null, 12, Date.parse("2030-01-01T00:00:00.000Z"))).toBe(false);
  });
});

describe("assistantPatches", () => {
  const today = "2027-03-10";
  test("the late seat goes to the others' smallest stop and simulates his game in it", () => {
    const seats = [
      seat("a", { readyUntil: "2027-03-15" }),
      seat("b", { readyUntil: "2027-03-13" }),
      seat("late", { matchDates: ["2027-03-12"] }),
    ];
    const plan = computeGroupTarget(today, seats);
    expect(assistantPatches(today, seats, plan)).toEqual([{ seatId: "late", readyUntil: "2027-03-13", decisionDate: "2027-03-12" }]);
  });
  test("nobody ready: tomorrow; a game today is simulated", () => {
    const seats = [seat("a", { matchDates: [today] }), seat("b")];
    const plan = computeGroupTarget(today, seats);
    expect(assistantPatches(today, seats, plan)).toEqual([
      { seatId: "a", readyUntil: "2027-03-11", decisionDate: today },
      { seatId: "b", readyUntil: "2027-03-11", decisionDate: null },
    ]);
  });
  test("a game on the stop date is not decided (it is the next stop)", () => {
    const seats = [seat("a", { readyUntil: "2027-03-13" }), seat("late", { matchDates: ["2027-03-13"] })];
    const plan = computeGroupTarget(today, seats);
    expect(assistantPatches(today, seats, plan)).toEqual([{ seatId: "late", readyUntil: "2027-03-13", decisionDate: null }]);
  });
});

describe("seatStops", () => {
  test("sacked, job or national offers, season end", () => {
    expect(seatStops({ sacked: true })).toBe(true);
    expect(seatStops({ jobOffers: 1 })).toBe(true);
    expect(seatStops({ seasonEnded: true })).toBe(true);
    expect(seatStops({ renewalOffer: true })).toBe(true);
    expect(seatStops({ jobOffers: 0, pressInvite: true })).toBe(false);
    expect(seatStops({})).toBe(false);
  });
});

describe("review fixes", () => {
  const today = "2027-03-10";
  test("a decided game today is skipped; the next game stops the world", () => {
    const seats = [seat("a", { readyUntil: "2027-03-20", matchDates: [today, "2027-03-13"], decisionDate: today })];
    expect(computeGroupTarget(today, seats).target).toBe("2027-03-13");
    expect(nextUndecided(seats[0]!, today)).toBe("2027-03-13");
  });
  test("the assistant skips the decided game too", () => {
    const seats = [
      seat("a", { readyUntil: "2027-03-20" }),
      seat("late", { matchDates: [today, "2027-03-13"], decisionDate: today }),
    ];
    const plan = computeGroupTarget(today, seats);
    expect(assistantPatches(today, seats, plan)).toEqual([{ seatId: "late", readyUntil: "2027-03-20", decisionDate: "2027-03-13" }]);
  });
  test("late has priority over no_club; a ready unemployed is no_club", () => {
    expect(memberStatus(seat("a", { unemployed: true }), today)).toBe("late");
    expect(memberStatus(seat("a", { unemployed: true, readyUntil: "2027-03-15" }), today)).toBe("no_club");
  });
  test("an invalid waitingSince has no deadline", () => {
    expect(deadlineAt("garbage", 12)).toBeNull();
    expect(deadlinePassed("garbage", 12, Date.now())).toBe(false);
  });
  test("next_match is capped like a date", () => {
    expect(resolveReadyUntil("next_match", today, "2029-01-01")).toEqual({ ok: true, readyUntil: "2027-03-11" });
  });
  test("exact day limit, month and year rollover", () => {
    expect(resolveReadyUntil("2028-04-13", today, null)).toEqual({ ok: true, readyUntil: "2028-04-13" });
    expect(resolveReadyUntil("2028-04-14", today, null)).toEqual({ ok: false, error: "invalidDate" });
    expect(resolveReadyUntil("tomorrow", "2027-03-31", null)).toEqual({ ok: true, readyUntil: "2027-04-01" });
    expect(resolveReadyUntil("tomorrow", "2027-12-31", null)).toEqual({ ok: true, readyUntil: "2028-01-01" });
  });
  test("equal readyUntil dates", () => {
    const plan = computeGroupTarget(today, [seat("a", { readyUntil: "2027-03-12" }), seat("b", { readyUntil: "2027-03-12" })]);
    expect(plan).toEqual({ target: "2027-03-12", waitingFor: [], matchWaiting: [] });
  });
  test("assistant: unemployed late seat gets no decision", () => {
    const seats = [seat("a", { readyUntil: "2027-03-15" }), seat("late", { unemployed: true, matchDates: ["2027-03-12"] })];
    expect(assistantPatches(today, seats, computeGroupTarget(today, seats)))
      .toEqual([{ seatId: "late", readyUntil: "2027-03-15", decisionDate: null }]);
  });
  test("assistant: several late seats with others ready", () => {
    const seats = [
      seat("a", { readyUntil: "2027-03-14" }), seat("l1", { matchDates: ["2027-03-11"] }),
      seat("l2", { matchDates: ["2027-03-14"] }),
    ];
    expect(assistantPatches(today, seats, computeGroupTarget(today, seats))).toEqual([
      { seatId: "l1", readyUntil: "2027-03-14", decisionDate: "2027-03-11" },
      { seatId: "l2", readyUntil: "2027-03-14", decisionDate: null },
    ]);
  });
  test("all unemployed without a date: all wait, tomorrow for the assistant", () => {
    const seats = [seat("a", { unemployed: true }), seat("b", { unemployed: true })];
    const plan = computeGroupTarget(today, seats);
    expect(plan.waitingFor).toEqual(["a", "b"]);
    expect(assistantPatches(today, seats, plan).map((p) => p.readyUntil)).toEqual(["2027-03-11", "2027-03-11"]);
  });
});

describe("trimPendingSummary", () => {
  const day = (date: string, seat: Record<string, unknown> = {}) => ({ date, newDate: date, seat });
  test("drops the oldest days without a stop, never a day with one", () => {
    const days = [day("1", { jobOffers: 1 }), day("2"), day("3", { sacked: true }), day("4"), day("5")];
    expect(trimPendingSummary(days, 3).map((d) => d.date)).toEqual(["1", "3", "5"]);
  });
  test("keeps every stop even above the cap", () => {
    const days = [day("1", { seasonEnded: true }), day("2", { jobOffers: 2 }), day("3")];
    expect(trimPendingSummary(days, 1).map((d) => d.date)).toEqual(["1", "2"]);
  });
  test("under the cap nothing changes", () => {
    const days = [day("1"), day("2")];
    expect(trimPendingSummary(days, 5)).toEqual(days);
  });
});

describe("errorRetryDue", () => {
  const at = "2026-10-15T12:00:00.000Z";
  const t0 = Date.parse(at);
  const min = 60_000;
  test("waits longer after each failure and gives up after the last", () => {
    expect(errorRetryDue({ error: "x", errorAt: at, errorTries: 1 }, t0 + 4 * min)).toBe(false);
    expect(errorRetryDue({ error: "x", errorAt: at, errorTries: 1 }, t0 + 5 * min)).toBe(true);
    expect(errorRetryDue({ error: "x", errorAt: at, errorTries: 2 }, t0 + 14 * min)).toBe(false);
    expect(errorRetryDue({ error: "x", errorAt: at, errorTries: 2 }, t0 + 15 * min)).toBe(true);
    expect(errorRetryDue({ error: "x", errorAt: at, errorTries: 3 }, t0 + 60 * min)).toBe(true);
    expect(errorRetryDue({ error: "x", errorAt: at, errorTries: 4 }, t0 + 60 * min)).toBe(true);
    expect(errorRetryDue({ error: "x", errorAt: at, errorTries: 5 }, t0 + 999 * min)).toBe(false);
  });
  test("no error, no retry", () => {
    expect(errorRetryDue({}, t0)).toBe(false);
    expect(errorRetryDue(null, t0)).toBe(false);
  });
});

describe("errorRetryAt / errorGaveUp", () => {
  const at = "2026-10-15T12:00:00.000Z";
  test("the clock's next try, null once it gave up or without an error", () => {
    expect(errorRetryAt({ error: "dayFailed", errorAt: at, errorTries: 1 })).toBe("2026-10-15T12:05:00.000Z");
    expect(errorRetryAt({ error: "dayFailed", errorAt: at, errorTries: 2 })).toBe("2026-10-15T12:15:00.000Z");
    expect(errorRetryAt({ error: "dayFailed", errorAt: at, errorTries: 4 })).toBe("2026-10-15T13:00:00.000Z");
    expect(errorRetryAt({ error: "dayFailed", errorAt: at, errorTries: 5 })).toBeNull();
    expect(errorRetryAt({ error: null, errorAt: at, errorTries: 1 })).toBeNull();
    expect(errorRetryAt(null)).toBeNull();
  });
  test("gave up after MAX_ERROR_RETRIES failures in a row", () => {
    expect(errorGaveUp({ error: "dayFailed", errorTries: 4 })).toBe(false);
    expect(errorGaveUp({ error: "dayFailed", errorTries: 5 })).toBe(true);
    expect(errorGaveUp({ error: null, errorTries: 9 })).toBe(false);
  });
});
