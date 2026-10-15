import { describe, expect, test } from "bun:test";
import {
  assistantPatches, computeGroupTarget, deadlineAt, deadlinePassed, seatStops, isGroupWorld, laterDate, memberStatus, resolveReadyUntil, type GroupSeatInput,
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
  seatId, readyUntil: null, nextMatch: null, decisionDate: null, unemployed: false, ...over,
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
      seat("a", { readyUntil: "2027-03-20", nextMatch: "2027-03-13" }),
      seat("b", { readyUntil: "2027-03-20" }),
    ]);
    expect(plan.target).toBe("2027-03-13");
  });
  test("an undecided game today holds the world and is a match wait", () => {
    const plan = computeGroupTarget(today, [seat("a", { readyUntil: "2027-03-20", nextMatch: today })]);
    expect(plan).toEqual({ target: today, waitingFor: ["a"], matchWaiting: ["a"] });
  });
  test("a decided game does not stop", () => {
    const plan = computeGroupTarget(today, [seat("a", { readyUntil: "2027-03-20", nextMatch: today, decisionDate: today })]);
    expect(plan.target).toBe("2027-03-20");
  });
  test("an unemployed seat has no game stop but still needs a date", () => {
    expect(computeGroupTarget(today, [seat("a", { unemployed: true, nextMatch: today, readyUntil: "2027-03-15" })]).target)
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
    expect(memberStatus(seat("a", { readyUntil: "2027-03-12", nextMatch: today }), today)).toBe("match");
    expect(memberStatus(seat("a"), today)).toBe("late");
    expect(memberStatus(seat("a", { unemployed: true }), today)).toBe("no_club");
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
      seat("late", { nextMatch: "2027-03-12" }),
    ];
    const plan = computeGroupTarget(today, seats);
    expect(assistantPatches(today, seats, plan)).toEqual([{ seatId: "late", readyUntil: "2027-03-13", decisionDate: "2027-03-12" }]);
  });
  test("nobody ready: tomorrow; a game today is simulated", () => {
    const seats = [seat("a", { nextMatch: today }), seat("b")];
    const plan = computeGroupTarget(today, seats);
    expect(assistantPatches(today, seats, plan)).toEqual([
      { seatId: "a", readyUntil: "2027-03-11", decisionDate: today },
      { seatId: "b", readyUntil: "2027-03-11", decisionDate: null },
    ]);
  });
  test("a game on the stop date is not decided (it is the next stop)", () => {
    const seats = [seat("a", { readyUntil: "2027-03-13" }), seat("late", { nextMatch: "2027-03-13" })];
    const plan = computeGroupTarget(today, seats);
    expect(assistantPatches(today, seats, plan)).toEqual([{ seatId: "late", readyUntil: "2027-03-13", decisionDate: null }]);
  });
});

describe("seatStops", () => {
  test("sacked, job or national offers, season end", () => {
    expect(seatStops({ sacked: true })).toBe(true);
    expect(seatStops({ jobOffers: 1 })).toBe(true);
    expect(seatStops({ seasonEnded: true })).toBe(true);
    expect(seatStops({ jobOffers: 0, pressInvite: true })).toBe(false);
    expect(seatStops({})).toBe(false);
  });
});
