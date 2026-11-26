import { describe, expect, test } from "bun:test";
import { theyKnow, youKnow, type ClubPlan } from "@/Domain/study/tacticalKnowledge";
import { axesFor, type TacticalStyle } from "@/types/tacticsTypes";
import { emptySeasonLog, type RosterPlayer, type Squad } from "@/types/playerTypes";
import type { StaffMember } from "@/types/staffTypes";
import type { TacticLogEntry } from "@/types/studyTypes";

const game = (n: number, formation = "4-3-3", style: TacticalStyle = "high_press"): TacticLogEntry => ({
  date: `2027-03-${String(n).padStart(2, "0")}`, fixtureId: `f${n}`, formation, style, axes: axesFor(style),
});

function player(id: string): RosterPlayer {
  return {
    id, name: id, age: 25, squadId: "s", preferredFoot: "right", positions: ["CM"],
    stats: {
      passing: 5, vision: 5, finishing: 5, dribbling: 5, speed: 5, acceleration: 5, tackling: 5, pressing: 5, stamina: 7,
      heading: 5, strength: 5, reflex: 5, jump: 5, decisions: 5, composure: 5, flair: 5, anticipation: 5,
    },
    profile: { summary: "", archetype: "" },
    seasonLog: emptySeasonLog(),
  };
}
const squad = (id: string, extra: Partial<Squad> = {}): Squad =>
  ({ id, name: id, colors: ["#000", "#fff"], money: 0, players: [player(`${id}-1`)], ...extra });
const ai = squad("ai", { financialTier: "HIGH", finances: {} as Squad["finances"] });
/** Analyst score `v` (1 = 1 star, 10.5 = 3, 20 = 5). */
const analyst = (v: number): StaffMember => ({
  id: "an", name: "An", nationality: "England", role: "analyst", age: 40,
  attributes: { determination: v, discipline: v, adaptability: v, playerReading: v, knowledge: { analysis: v } },
});
const human = (v: number) => squad("me", { staff: { members: [analyst(v)] } });

const plans = (list: [string, TacticalStyle][]): ClubPlan[] => list.map(([formation, style]) => ({ formation, style }));

describe("what they know", () => {
  const log = [1, 2, 3, 4, 5].map((n) => game(n));

  test("no log: nobody has read the manager", () => {
    expect(theyKnow(undefined, ai, human(10.5), game(6))).toBeNull();
  });

  test("the same tactic keeps the full read, another one surprises them", () => {
    const same = theyKnow(log, ai, human(10.5), game(6))!;
    expect(same.read).toBe(100);
    expect(same.now).toBe(100);
    expect(same.surprise).toBe(false);
    expect(same.expected).toEqual({ formation: "4-3-3", style: "high_press" });
    const other = theyKnow(log, ai, human(10.5), game(6, "4-4-2", "counter_attack"))!;
    expect(other.surprise).toBe(true);
    expect(other.now).toBe(0);
    expect(other.read).toBe(100);
  });
});

describe("what you know", () => {
  const steady = plans([["4-2-3-1", "possession"], ["4-2-3-1", "possession"], ["4-2-3-1", "possession"], ["4-3-3", "possession"], ["4-2-3-1", "possession"]]);

  test("no game: nothing to show", () => {
    expect(youKnow([], human(10.5), "k")).toBeNull();
  });

  test("a 5-star analyst gives the exact value and the right shape", () => {
    const k = youKnow(steady, human(20), "k")!;
    expect(k.low).toBe(90);
    expect(k.high).toBe(90);
    expect(k.expected).toEqual({ formation: "4-2-3-1", style: "possession" });
    expect(k.mayMiss).toBe(false);
  });

  test("a weaker analyst shows a range that always holds the true value", () => {
    for (let i = 0; i < 200; i++) {
      const k = youKnow(steady, human(1), `seed-${i}`)!;
      expect(k.low).toBeLessThanOrEqual(90);
      expect(k.high).toBeGreaterThanOrEqual(90);
      expect(k.high - k.low).toBeGreaterThanOrEqual(45);
      expect(k.mayMiss).toBe(true);
    }
  });

  test("a weak analyst sometimes names the second formation, never a strong one", () => {
    const wrong = (v: number) => Array.from({ length: 300 }, (_, i) => youKnow(steady, human(v), `s${i}`)!)
      .filter((k) => k.expected.formation === "4-3-3").length;
    expect(wrong(1)).toBeGreaterThan(60);
    expect(wrong(1)).toBeLessThan(150);
    expect(wrong(20)).toBe(0);
  });

  test("the same key gives the same card", () => {
    expect(youKnow(steady, human(5), "same")).toEqual(youKnow(steady, human(5), "same"));
  });

  test("fewer than five games read less", () => {
    const k = youKnow(plans([["4-4-2", "balanced"], ["4-4-2", "balanced"]]), human(20), "k")!;
    expect(k.low).toBe(40);
  });
});
