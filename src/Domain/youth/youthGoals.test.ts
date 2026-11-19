import { describe, expect, test } from "bun:test";
import { goalStatus, parseGoal, promotionPicks, settleGoals, YOUTH_GOAL } from "@/Domain/youth/youthGoals";
import { overallAvg } from "@/Domain/playerRating";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

function player(id: string, pos: string, level: number, age = 17): RosterPlayer {
  const v = level;
  return {
    id, name: `P ${id}`, age, squadId: "c1", preferredFoot: "right", positions: [pos],
    stats: {
      passing: v, vision: v, finishing: v, dribbling: v, speed: v, acceleration: v,
      tackling: v, pressing: v, stamina: v, heading: v, strength: v, reflex: v, jump: v, decisions: v, composure: v, flair: v, anticipation: v,
    },
    profile: { summary: "" } as RosterPlayer["profile"],
  };
}

describe("parseGoal", () => {
  const p = player("y", "ST", 4);
  const now = overallAvg(p);
  test("a goal above today's level within the limit", () => {
    const g = parseGoal({ level: now + 0.5, months: 6 }, p, "2030-01-01");
    expect(g?.by).toBe("2030-06-30");
    expect(g?.from).toBeCloseTo(now, 1);
  });
  test("refuses a goal at or below today, too far, or an unknown length", () => {
    expect(parseGoal({ level: now, months: 6 }, p, "2030-01-01")).toBeNull();
    expect(parseGoal({ level: now + YOUTH_GOAL.MAX_GAIN + 0.2, months: 6 }, p, "2030-01-01")).toBeNull();
    expect(parseGoal({ level: now + 0.5, months: 4 }, p, "2030-01-01")).toBeNull();
    expect(parseGoal(null, p, "2030-01-01")).toBeNull();
  });
});

describe("goalStatus", () => {
  const g = { level: 5, from: 4, set: "2030-01-01", by: "2030-07-01" };
  test("reached, missed, on track and behind", () => {
    expect(goalStatus(g, 5.1, "2030-03-01")).toBe("reached");
    expect(goalStatus(g, 4.5, "2030-07-01")).toBe("missed");
    expect(goalStatus(g, 4.6, "2030-04-01")).toBe("onTrack");
    expect(goalStatus(g, 4.1, "2030-05-01")).toBe("behind");
  });
});

describe("settleGoals", () => {
  test("reached and missed goals become news, gone players drop silently", () => {
    const a = player("a", "ST", 5);
    const b = player("b", "ST", 4);
    const goals = {
      a: { level: overallAvg(a) - 0.1, from: 4, set: "2030-01-01", by: "2030-12-01" },
      b: { level: overallAvg(b) + 1, from: overallAvg(b), set: "2030-01-01", by: "2030-03-01" },
      gone: { level: 6, from: 5, set: "2030-01-01", by: "2030-12-01" },
    };
    const r = settleGoals(goals, [a, b], "2030-03-01");
    expect(r.outcomes.map((o) => `${o.id}:${o.outcome}`).sort()).toEqual(["a:reached", "b:missed"]);
    expect(r.goals).toBeUndefined();
  });
  test("nothing ending: the same object", () => {
    const a = player("a", "ST", 4);
    const goals = { a: { level: overallAvg(a) + 1, from: overallAvg(a), set: "2030-01-01", by: "2030-12-01" } };
    expect(settleGoals(goals, [a], "2030-02-01").goals).toBe(goals);
  });
});

describe("promotionPicks", () => {
  const squad = (youth: RosterPlayer[]): Squad => ({
    id: "c1", name: "T", colors: ["#000", "#fff"], money: 0,
    players: [
      ...Array.from({ length: 3 }, (_, i) => player(`g${i}`, "GK", 5, 27)),
      ...Array.from({ length: 7 }, (_, i) => player(`d${i}`, "CB", 5, 27)),
      ...Array.from({ length: 7 }, (_, i) => player(`m${i}`, "CM", 5, 27)),
      ...Array.from({ length: 4 }, (_, i) => player(`f${i}`, "ST", 5, 27)),
    ],
    youth,
    finances: { broadcasting: 1, commercial: 1, total: 2, budget: 0, followers: 1 },
    venue: { name: "A", city: "C", capacity: 1, surface: "grass" },
  } as Squad);
  test("a youngster near the starters is ready; a weak one is not picked", () => {
    const picks = promotionPicks(squad([player("ok", "ST", 4.9), player("weak", "ST", 2.5)]));
    expect(picks).toEqual([{ id: "ok", reason: "ready" }]);
  });
  test("at most MAX_PICKS", () => {
    const youth = Array.from({ length: 6 }, (_, i) => player(`r${i}`, "ST", 5));
    expect(promotionPicks(squad(youth))).toHaveLength(YOUTH_GOAL.MAX_PICKS);
  });
});
