import { describe, expect, test } from "bun:test";
import { readyBranch } from "@/GameInterface/World/groupAdvanceText";
import type { GroupAdvanceView } from "@/types/groupAdvanceTypes";

function view(over: Partial<GroupAdvanceView> = {}, me: Partial<GroupAdvanceView["me"]> = {}): GroupAdvanceView {
  return {
    currentDate: "2027-03-10", target: null, running: false, deadlineHours: null, deadlineAt: null, waitingFor: [],
    error: null, errorTries: 0, nextRetryAt: null, gaveUp: false, members: [], kind: "friends", nextSlotAt: null,
    me: { readyUntil: null, matchToday: null, decision: null, ...me },
    ...over,
  };
}

describe("readyBranch", () => {
  test("no view: disabled", () => expect(readyBranch(null).branch).toBe("disabled"));
  test("running wins over everything", () => {
    expect(readyBranch(view({ running: true }, { matchToday: { fixtureId: "f", humanOpponent: false } })).branch).toBe("running");
  });
  test("match day without decision: match, play unless a human opponent", () => {
    expect(readyBranch(view({}, { matchToday: { fixtureId: "f", humanOpponent: false } }))).toEqual({ branch: "match", marked: false, canPlay: true });
    expect(readyBranch(view({}, { matchToday: { fixtureId: "f", humanOpponent: true } })).canPlay).toBe(false);
  });
  test("match day keeps the mark so it can be undone", () => {
    expect(readyBranch(view({}, { readyUntil: "2027-03-20", matchToday: { fixtureId: "f", humanOpponent: false } })).marked).toBe(true);
  });
  test("decided match day falls through to ready/menu", () => {
    const decision = { date: "2027-03-10", fixtureId: "f", mode: "simulate" as const };
    expect(readyBranch(view({}, { matchToday: { fixtureId: "f", humanOpponent: false }, decision })).branch).toBe("menu");
  });
  test("ready only when the mark is after today", () => {
    expect(readyBranch(view({}, { readyUntil: "2027-03-12" })).branch).toBe("ready");
    expect(readyBranch(view({}, { readyUntil: "2027-03-10" })).branch).toBe("menu");
  });
});
