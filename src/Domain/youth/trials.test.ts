import { describe, expect, test } from "bun:test";
import {
  checkTrialRequest, coachGemMult, fameMult, generateTrialPlayers, parseTrialRequest, revealOf, seasonCount,
  trialCost, trialCount, trialKnowledge, trialReputation, withScheduled,
} from "@/Domain/youth/trials";
import { YOUTH_TRIAL } from "@/Domain/youth/trialConfig";
import { YOUTH } from "@/Domain/youth/youthConfig";
import { overallAvg } from "@/Domain/playerRating";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

function mk(i: number, pos: string, level: number): RosterPlayer {
  const v = level;
  return {
    id: `p${i}`, name: `Player ${i} Silva`, age: 26, squadId: "s1", preferredFoot: "right", positions: [pos],
    stats: {
      passing: v, vision: v, finishing: v, dribbling: v, speed: v, acceleration: v, tackling: v,
      pressing: v, stamina: v, heading: v, strength: v, reflex: pos === "GK" ? v : 0, jump: pos === "GK" ? v : 0,
      decisions: v, composure: v, flair: v, anticipation: v,
    },
    profile: { summary: "", archetype: "" },
  };
}
const POS = ["GK", "GK", "CB", "CB", "CB", "LB", "RB", "CM", "CM", "CDM", "CAM", "LM", "RM", "ST", "ST", "LW", "RW"];
const squad = (): Squad => ({
  id: "s1", name: "S", colors: ["#000", "#fff"], money: 0, country: "England",
  players: POS.map((p, i) => mk(i, p, 5)),
  finances: { broadcasting: 50e6, commercial: 50e6, total: 100e6, budget: 0, followers: 1e6 },
} as Squad);

describe("youth trials: scheduling", () => {
  test("cost by size", () => {
    expect(trialCost("small", 100e6)).toBe(200_000);
    expect(trialCost("large", 100e6)).toBe(1_000_000);
    expect(trialCost("medium", -5)).toBe(0);
  });
  test("parse", () => {
    expect(parseTrialRequest({ age: 16, size: "medium", date: "2027-03-01" })).toEqual({ age: 16, size: "medium", date: "2027-03-01" });
    expect(parseTrialRequest({ age: 18, size: "medium", date: "2027-03-01" })).toBeNull();
    expect(parseTrialRequest({ age: 16, size: "huge", date: "2027-03-01" })).toBeNull();
    expect(parseTrialRequest({ age: 16, size: "small", date: "soon" })).toBeNull();
    expect(parseTrialRequest(null)).toBeNull();
  });
  test("window, pending and season limit", () => {
    const req = { age: 16 as const, size: "small" as const, date: "2027-03-15" };
    expect(checkTrialRequest(req, { today: "2027-03-01", state: undefined, season: "2027" })).toBeNull();
    expect(checkTrialRequest({ ...req, date: "2027-03-10" }, { today: "2027-03-01", state: undefined, season: "2027" })).toBe("invalidTrial");
    expect(checkTrialRequest({ ...req, date: "2027-04-10" }, { today: "2027-03-01", state: undefined, season: "2027" })).toBe("invalidTrial");
    const one = withScheduled(undefined, { id: "t", date: "2027-03-15", age: 16, size: "small", cost: 1, scheduledOn: "2027-03-01" }, "2027");
    expect(seasonCount(one, "2027")).toBe(1);
    expect(checkTrialRequest(req, { today: "2027-03-01", state: one, season: "2027" })).toBe("trialPending");
    const two = withScheduled({ ...one, scheduled: undefined }, { id: "u", date: "2027-04-15", age: 16, size: "small", cost: 1, scheduledOn: "2027-04-01" }, "2027");
    expect(seasonCount(two, "2027")).toBe(2);
    expect(checkTrialRequest(req, { today: "2027-03-01", state: { ...two, scheduled: undefined }, season: "2027" })).toBe("trialLimit");
    expect(checkTrialRequest(req, { today: "2027-03-01", state: { ...two, scheduled: undefined }, season: "2028" })).toBeNull();
  });
});

