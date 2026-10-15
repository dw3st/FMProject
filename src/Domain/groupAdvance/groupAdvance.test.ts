import { describe, expect, test } from "bun:test";
import { isGroupWorld, laterDate, resolveReadyUntil } from "@/Domain/groupAdvance/groupAdvance";

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
