import { describe, expect, test } from "bun:test";
import {
  asNationalPlayer, callableCandidates, fillerLevel, missingByLine, nationalFillers, nationalLineup, pickCallUp, squadLevel,
  lineOf,
} from "@/Domain/national/nationalSquad";
import { applyNationalMatch, nationalCampDay, updateNationalLeaders } from "@/Domain/national/nationalMatch";
import { computeTournamentAwards, tournamentValueMult } from "@/Domain/national/nationalAwards";
import { isUnavailable } from "@/Domain/discipline/discipline";
import { emptySeasonLog, type RosterPlayer } from "@/types/playerTypes";
import type { PlayedMatchRecording } from "@/Domain/advanceDay/matches";
import type { NationalCompetition } from "@/types/nationalTypes";

const fillers = (line: "GK" | "Defender" | "Midfielder" | "Forward", n: number, level = 5) =>
  nationalFillers({ saveId: "s", teamId: "nat_testland", nation: "Testland", year: 2027, line, n, level, donors: ["Ana Souza", "João Lima"] });

describe("national squads", () => {
  test("generated players are deterministic, of their line, never of a club", () => {
    const a = fillers("Defender", 3);
    const b = fillers("Defender", 3);
    expect(a.map((p) => p.id)).toEqual(["ngen_testland_2027_DEF_0", "ngen_testland_2027_DEF_1", "ngen_testland_2027_DEF_2"]);
    expect(a.map((p) => p.stats)).toEqual(b.map((p) => p.stats));
    expect(a.every((p) => p.squadId === "" && p.nationality === "Testland" && lineOf(p) === "Defender")).toBe(true);
  });

  test("generated players never share a name, even with a single donor", () => {
    const taken = new Set<string>(["H. Ahmed"]);
    const a = nationalFillers({ saveId: "s", teamId: "nat_q", nation: "Q", year: 2027, line: "Defender", n: 8, level: 3, donors: ["H. Ahmed"], taken });
    const b = nationalFillers({ saveId: "s", teamId: "nat_q", nation: "Q", year: 2027, line: "Forward", n: 5, level: 3, donors: ["H. Ahmed"], taken });
    const names = [...a, ...b].map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain("H. Ahmed");
  });

  test("call-up: quotas per line, 23, injured left out, tired still called", () => {
    const pool = [...fillers("GK", 5, 4), ...fillers("Defender", 10), ...fillers("Midfielder", 10), ...fillers("Forward", 8)]
      .map((p) => ({ player: p, squadId: "c1" }));
    pool[0]!.player = { ...pool[0]!.player, injury: { severity: "light", returnDate: "2027-03-30" } };
    pool[1]!.player = { ...pool[1]!.player, seasonLog: { ...emptySeasonLog(), fitness: 40 } };
    const ok = callableCandidates(pool, "2027-03-25");
    expect(ok).toHaveLength(pool.length - 1);
    expect(ok.some((c) => c.player.id === pool[1]!.player.id)).toBe(true);
    const picked = pickCallUp(ok);
    expect(picked).toHaveLength(23);
    expect(picked.filter((c) => lineOf(c.player) === "GK")).toHaveLength(3);
    expect(missingByLine(picked.slice(0, 10).map((c) => c.player)).GK).toBeGreaterThanOrEqual(0);
    expect(fillerLevel([5, 5, 5], "UEFA")).toBeCloseTo(4.2, 6);
    expect(fillerLevel([5], "OFC")).toBe(2.1);
  });

  test("duty makes a player unavailable for the club, never for the nation", () => {
    const p: RosterPlayer = { ...fillers("Forward", 1)[0]!, nationalDuty: { nation: "Testland", from: "2027-03-22", until: "2027-03-30" } };
    expect(isUnavailable(p, "2027-03-25")).toBe(true);
    expect(isUnavailable(p, "2027-03-31")).toBe(false);
    expect(asNationalPlayer(p).nationalDuty).toBeUndefined();
    const squad = [...fillers("GK", 2), ...fillers("Defender", 6), ...fillers("Midfielder", 6), ...fillers("Forward", 4)];
    expect(nationalLineup(squad, "2027-03-25")).toHaveLength(11);
    expect(squadLevel(squad)).toBeGreaterThan(3);
  });

  test("post-match: national log outside the totals, career, fitness, camp day recovers", () => {
    const p = { ...fillers("Forward", 1)[0]!, seasonLog: { ...emptySeasonLog(), fitness: 90 } };
    const rec = {
      score: { home: 1, away: 0 }, playerStats: { [p.id]: { goals: 1, assists: 0 } }, playerRatings: { [p.id]: 7.5 },
      playerEnergy: { [p.id]: 60 }, injuries: [],
    } as unknown as PlayedMatchRecording;
    const r = applyNationalMatch(p, null, rec, { date: "2027-03-25", rng: () => 0.5, nation: "Testland", minutes: 90 });
    expect(r.played).toBe(true);
    expect(r.player.seasonLog!.national).toEqual({ appearances: 1, goals: 1, assists: 0, ratingSum: 7.5 });
    expect(r.player.seasonLog!.appearances).toBe(0);
    expect(r.player.national).toMatchObject({ nation: "Testland", caps: 1, goals: 1 });
    expect(r.player.seasonLog!.fitness).toBeLessThan(90);
    const rested = nationalCampDay(r.player, null, "2027-03-26");
    expect(rested.seasonLog!.fitness).toBeGreaterThan(r.player.seasonLog!.fitness);
    const leaders = updateNationalLeaders({}, rec, () => ({ name: "X", nation: "Testland", squadId: "c", line: "FWD" }));
    expect(leaders[p.id]).toMatchObject({ apps: 1, goals: 1 });
  });

  test("tournament awards: best player, top scorer, value boost of the champion", () => {
    const comp = {
      slug: "wc_2030", kind: "tournament", tournament: "wc", year: 2030, teams: ["nat_a", "nat_b"], groups: [],
      stages: [{ name: "group", dates: ["d1", "d2", "d3"], drawn: true }, { name: "final", dates: ["d4"], drawn: true }],
      fixtures: [{ id: "f", date: "d4", competition: "wc_2030", round: 4, home: "nat_a", away: "nat_b", played: true, result: { home: 1, away: 0 }, knockout: true }],
      championId: "nat_a", status: "finished",
      leaders: {
        p1: { name: "P1", nation: "A", squadId: "c", line: "FWD", apps: 4, goals: 5, assists: 1, ratingSum: 30 },
        p2: { name: "P2", nation: "B", squadId: "c", line: "GK", apps: 4, goals: 0, assists: 0, ratingSum: 28 },
        g1: { name: "G", nation: "B", squadId: "", line: "MID", apps: 5, goals: 9, assists: 0, ratingSum: 45, generated: true },
      },
    } as unknown as NationalCompetition;
    const a = computeTournamentAwards(comp, (id) => (id === "nat_a" ? "A" : "B"));
    expect(a.bestPlayer?.playerId).toBe("p1");
    expect(a.topScorer?.playerId).toBe("p1");
    expect(a.bestGoalkeeper?.playerId).toBe("p2");
    expect(a.shortlist[0]!.playerId).toBe("p1");
    expect(tournamentValueMult({ comp, awards: a, playerId: "p1", teamId: "nat_a", played: true })).toBe(1.15);
    expect(tournamentValueMult({ comp, awards: a, playerId: "p9", teamId: "nat_b", played: true })).toBe(1.08);
    expect(tournamentValueMult({ comp, awards: a, playerId: "p9", teamId: "nat_b", played: false })).toBe(1);
  });
});
