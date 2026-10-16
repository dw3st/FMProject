// src/Domain/multiplayer/standingsEvents.test.ts
import { describe, expect, test } from "bun:test";
import { continentalEventItem, cupTieItems, nationalNewsItems } from "@/Domain/multiplayer/standingsEvents";

describe("standings events", () => {
  test("cup: only the final scores, champion and finalist", () => {
    expect(cupTieItems("final")).toEqual({
      winner: { key: "cup", points: 8 }, loser: { key: "cup", points: 3 },
    });
    expect(cupTieItems("sf")).toBeNull();
    expect(cupTieItems("final", "cup_england")?.winner.detail).toBe("cup_england");
  });
  test("continental: stage reached from the event", () => {
    expect(continentalEventItem({ kind: "advanced", clubId: "a", stage: "group" })?.points).toBe(1);
    expect(continentalEventItem({ kind: "advanced", clubId: "a", stage: "r16" })).toBeNull();
    expect(continentalEventItem({ kind: "advanced", clubId: "a", stage: "qf" })?.points).toBe(3);
    expect(continentalEventItem({ kind: "advanced", clubId: "a", stage: "sf" })?.points).toBe(6);
    expect(continentalEventItem({ kind: "advanced", clubId: "a", stage: "final" })).toBeNull();
    expect(continentalEventItem({ kind: "champion", clubId: "a" })?.points).toBe(15);
    expect(continentalEventItem({ kind: "eliminated", clubId: "a", stage: "sf" })).toBeNull();
    expect(continentalEventItem({ kind: "champion", clubId: "a" }, "ucl")).toEqual({ key: "continental", points: 15, detail: "ucl" });
  });
  test("national team: objective met +2, title +6 more", () => {
    expect(nationalNewsItems({ kind: "result", met: true })).toEqual([{ key: "national_objective", points: 2 }]);
    expect(nationalNewsItems({ kind: "result", met: true, title: true })).toEqual([
      { key: "national_objective", points: 2 }, { key: "national_title", points: 6 },
    ]);
    expect(nationalNewsItems({ kind: "result", met: false })).toEqual([]);
    expect(nationalNewsItems({ kind: "sacked" })).toEqual([]);
  });
});
