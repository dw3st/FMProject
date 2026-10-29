import { describe, expect, test } from "bun:test";
import { compactDayLog } from "@/Domain/advanceDay/dayLogCompaction";
import type { StoredDayLog } from "@/types/dayLogTypes";

function match(home: string, away: string): StoredDayLog["events"][number] {
  return {
    kind: "match", fixtureId: `${home}-${away}`, competition: "la_liga", round: 1, home, away,
    score: { home: 1, away: 0 }, teamStats: { home: {} as never, away: {} as never },
    playerStats: { p1: {} as never }, playerRatings: { p1: 7 }, playerNames: { p1: "A" }, playerTeams: { p1: "home" },
    scorers: [], substitutions: [], developmentChanges: [{} as never], durationMs: 1,
  };
}

describe("compactDayLog", () => {
  test("drops training and rest, compacts AI matches, keeps human matches whole", () => {
    const log: StoredDayLog = {
      saveId: "s", date: "2027-01-01",
      events: [
        { kind: "training", squadId: "a" } as never, { kind: "rest", squadId: "b" } as never,
        match("ai1", "ai2"), match("human", "ai3"),
      ],
    };
    const out = compactDayLog(log, new Set(["human"]))!;
    expect(out.events.map((e) => e.kind)).toEqual(["match", "match"]);
    type M = Extract<StoredDayLog["events"][number], { kind: "match" }>;
    const ai = out.events[0] as M, human = out.events[1] as M;
    expect(ai.compact).toBe(true);
    expect(ai.playerStats).toEqual({});
    expect(ai.score).toEqual({ home: 1, away: 0 });
    expect(human.compact).toBeUndefined();
    expect(Object.keys(human.playerStats)).toEqual(["p1"]);
  });

  test("null when there is nothing to compact", () => {
    expect(compactDayLog({ saveId: "s", date: "d", events: [match("human", "x")] }, new Set(["human"]))).toBeNull();
    expect(compactDayLog({ saveId: "s", date: "d", events: [] }, new Set())).toBeNull();
  });
});
