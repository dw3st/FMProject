import { describe, expect, test } from "bun:test";
import { pruneDayLog, slimDayLog } from "@/Domain/advanceDay/dayLogCompaction";
import type { StoredDayLog } from "@/types/dayLogTypes";

function match(home: string, away: string): StoredDayLog["events"][number] {
  return {
    kind: "match", fixtureId: `${home}-${away}`, competition: "la_liga", round: 1, home, away,
    score: { home: 1, away: 0 }, teamStats: { home: {} as never, away: {} as never },
    playerStats: { p1: {} as never }, playerRatings: { p1: 7 }, playerNames: { p1: "A" }, playerTeams: { p1: "home" },
    scorers: [], substitutions: [], developmentChanges: [{} as never], durationMs: 1,
  };
}

describe("day log compaction", () => {
  test("drops training and rest, compacts AI matches, keeps human matches whole", () => {
    const log: StoredDayLog = {
      saveId: "s", date: "2027-01-01",
      events: [
        { kind: "training", squadId: "a" } as never, { kind: "rest", squadId: "b" } as never,
        match("ai1", "ai2"), match("human", "ai3"),
      ],
    };
    const out = slimDayLog(log, new Set(["human"]))!;
    expect(out.events.map((e) => e.kind)).toEqual(["match", "match"]);
    type M = Extract<StoredDayLog["events"][number], { kind: "match" }>;
    const ai = out.events[0] as M, human = out.events[1] as M;
    expect(ai.compact).toBe(true);
    expect(ai.slim).toBe(true);
    expect(ai.playerStats).toEqual({});
    expect(ai.score).toEqual({ home: 1, away: 0 });
    expect(human.compact).toBeUndefined();
    expect(Object.keys(human.playerStats)).toEqual(["p1"]);
  });

  test("slimDayLog keeps result, scorers and the required team numbers of AI matches", () => {
    const ts = { shots: 5, passesCompleted: 40, passesAttempted: 44, tackles: 3, interceptions: 2, fouls: 9, crosses: 7 };
    const ai = { ...match("ai1", "ai2"), teamStats: { home: ts, away: ts }, cards: [{} as never], referee: {} as never,
      scorers: [{ playerId: "p9", playerName: "Gol", team: "home" as const, goals: 1 }] };
    const log: StoredDayLog = {
      saveId: "s", date: "2027-01-01", events: [ai as never, match("human", "ai3")],
      youthMatches: [{ competition: "u21_x", fixtureId: "y", home: "ai1", away: "ai2", score: { home: 1, away: 1 }, scorers: [], best: null, players: { home: ["a"], away: ["b"] } }],
    };
    const out = slimDayLog(log, new Set(["human"]))!;
    type M = Extract<StoredDayLog["events"][number], { kind: "match" }>;
    const slim = out.events[0] as M, human = out.events[1] as M;
    expect(slim.slim).toBe(true);
    expect(slim.score).toEqual({ home: 1, away: 0 });
    expect(slim.scorers.map((s) => s.playerId)).toEqual(["p9"]);
    expect(slim.playerNames).toEqual({ p9: "Gol" });
    expect(slim.teamStats.home).toEqual({ shots: 5, passesCompleted: 40, passesAttempted: 44, tackles: 3, interceptions: 2 });
    expect(slim.cards).toBeUndefined();
    expect(slim.referee).toBeUndefined();
    expect(human.slim).toBeUndefined();
    expect(out.youthMatches![0]!.players).toEqual({ home: [], away: [] });
    expect(slimDayLog(out, new Set(["human"]))).toBeNull();
  });

  test("null when there is nothing to compact", () => {
    expect(slimDayLog({ saveId: "s", date: "d", events: [match("human", "x")] }, new Set(["human"]))).toBeNull();
    expect(slimDayLog({ saveId: "s", date: "d", events: [] }, new Set())).toBeNull();
  });

  test("pruneDayLog keeps only the human clubs' games and the national games", () => {
    const log: StoredDayLog = {
      saveId: "s", date: "2027-01-01", events: [match("ai1", "ai2"), match("human", "ai3")],
      transfers: [{} as never], registrationViolations: 0, nationalMatches: { seat1: match("nat_a", "nat_b") as never },
      youthMatches: [
        { competition: "u21_x", fixtureId: "y1", home: "ai1", away: "ai2", score: null, scorers: [], best: null, players: { home: [], away: [] } },
        { competition: "u21_x", fixtureId: "y2", home: "human", away: "ai2", score: null, scorers: [], best: null, players: { home: [], away: [] } },
      ],
    };
    const out = pruneDayLog(log, new Set(["human"]))!;
    expect(out.events.map((e) => (e as { home: string }).home)).toEqual(["human"]);
    expect(out.youthMatches!.map((y) => y.fixtureId)).toEqual(["y2"]);
    expect(out.transfers).toBeUndefined();
    expect(out.registrationViolations).toBeUndefined();
    expect(Object.keys(out.nationalMatches!)).toEqual(["seat1"]);
    expect(pruneDayLog(out, new Set(["human"]))).toBeNull();
  });
});
