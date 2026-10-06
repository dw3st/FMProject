import { describe, expect, test } from "bun:test";
import {
  addProspects, advanceScoutingWeek, allowedWeeks, buildReport, generateProspects, gradeOf, isGem, missionCost,
  missionPool, monthlyRecommendations, observedPerWeek, pickObserved, prospectFee, pruneProspects, relativeNote,
  shortlistAlerts, starterLineAverages, type PoolEntry, type ViewerContext,
} from "@/Domain/scouting/missions";
import { emptyScoutingState, type ScoutAssignment, type ScoutReport } from "@/types/scoutingTypes";
import type { PlayerStatsRecord, RosterPlayer, Squad } from "@/types/playerTypes";

function stats(v: number): PlayerStatsRecord {
  return {
    passing: v, vision: v, finishing: v, dribbling: v, speed: v, acceleration: v, tackling: v,
    pressing: v, stamina: v, heading: v, strength: v, reflex: v, jump: v,
  };
}

function player(id: string, level: number, age = 25, pos = "CM"): RosterPlayer {
  return {
    id, name: `P ${id}`, age, squadId: "s", preferredFoot: "right", positions: [pos], stats: stats(level),
    profile: { summary: "", archetype: "" }, nationality: "Spain",
  };
}

function entry(p: RosterPlayer, country = "Spain"): PoolEntry {
  return { player: p, squadId: "s1", club: "Club", league: "la_liga", country };
}

const ctx = (over: Partial<ViewerContext> = {}): ViewerContext => ({
  saveId: "save", date: "2027-03-01", ownCountry: "England",
  lineAverages: { GK: 6, Defender: 6, Midfielder: 6, Forward: 6 },
  ownWageFactor: 1, chief: { uncertainty: 1, gain: 1 }, knowledgeOf: () => 0, ...over,
});

const mission = (over: Partial<ScoutAssignment> = {}): ScoutAssignment => ({
  id: "m1", scoutId: "chief", target: { kind: "country", country: "Spain" }, start: "2027-02-25", weeks: 4,
  weeksDone: 0, observed: 0, ...over,
});

describe("grades and gems", () => {
  test("relative note and grade thresholds", () => {
    expect(gradeOf(0.8)).toBe("A");
    expect(gradeOf(0.3)).toBe("B");
    expect(gradeOf(-0.2)).toBe("C");
    expect(gradeOf(-0.7)).toBe("D");
    expect(gradeOf(-0.71)).toBe("E");
    expect(relativeNote(6, 7, 20, 6)).toBeCloseTo(0.5);
    expect(relativeNote(6, 7, 30, 6)).toBeCloseTo(0);
  });
  test("gem: young, abroad (or youth mission), potential above the line", () => {
    const base = { age: 18, country: "Spain", ownCountry: "England", potentialHigh: 6.5, lineAverage: 6 };
    expect(isGem(base)).toBe(true);
    expect(isGem({ ...base, age: 21 })).toBe(false);
    expect(isGem({ ...base, country: "England" })).toBe(false);
    expect(isGem({ ...base, country: "England", youthMission: true })).toBe(true);
    expect(isGem({ ...base, potentialHigh: 6.2 })).toBe(false);
  });
  test("a report never shows the exact value of an unknown player, and the range narrows with k", () => {
    const p = player("a", 6);
    const low = buildReport(entry(p), 0, ctx(), {});
    const high = buildReport(entry(p), 100, ctx(), {});
    expect(low.overall[1] - low.overall[0]).toBeGreaterThan(high.overall[1] - high.overall[0]);
    expect(high.overall[0]).toBe(high.overall[1]);
  });
});

