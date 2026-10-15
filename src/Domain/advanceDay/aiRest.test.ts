import { describe, expect, test } from "bun:test";
import { aiRestingClubs } from "@/Domain/advanceDay/aiRest";

describe("AI clubs rest by their own calendar", () => {
  test("a club rests the day after and the day before its own official match, never on a match day", () => {
    const yesterday = new Set(["a", "b"]);
    const tomorrow = new Set(["c", "b"]);
    const today = new Set(["b", "d"]);
    const rest = aiRestingClubs({ playedYesterday: yesterday, playsTomorrow: tomorrow, playsToday: today });
    expect([...rest].sort()).toEqual(["a", "c"]);
  });

  test("no match around the day: nobody rests", () => {
    expect(aiRestingClubs({ playedYesterday: new Set(), playsTomorrow: new Set(), playsToday: new Set(["x"]) }).size).toBe(0);
  });
});
