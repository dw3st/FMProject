import { describe, expect, test } from "bun:test";
import { displaySides, displayTeam, isAwayView, toDisplayPair } from "@/GameInterface/matchSides";

describe("isAwayView", () => {
  test("home fixture keeps the user left", () => {
    expect(isAwayView({ home: "me", away: "opp" }, "me")).toBe(false);
  });
  test("away fixture puts the home side left", () => {
    expect(isAwayView({ home: "opp", away: "me" }, "me")).toBe(true);
  });
  test("neutral venue keeps the user left", () => {
    expect(isAwayView({ home: "opp", away: "me", neutral: true }, "me")).toBe(false);
  });
  test("missing data is the home view", () => {
    expect(isAwayView(null, "me")).toBe(false);
    expect(isAwayView({ home: "opp", away: "me" }, undefined)).toBe(false);
  });
});

describe("display order", () => {
  test("sides", () => {
    expect(displaySides(false)).toEqual({ left: "A", right: "B" });
    expect(displaySides(true)).toEqual({ left: "B", right: "A" });
  });
  test("pairs swap only in the away view", () => {
    expect(toDisplayPair({ A: 1, B: 2 }, false)).toEqual({ A: 1, B: 2 });
    expect(toDisplayPair({ A: 1, B: 2 }, true)).toEqual({ A: 2, B: 1 });
  });
  test("displayTeam is its own inverse", () => {
    for (const away of [false, true]) for (const tm of ["A", "B"] as const) {
      expect(displayTeam(displayTeam(tm, away), away)).toBe(tm);
    }
    expect(displayTeam("A", true)).toBe("B");
  });
});