describe("missions", () => {
  test("observed per week and allowed weeks", () => {
    expect(observedPerWeek(5)).toBe(11);
    expect(observedPerWeek(10)).toBe(16);
    expect(allowedWeeks("continent")).toEqual([8, 12]);
    expect(allowedWeeks("youth")).toEqual([4, 8]);
  });
  test("pickObserved is deterministic and never repeats", () => {
    const pool = Array.from({ length: 30 }, (_, i) => entry(player(`p${i}`, 5)));
    const a = pickObserved(pool, 10, "seed", () => 0).map((e) => e.player.id);
    const b = pickObserved(pool, 10, "seed", () => 0).map((e) => e.player.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(10);
    expect(pickObserved(pool, 50, "seed", () => 0)).toHaveLength(30);
  });
  test("pool: youth age limit and focus", () => {
    const pool = [entry(player("y", 5, 18, "ST")), entry(player("o", 5, 25, "ST")), entry(player("d", 5, 18, "CB"))];
    expect(missionPool("youth", undefined, pool, ctx()).map((e) => e.player.id)).toEqual(["y", "d"]);
    expect(missionPool("country", { line: "Forward", maxAge: 20 }, pool, ctx()).map((e) => e.player.id)).toEqual(["y"]);
  });
  test("a week grows knowledge by the leader's rating, writes reports, ends missions", () => {
    const pool = Array.from({ length: 30 }, (_, i) => entry(player(`p${i}`, 5 + (i % 3))));
    const state = { ...emptyScoutingState(), missions: [mission({ weeks: 1 })] };
    const lowR = advanceScoutingWeek(state, [{ mission: state.missions[0]!, leaderRating: 1, pool }], ctx());
    const highR = advanceScoutingWeek(state, [{ mission: state.missions[0]!, leaderRating: 10, pool }], ctx());
    const maxK = (s: typeof state) => Math.max(...Object.values(s.knowledge).map((e) => e.k));
    expect(maxK(lowR.state)).toBeCloseTo(18);
    expect(maxK(highR.state)).toBeCloseTo(42);
    expect(Object.keys(lowR.state.knowledge)).toHaveLength(7);
    expect(Object.keys(highR.state.knowledge)).toHaveLength(16);
    expect(lowR.reports.length).toBe(5);
    expect(lowR.state.missions).toHaveLength(0);
    expect(lowR.news.some((n) => n.kind === "mission_done")).toBe(true);
    expect(lowR.news.some((n) => n.kind === "report")).toBe(true);
  });
  test("player mission: +35 per week until 100", () => {
    const target = entry(player("t", 6));
    let state = { ...emptyScoutingState(), missions: [mission({ target: { kind: "player", playerId: "t" }, weeks: 3 })] };
    const weeks: number[] = [];
    for (let w = 0; w < 3 && state.missions.length > 0; w++) {
      const r = advanceScoutingWeek(state, [{ mission: state.missions[0]!, leaderRating: 5, pool: [target] }], ctx());
      state = r.state;
      weeks.push(state.knowledge.t!.k);
    }
    expect(weeks).toEqual([35, 70, 100]);
    expect(state.missions).toHaveLength(0);
  });
  test("travel cost by distance, player missions half", () => {
    expect(missionCost("country", "world", 200_000_000)).toBe(5769);
    expect(missionCost("country", "country", 200_000_000)).toBe(1538);
    expect(missionCost("player", "world", 200_000_000)).toBe(2885);
  });
});

describe("recommendations and shortlist", () => {
  const rep = (id: string, grade: ScoutReport["grade"], gem = false): ScoutReport => ({
    id, date: "2027-03-01", playerId: id, name: id, squadId: "s", club: "", league: "", country: "", nationality: "",
    age: 20, position: "CM", k: 40, overall: [5, 6], potential: [6, 7], value: [1, 2], wageDemand: 0, forSale: false,
    grade, gem, text: "ready",
  });
  test("gems first, then A, at most 3, not last month's", () => {
    const out = monthlyRecommendations([rep("a", "A"), rep("b", "C", true), rep("c", "B"), rep("d", "A"), rep("e", "A")], ["e"]);
    expect(out.map((r) => r.playerId)).toEqual(["b", "a", "d"]);
  });
  test("shortlist alerts on transitions", () => {
    const s = { squadId: "x", forSale: false, loanListed: false, contractEnding: false, free: false };
    expect(shortlistAlerts(undefined, s)).toEqual([]);
    expect(shortlistAlerts(s, null)).toEqual(["retired"]);
    expect(shortlistAlerts(s, { ...s, forSale: true, contractEnding: true })).toEqual(["for_sale", "contract_ending"]);
    expect(shortlistAlerts(s, { ...s, squadId: "y" })).toEqual(["transferred"]);
    expect(shortlistAlerts(s, { ...s, free: true, squadId: "" })).toEqual(["free"]);
    expect(shortlistAlerts({ ...s, forSale: true }, { ...s, forSale: true })).toEqual([]);
  });
});

describe("prospects", () => {
  const top: Squad = {
    id: "es1", name: "Club", colors: ["#000", "#fff"], money: 0, country: "Spain",
    players: Array.from({ length: 20 }, (_, i) => player(`es${i}`, 6, 25, ["GK", "CB", "CM", "ST"][i % 4]!)),
  };
  test("deterministic, 0..2, 16-17, nationality of the country", () => {
    const args = { saveId: "s", country: "Spain", week: "2027-03-01", topLeagueSquads: [top], nextSeasonEnd: "2027-06-01", fee: 100_000 };
    const a = generateProspects(args);
    expect(generateProspects(args)).toEqual(a);
    expect(a.length).toBeLessThanOrEqual(2);
    let total = 0;
    for (let w = 0; w < 20; w++) {
      const ps = generateProspects({ ...args, week: `2027-0${1 + (w % 9)}-1${w % 10}` });
      total += ps.length;
      for (const p of ps) {
        expect(p.player.age).toBeGreaterThanOrEqual(16);
        expect(p.player.age).toBeLessThanOrEqual(17);
        expect(p.player.nationality).toBe("Spain");
        expect(p.player.squadId).toBe("");
      }
    }
    expect(total).toBeGreaterThan(0);
  });
  test("fee by tier, prospects join with a report and expire", () => {
    expect(prospectFee("LOW", 1)).toBe(50_000);
    expect(prospectFee("ELITE", 1)).toBe(400_000);
    const pr = { player: player("pr", 4, 16), country: "Spain", expires: "2027-03-31", reportId: "", fee: 50_000 };
    const r = addProspects(emptyScoutingState(), [pr], ctx(), { missionId: "m", leaderRating: 5 });
    expect(r.state.prospects).toHaveLength(1);
    expect(r.state.prospects[0]!.reportId).toBe(r.state.reports[0]!.id);
    expect(r.state.reports[0]!.prospectId).toBe("pr");
    expect(r.news[0]!.kind).toBe("prospect");
    expect(pruneProspects(r.state, "2027-04-01").prospects).toHaveLength(0);
  });
  test("starter line averages use the top of each line", () => {
    const sq: Squad = { ...top, players: [player("g1", 7, 25, "GK"), player("g2", 3, 25, "GK"), ...top.players.filter((p) => p.positions[0] !== "GK")] };
    expect(starterLineAverages(sq).GK).toBeCloseTo(starterLineAverages({ ...sq, players: [player("g1", 7, 25, "GK")] }).GK);
  });
});
