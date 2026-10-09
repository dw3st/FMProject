import { describe, expect, test } from "bun:test";
import { applyYouthMatch, postponeDate, updateLeaders, youthDpMult, youthMatchLog } from "@/Domain/youthComps/youthMatch";
import { areaMultsOf } from "@/Domain/staff/staff";
import { YOUTH_COMP } from "@/Domain/youthComps/youthCompConfig";
import { applyDevelopment } from "@/GameEngine/PlayerDevelopment";
import { applyMatchFitness } from "@/Domain/fitness/fitness";
import { dpWeightsFor } from "@/Domain/development/dpWeights";
import { mulberry32 } from "@/Domain/rng";
import type { PlayedMatchRecording } from "@/Domain/advanceDay/matches";
import type { MatchPlayerStats, MatchTeamStats } from "@/types/dayLogTypes";
import { emptySeasonLog, type RosterPlayer, type Squad } from "@/types/playerTypes";
import type { Fixture } from "@/types/calendarTypes";

function mk(id: string, pos: string, age: number): RosterPlayer {
  const v = 5;
  return {
    id, name: `P ${id}`, age, squadId: "s1", preferredFoot: "right", positions: [pos],
    stats: {
      passing: v, vision: v, finishing: v, dribbling: v, speed: v, acceleration: v, tackling: v,
      pressing: v, stamina: v, heading: v, strength: v, reflex: 0, jump: 0,
    },
    profile: { summary: "", archetype: "" },
    seasonLog: { ...emptySeasonLog(), appearances: 10, goals: 3, avgRating: 6.5, recentRatings: [6.5], fitness: 90, load: 20 },
    moraleLog: { minutes: [90], trend: [] },
  };
}

const squad = (): Squad => ({
  id: "s1", name: "S", colors: ["#000", "#fff"], money: 0, country: "England",
  players: [mk("a", "ST", 20), mk("b", "CB", 33), mk("idle", "CM", 22)],
  youth: [mk("y", "ST", 17)],
  finances: { broadcasting: 50e6, commercial: 50e6, total: 100e6, budget: 0, followers: 1e6 },
} as Squad);

const ps = (goals = 0, assists = 0): MatchPlayerStats => ({
  passesAttempted: 0, passesCompleted: 0, passesFailed: 0, shots: 0, goals, assists, interceptions: 0, tackles: 0,
});
const ts: MatchTeamStats = { shots: 0, passesCompleted: 0, passesAttempted: 0, tackles: 0, interceptions: 0 };

const recording = (extra: Partial<PlayedMatchRecording> = {}): PlayedMatchRecording => ({
  fixtureId: "f1",
  score: { home: 2, away: 1 },
  teamStats: { home: ts, away: ts },
  playerStats: { a: ps(2, 0), b: ps(0, 1), y: ps(0, 0), gen1: ps(1, 0) },
  playerRatings: { a: 8, b: 6.5, y: 7, gen1: 7.5 },
  playerEnergy: { a: 50, b: 55, y: 60, gen1: 50 },
  substitutions: [],
  injuries: [],
  cards: [],
  durationMs: 0,
  ...extra,
});

const DATE = "2026-09-02";
const opts = { date: DATE, rng: mulberry32(1), trackMorale: true };

