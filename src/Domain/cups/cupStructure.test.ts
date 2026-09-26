import { describe, expect, test } from "bun:test";
import { planStages, stageNameFor } from "@/Domain/cups/cupStructure";

describe("planStages", () => {
  test("power of two: no preliminary", () => {
    expect(planStages(16)).toEqual({ preliminaryClubs: 0, stageNames: ["r16", "qf", "sf", "final"] });
    expect(planStages(2)).toEqual({ preliminaryClubs: 0, stageNames: ["final"] });
  });
  test("44 clubs: 24 play a preliminary, 20 byes, then r32", () => {
    expect(planStages(44)).toEqual({
      preliminaryClubs: 24,
      stageNames: ["preliminary", "r32", "r16", "qf", "sf", "final"],
    });
  });
  test("3 clubs: 2 play the preliminary, winner meets the bye in the final", () => {
    expect(planStages(3)).toEqual({ preliminaryClubs: 2, stageNames: ["preliminary", "final"] });
  });
  test("fewer than 2 clubs: no cup", () => {
    expect(planStages(1)).toBeNull();
    expect(planStages(0)).toBeNull();
  });
  test("more than 256 entrants: throws instead of duplicating r128", () => {
    expect(() => planStages(257)).toThrow();
    expect(() => planStages(300)).toThrow();
    expect(planStages(256)).not.toBeNull();
  });
  test("stage names by entrants", () => {
    expect(stageNameFor(2)).toBe("final");
    expect(stageNameFor(4)).toBe("sf");
    expect(stageNameFor(8)).toBe("qf");
    expect(stageNameFor(128)).toBe("r128");
  });
});
