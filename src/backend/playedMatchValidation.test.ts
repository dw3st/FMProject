import { describe, expect, test } from "bun:test";
import { knockoutRecordingDecided, validatePlayedMatch } from "@/backend/playedMatchValidation";
import type { Fixture } from "@/types/calendarTypes";

const ok = {
  fixtureId: "f1", score: { home: 1, away: 1 },
  teamStats: { home: {}, away: {} }, playerStats: { p1: {} }, playerRatings: {}, playerEnergy: { p1: 80 },
  substitutions: [], durationMs: 5,
};

describe("validatePlayedMatch", () => {
  test("a well-formed recording passes", () => {
    expect(validatePlayedMatch(ok)?.fixtureId).toBe("f1");
  });
  test("missing parts or an energy hole fail", () => {
    expect(validatePlayedMatch(null)).toBeNull();
    expect(validatePlayedMatch({ ...ok, score: { home: "1", away: 0 } })).toBeNull();
    expect(validatePlayedMatch({ ...ok, playerEnergy: {} })).toBeNull();
    expect(validatePlayedMatch({ ...ok, durationMs: undefined })).toBeNull();
  });
});

describe("knockoutRecordingDecided", () => {
  const league = { id: "f1", knockout: undefined } as unknown as Fixture;
  const cup = { id: "f1", knockout: true } as unknown as Fixture;
  test("a league draw is fine; a knockout draw needs a shootout winner", () => {
    const rec = validatePlayedMatch(ok)!;
    expect(knockoutRecordingDecided(league, rec)).toBe(true);
    expect(knockoutRecordingDecided(cup, rec)).toBe(false);
    expect(knockoutRecordingDecided(cup, { ...rec, decider: { extraTime: { home: 0, away: 0 }, penalties: { home: 4, away: 3 } } })).toBe(true);
    expect(knockoutRecordingDecided({ ...cup, aggregate: { home: 1, away: 0 } } as Fixture, rec)).toBe(true);
  });
});