describe("youth trials: the trial day", () => {
  const base = { saveId: "sv", seatId: "a", trial: { date: "2027-03-15", age: 16 as const, size: "medium" as const }, squad: squad(), coachStars: 3, fame: 1 };
  test("deterministic, count, age, below the club", () => {
    const a = generateTrialPlayers(base);
    expect(a).toEqual(generateTrialPlayers(base));
    expect(a.length).toBe(40);
    expect(new Set(a.map((p) => p.id)).size).toBe(40);
    for (const p of a) {
      expect(p.age).toBe(16);
      expect(p.nationality).toBe("England");
      expect(p.contract).toBeUndefined();
    }
    const mean = a.reduce((s, p) => s + overallAvg(p), 0) / a.length;
    expect(mean).toBeLessThan(4.2);
  });
  test("fame brings more youngsters", () => {
    expect(fameMult(0)).toBe(1);
    expect(fameMult(2)).toBe(1.5);
    expect(fameMult(20)).toBe(YOUTH_TRIAL.FAME_MAX);
    expect(trialCount("large", 1.5)).toBe(90);
    expect(generateTrialPlayers({ ...base, fame: 1.5 }).length).toBe(60);
  });
  test("coach curve and knowledge", () => {
    expect(coachGemMult(1)).toBeCloseTo(0.75);
    expect(coachGemMult(5)).toBeCloseTo(1.4);
    expect(coachGemMult(undefined)).toBeCloseTo(0.875);
    expect(trialKnowledge(5)).toBe(70);
    expect(trialKnowledge(undefined)).toBe(40);
  });
  test("gems are rare and stand out", () => {
    let gems = 0, seen = 0;
    for (let d = 1; d <= 400; d++) {
      const date = `2030-${String(1 + (d % 12)).padStart(2, "0")}-${String(1 + (d % 28)).padStart(2, "0")}`;
      const ps = generateTrialPlayers({ ...base, seatId: `s${d}`, trial: { ...base.trial, date } });
      seen += ps.length;
      for (const p of ps) if (p.profile.archetype === "Wonderkid") {
        gems++;
        expect(overallAvg(p)).toBeLessThanOrEqual(YOUTH.PROMISE_CAP + 0.05);
      }
    }
    const rate = gems / seen;
    expect(rate).toBeGreaterThan(0.002);
    expect(rate).toBeLessThan(0.007);
  });
});

describe("youth trials: reveals", () => {
  const found = (extra: Partial<RosterPlayer> = {}): RosterPlayer => ({
    ...mk(1, "ST", 6.5), id: "t1", trialOf: { clubId: "s1", clubName: "S", date: "2027-03-15", seatId: "a" }, ...extra,
  });
  test("first team, world top, sold", () => {
    const none = new Set<string>();
    expect(revealOf(found(), { worldTop: none, inFirstTeamOf: "s1" })).toBe("first_team");
    expect(revealOf(found(), { worldTop: none, inFirstTeamOf: "s2" })).toBeNull();
    expect(revealOf(found({ ...mk(1, "ST", 5), id: "t1", trialOf: found().trialOf }), { worldTop: none, inFirstTeamOf: "s1" })).toBeNull();
    expect(revealOf(found(), { worldTop: new Set(["t1"]), inFirstTeamOf: null })).toBe("world_top");
    expect(revealOf(found({ arrival: { squadId: "s9", kind: "transfer", fee: 12e6, on: "2029-01-01" } }), { worldTop: none, inFirstTeamOf: null })).toBe("sold");
    expect(revealOf(found({ trialRevealed: { kind: "sold", on: "2029-01-01" } }), { worldTop: new Set(["t1"]), inFirstTeamOf: "s1" })).toBeNull();
    expect(revealOf(mk(1, "ST", 7), { worldTop: new Set(["p1"]), inFirstTeamOf: "s1" })).toBeNull();
  });
  test("reputation capped", () => {
    expect(trialReputation(undefined)).toBe(0);
    expect(trialReputation({ count: 2, top: 0 })).toBe(2);
    expect(trialReputation({ count: 2, top: 1 })).toBe(4);
    expect(trialReputation({ count: 4, top: 3 })).toBe(5);
  });
});
