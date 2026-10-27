import { describe, expect, test } from "bun:test";
import { dueSlot, earlyStepDue, inactivityAction, isActiveSeat, isPublicLeague, isPublicWorld, nextSlotAt, publicStepTarget, slotAt } from "@/Domain/multiplayer/publicWorld";

import type { GroupSeatInput } from "@/Domain/groupAdvance/groupAdvance";

const ms = (iso: string) => Date.parse(iso);

describe("slots", () => {
  test("slotAt turns a Brasília time of a UTC day into an instant", () => {
    expect(slotAt("2026-10-26", "09:00")).toBe("2026-10-26T12:00:00.000Z");
    expect(slotAt("2026-10-26", "22:00")).toBe("2026-10-27T01:00:00.000Z");
  });
  test("dueSlot: the latest slot already passed and newer than lastSlot, else null", () => {
    const now = ms("2026-10-26T16:30:00.000Z"); // 13:30 Brasília
    expect(dueSlot(now, null)).toBe("2026-10-26T16:00:00.000Z");
    expect(dueSlot(now, "2026-10-26T16:00:00.000Z")).toBeNull();
    expect(dueSlot(now, "2026-10-26T12:00:00.000Z")).toBe("2026-10-26T16:00:00.000Z");
  });
  test("dueSlot: several missed slots are one step (the latest)", () => {
    const now = ms("2026-10-27T02:00:00.000Z"); // 23:00 Brasília
    expect(dueSlot(now, "2026-10-25T12:00:00.000Z")).toBe("2026-10-27T01:00:00.000Z");
  });
  test("dueSlot: just after midnight UTC the 22:00 of the day before still counts", () => {
    const now = ms("2026-10-27T01:30:00.000Z"); // 22:30 Brasília of the 26th
    expect(dueSlot(now, null)).toBe("2026-10-27T01:00:00.000Z");
  });
  test("nextSlotAt: the first slot after now", () => {
    expect(nextSlotAt(ms("2026-10-26T16:30:00.000Z"))).toBe("2026-10-26T21:00:00.000Z");
    expect(nextSlotAt(ms("2026-10-27T01:30:00.000Z"))).toBe("2026-10-27T12:00:00.000Z");
  });
});

describe("publicStepTarget", () => {
  test("plays the parked day and stops on the next seat game day", () => {
    expect(publicStepTarget("2026-09-12", ["2026-09-12", "2026-09-15", "2026-09-19"], [])).toBe("2026-09-15");
  });
  test("parked on a day without games: still stops on the next game day after today", () => {
    expect(publicStepTarget("2026-09-10", ["2026-09-12"], [])).toBe("2026-09-12");
  });
  test("no seat games: the next world league round day after today", () => {
    expect(publicStepTarget("2026-09-10", [], ["2026-09-10", "2026-09-13"])).toBe("2026-09-13");
  });
  test("nothing ahead: one day, or the horizon when given", () => {
    expect(publicStepTarget("2026-09-10", [], [])).toBe("2026-09-11");
    expect(publicStepTarget("2026-09-10", [], [], "2026-11-09")).toBe("2026-11-09");
  });
});

describe("inactivity", () => {
  const now = ms("2026-10-26T12:00:00.000Z");
  test("seen recently: nothing", () => {
    expect(inactivityAction("2026-10-24T12:00:00.000Z", null, now)).toBe("none");
  });
  test("5 days: warn once", () => {
    expect(inactivityAction("2026-10-21T11:00:00.000Z", null, now)).toBe("warn");
    expect(inactivityAction("2026-10-21T11:00:00.000Z", "2026-10-26T10:00:00.000Z", now)).toBe("none");
  });
  test("7 days: remove", () => {
    expect(inactivityAction("2026-10-19T11:00:00.000Z", "2026-10-24T10:00:00.000Z", now)).toBe("remove");
  });
  test("never seen counts from null: nothing (the join sets lastSeenAt)", () => {
    expect(inactivityAction(null, null, now)).toBe("none");
  });
});

test("isPublicLeague / isPublicWorld", () => {
  expect(isPublicLeague("premier_league")).toBe(true);
  expect(isPublicLeague("of_championship")).toBe(false);
  expect(isPublicWorld({ mode: "multi", world: { kind: "public" } })).toBe(true);
  expect(isPublicWorld({ mode: "multi", world: {} })).toBe(false);
  expect(isPublicWorld({ mode: "solo" })).toBe(false);
});

describe("early step", () => {
  const seat = (o: Partial<GroupSeatInput> = {}): GroupSeatInput =>
    ({ seatId: "s1", readyUntil: "2026-08-20", matchDates: ["2026-08-20"], decisionDate: null, unemployed: false, ...o });
  const now = ms("2026-10-26T17:00:00.000Z");
  test("every active seat ready to the target: due", () => {
    expect(earlyStepDue("2026-08-16", "2026-08-20", [seat(), seat({ seatId: "s2" })], null, now)).toBe(true);
  });
  test("one seat not ready, or today's game undecided: not due", () => {
    expect(earlyStepDue("2026-08-16", "2026-08-20", [seat(), seat({ seatId: "s2", readyUntil: "2026-08-17" })], null, now)).toBe(false);
    expect(earlyStepDue("2026-08-16", "2026-08-20", [seat({ matchDates: ["2026-08-16", "2026-08-20"] })], null, now)).toBe(false);
    expect(earlyStepDue("2026-08-16", "2026-08-20",
      [seat({ matchDates: ["2026-08-16", "2026-08-20"], decisionDate: "2026-08-16" })], null, now)).toBe(true);
  });
  test("20 minutes between steps", () => {
    expect(earlyStepDue("2026-08-16", "2026-08-20", [seat()], "2026-10-26T16:45:00.000Z", now)).toBe(false);
    expect(earlyStepDue("2026-08-16", "2026-08-20", [seat()], "2026-10-26T16:40:00.000Z", now)).toBe(true);
  });
  test("no active seat with a club: not due", () => {
    expect(earlyStepDue("2026-08-16", "2026-08-20", [], null, now)).toBe(false);
    expect(earlyStepDue("2026-08-16", "2026-08-20", [seat({ unemployed: true, matchDates: [] })], null, now)).toBe(false);
  });
  test("active = opened in the last 24 hours", () => {
    expect(isActiveSeat(now - 23 * 3_600_000, now)).toBe(true);
    expect(isActiveSeat(now - 25 * 3_600_000, now)).toBe(false);
    expect(isActiveSeat(null, now)).toBe(false);
  });
});