describe("applyYouthMatch", () => {
  test("youthCup outside the season totals; form, cup, cards untouched", () => {
    const out = applyYouthMatch(squad(), recording(), opts);
    const a = out.squad.players.find((p) => p.id === "a")!;
    const before = squad().players.find((p) => p.id === "a")!;
    expect(a.seasonLog!.youthCup).toEqual({ appearances: 1, goals: 2, assists: 0, ratingSum: 8 });
    expect(a.seasonLog!.appearances).toBe(before.seasonLog!.appearances);
    expect(a.seasonLog!.goals).toBe(before.seasonLog!.goals);
    expect(a.seasonLog!.avgRating).toBe(before.seasonLog!.avgRating);
    expect(a.seasonLog!.recentRatings).toEqual(before.seasonLog!.recentRatings);
    expect(a.seasonLog!.cup).toBeUndefined();
    expect(a.seasonLog!.yellowCards ?? 0).toBe(0);
    const y = out.squad.youth!.find((p) => p.id === "y")!;
    expect(y.seasonLog!.youthCup!.appearances).toBe(1);
    expect(out.participants.sort()).toEqual(["a", "b", "y"]);
  });

  test("fitness and load follow applyMatchFitness with 90 minutes", () => {
    const out = applyYouthMatch(squad(), recording(), opts);
    const a = out.squad.players.find((p) => p.id === "a")!;
    const exp = applyMatchFitness({ fitness: 90, load: 20 }, { age: 20, stamina: 5 }, { endEnergy: 50, minutes: 90 });
    expect(a.seasonLog!.fitness).toBe(exp.fitness);
    expect(a.seasonLog!.load).toBe(exp.load);
  });

  test("DP: a match × DP_MULT, growth only (no extra age decline)", () => {
    const out = applyYouthMatch(squad(), recording(), opts);
    const a = out.squad.players.find((p) => p.id === "a")!;
    const p0 = squad().players.find((p) => p.id === "a")!;
    const expected = applyDevelopment(p0, 8, dpWeightsFor(p0), youthDpMult(squad(), p0), 0, areaMultsOf(squad())).updatedPlayer;
    expect(a.stats).toEqual(expected.stats);
    const b = out.squad.players.find((p) => p.id === "b")!;
    const b0 = squad().players.find((p) => p.id === "b")!;
    // 33 years old: no growth, no decline from a youth match.
    expect(b.stats).toEqual(b0.stats);
  });

  test("youthDpMult is the match multiplier × DP_MULT", () => {
    const p0 = squad().players[0]!;
    const withoutYouth = youthDpMult(squad(), p0) / YOUTH_COMP.DP_MULT;
    expect(withoutYouth).toBeGreaterThan(0.5);
    expect(withoutYouth).toBeLessThan(2);
  });

  test("injury from the recording becomes an injury with a return date", () => {
    const rec = recording({ injuries: [{ team: "home", playerId: "a", playerName: "P a", severity: "medium", matchMinute: 30, energy: 60 }] });
    const out = applyYouthMatch(squad(), rec, opts);
    const a = out.squad.players.find((p) => p.id === "a")!;
    expect(a.injury?.severity).toBe("medium");
    expect(a.injury!.returnDate > DATE).toBe(true);
    expect(out.injuriesApplied.map((i) => i.playerId)).toEqual(["a"]);
    expect(out.injuriesApplied[0]!.squadId).toBe("s1");
  });

  test("cards change nothing; an existing ban is not served", () => {
    const s = squad();
    s.players[0] = { ...s.players[0]!, suspension: { matches: 1 } };
    const rec = recording({ cards: [{ team: "home", playerId: "a", playerName: "P a", card: "red", matchMinute: 10 }] as PlayedMatchRecording["cards"] });
    const out = applyYouthMatch(s, rec, opts);
    const a = out.squad.players.find((p) => p.id === "a")!;
    expect(a.suspension).toEqual({ matches: 1 });
    expect(a.seasonLog!.yellowCards ?? 0).toBe(0);
    expect(a.seasonLog!.redCards ?? 0).toBe(0);
  });

  test("who did not play is unchanged", () => {
    const out = applyYouthMatch(squad(), recording(), opts);
    expect(out.squad.players.find((p) => p.id === "idle")).toEqual(squad().players.find((p) => p.id === "idle")!);
  });

  test("morale youth minutes: squad players only, at most 5", () => {
    let s = squad();
    for (let i = 0; i < 6; i++) s = applyYouthMatch(s, recording(), opts).squad;
    expect(s.players.find((p) => p.id === "a")!.moraleLog!.youthMinutes).toEqual([90, 90, 90, 90, 90]);
    expect(s.youth!.find((p) => p.id === "y")!.moraleLog!.youthMinutes).toBeUndefined();
    const ai = applyYouthMatch(squad(), recording(), { ...opts, trackMorale: false }).squad;
    expect(ai.players.find((p) => p.id === "a")!.moraleLog!.youthMinutes).toBeUndefined();
  });
});

describe("updateLeaders and youthMatchLog", () => {
  const info = (id: string) =>
    id === "gen1"
      ? { name: "G One", squadId: "s2", generated: true as const }
      : { name: `P ${id}`, squadId: "s1" };
  test("leaders sum per player and mark generated", () => {
    let l = updateLeaders({}, recording(), info);
    l = updateLeaders(l, recording(), info);
    expect(l.a).toEqual({ name: "P a", squadId: "s1", apps: 2, goals: 4, assists: 0, ratingSum: 16 });
    expect(l.gen1!.generated).toBe(true);
    expect(l.gen1!.goals).toBe(2);
  });
  test("log: scorers, best rating, real players only", () => {
    const fixture: Fixture = { id: "f1", date: DATE, competition: "u21_england", round: 1, home: "s1", away: "s2", played: false, result: null };
    const log = youthMatchLog(fixture, recording(), info, { home: ["a", "b", "y"], away: ["gen1"] }, new Set(["gen1"]));
    expect(log.score).toEqual({ home: 2, away: 1 });
    expect(log.scorers.find((s) => s.playerId === "a")!.goals).toBe(2);
    expect(log.scorers.find((s) => s.playerId === "gen1")!.generated).toBe(true);
    expect(log.best!.playerId).toBe("a");
    expect(log.players).toEqual({ home: ["a", "b", "y"], away: [] });
  });
});

describe("postponeDate", () => {
  const busySet = new Set(["s1@2026-09-03", "s2@2026-09-04"]);
  const busy = (c: string, d: string) => busySet.has(`${c}@${d}`);
  test("next day free for both clubs and without another game of the competition", () => {
    expect(postponeDate({ date: "2026-09-02", end: "2027-05-01", busy, home: "s1", away: "s2", sameCompDates: new Map() })).toBe("2026-09-05");
    expect(
      postponeDate({ date: "2026-09-02", end: "2027-05-01", busy, home: "s1", away: "s2", sameCompDates: new Map([["s2", new Set(["2026-09-05"])]]) }),
    ).toBe("2026-09-06");
  });
  test("none within 14 days or after the end → null (cancel)", () => {
    expect(postponeDate({ date: "2026-09-02", end: "2026-09-04", busy, home: "s1", away: "s2", sameCompDates: new Map() })).toBeNull();
    expect(postponeDate({ date: "2026-09-02", end: "2027-05-01", busy: () => true, home: "s1", away: "s2", sameCompDates: new Map() })).toBeNull();
  });
});
