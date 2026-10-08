import { describe, expect, test } from "bun:test";
import { directorDecisions } from "@/Domain/responsibilities/director";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

function player(id: string, age: number, level: number, until: string, wage = 1000, pos = "CM"): RosterPlayer {
  const v = level;
  return {
    id, name: id, age, squadId: "c1", preferredFoot: "right", positions: [pos],
    stats: {
      passing: v, vision: v, finishing: v, dribbling: v, speed: v, acceleration: v,
      tackling: v, pressing: v, stamina: v, heading: v, strength: v, reflex: v, jump: v,
    },
    profile: { summary: "" } as RosterPlayer["profile"],
    contract: { until, wage },
  };
}

function squad(players: RosterPlayer[]): Squad {
  return {
    id: "c1", name: "T", colors: ["#000", "#fff"], money: 0, players,
    finances: { broadcasting: 50_000_000, commercial: 50_000_000, total: 100_000_000, budget: 0, followers: 0 },
    venue: { name: "A", city: "C", capacity: 40_000, surface: "grass" },
    wageFactor: 1, wageRevenueBasis: 100_000_000,
  };
}

const DATE = "2027-03-01";
const SEASON_END = "2027-05-31";
const CAP = 10_000_000;
// 20 players far from their contract end (never touched).
const base = Array.from({ length: 20 }, (_, i) => player(`s${i}`, 26, 5, "2029-05-31"));

const run = (sq: Squad, extra: Partial<Parameters<typeof directorDecisions>[0]> = {}) =>
  directorDecisions({ squad: sq, date: DATE, seasonEnd: SEASON_END, seasonKey: "2026", decided: {}, maxWageBudget: CAP, ...extra });

describe("directorDecisions", () => {
  test("renews a regular player whose contract ends within 120 days", () => {
    const sq = squad([...base, player("good", 28, 5, SEASON_END)]);
    const r = run(sq);
    expect(r.outcomes).toHaveLength(1);
    const o = r.outcomes[0]!;
    expect(o.outcome).toBe("renewed");
    expect(o.years).toBe(2);
    const good = r.squad.players.find((p) => p.id === "good")!;
    expect(good.contract!.until).toBe("2029-05-31");
    expect(good.contract!.wage).toBe(o.wage!);
    expect(o.wage!).toBeGreaterThan(0);
    // Renewal accepted: +6 morale (scaled by temperament).
    expect(good.morale!).toBeGreaterThan(65);
    expect(r.decided.good).toEqual({ season: "2026", renew: true });
  });

  test("lets an old or weak player go", () => {
    const sq = squad([...base, player("old", 34, 5, SEASON_END), player("weak", 25, 2, SEASON_END)]);
    const r = run(sq);
    expect(r.outcomes.map((o) => [o.playerId, o.outcome]).sort()).toEqual([["old", "leaving"], ["weak", "leaving"]]);
    expect(r.squad.players.find((p) => p.id === "old")!.contract!.until).toBe(SEASON_END);
    expect(r.decided.old).toEqual({ season: "2026", renew: false });
  });

  test("over the wage cap the director lets him go", () => {
    const sq = squad([...base, player("good", 26, 5, SEASON_END)]);
    expect(run(sq, { maxWageBudget: 1 }).outcomes[0]!.outcome).toBe("leaving");
  });

  test("a furious player who refuses becomes 'refused'", () => {
    const furious = { ...player("angry", 26, 5, SEASON_END), morale: 10 };
    const r = run(squad([...base, furious]));
    expect(r.outcomes).toEqual([{ playerId: "angry", name: "angry", outcome: "refused" }]);
    expect(r.squad.players.find((p) => p.id === "angry")!.contract!.until).toBe(SEASON_END);
    expect(r.decided.angry).toEqual({ season: "2026", renew: false });
  });

  test("players already decided this season or renewed by the manager are skipped", () => {
    const sq = squad([...base, player("done", 26, 5, SEASON_END), player("later", 26, 5, "2027-12-31")]);
    const r = run(sq, { decided: { done: { season: "2026" } } });
    expect(r.outcomes).toEqual([]);
    expect(r.squad).toBe(sq);
    // A decision of an older season does not count.
    expect(run(sq, { decided: { done: { season: "2025" } } }).outcomes.map((o) => o.playerId)).toEqual(["done"]);
  });

  test("a player on loan from another club is never touched", () => {
    const borrowed = { ...player("loanee", 26, 5, SEASON_END), loan: { fromClubId: "x", fromClubName: "X", until: SEASON_END, wageShare: 1 } };
    const r = run(squad([...base, borrowed]));
    expect(r.outcomes).toEqual([]);
  });

  test("a key player is decided already when he could ask for a contract talk (183 days)", () => {
    const star = player("star", 26, 8, "2027-08-15");
    const r = run(squad([...base, star]));
    expect(r.outcomes.map((o) => [o.playerId, o.outcome])).toEqual([["star", "renewed"]]);
    // A squad player that far out waits for the 120-day window.
    const fringe = player("fringe", 26, 4, "2027-08-15");
    expect(run(squad([...base, fringe])).outcomes).toEqual([]);
  });
});
