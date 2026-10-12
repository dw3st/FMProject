import { describe, expect, test } from "bun:test";
import {
  advanceTournament, buildQualifier, buildTournament, drawPots, groupStageComplete, pairFriendlies,
  qualifierGroupCount, qualifierQualified, tournamentPlacement, type DrawTeam,
} from "@/Domain/national/competitions";
import { qualifierDates } from "@/Domain/national/fifaCalendar";
import { mulberry32 } from "@/Domain/rng";
import type { Confed } from "@/types/registrationTypes";
import type { NationalCompetition } from "@/types/nationalTypes";

const teams = (n: number, confed: Confed = "UEFA"): DrawTeam[] =>
  Array.from({ length: n }, (_, i) => ({ id: `nat_${confed}_${i}`, confed, elo: 2000 - i * 10 }));

/** Plays every unplayed fixture: the higher Elo wins 1-0 (knockout: always decided). */
function playAll(c: NationalCompetition, elo: Map<string, number>): NationalCompetition {
  return {
    ...c,
    fixtures: c.fixtures.map((f) => (f.played ? f : {
      ...f, played: true,
      result: (elo.get(f.home)! >= elo.get(f.away)!) ? { home: 1, away: 0 } : { home: 0, away: 1 },
    })),
  };
}

describe("national competitions", () => {
  test("pots: one team of each pot per group, confed cap respected when possible", () => {
    const list = [...teams(16, "UEFA"), ...teams(10, "CAF"), ...teams(9, "AFC"), ...teams(6, "CONMEBOL"), ...teams(6, "CONCACAF"), ...teams(1, "OFC")];
    const gs = drawPots(list, 12, mulberry32(1), (c) => Math.ceil(list.filter((t) => t.confed === c).length / 12));
    expect(gs).toHaveLength(12);
    expect(gs.every((g) => g.teams.length === 4)).toBe(true);
    const conf = new Map(list.map((t) => [t.id, t.confed]));
    for (const g of gs) for (const c of ["CAF", "AFC", "CONMEBOL", "CONCACAF"]) expect(g.teams.filter((id) => conf.get(id) === c).length).toBeLessThanOrEqual(1);
  });

  test("qualifier: UEFA 54 teams, 16 places, 18 dates → 13 groups; top places qualify", () => {
    expect(qualifierGroupCount(54, 16, 18)).toBe(13);
    const t = teams(54);
    const q = buildQualifier({ tournament: "wc", year: 2030, confed: "UEFA", teams: t, slots: 16, dates: qualifierDates(2030), seedKey: "s" });
    expect(q.groups).toHaveLength(13);
    expect(q.fixtures.every((f) => !!f.date)).toBe(true);
    const elo = new Map(t.map((x) => [x.id, x.elo]));
    const done = playAll(q, elo);
    expect(groupStageComplete(done)).toBe(true);
    const qual = qualifierQualified(done, (id) => elo.get(id)!);
    expect(qual).toHaveLength(16);
    expect(new Set(qual).size).toBe(16);
    expect(qual).toContain("nat_UEFA_0");
  });

  test("a confederation with no more teams than places qualifies without games", () => {
    const q = buildQualifier({ tournament: "wc", year: 2030, confed: "OFC", teams: teams(1, "OFC"), slots: 1, dates: qualifierDates(2030), seedKey: "s" });
    expect(q.status).toBe("finished");
    expect(q.qualified).toEqual(["nat_OFC_0"]);
  });

  test("tournament: World Cup 48 → 72 group games, 32 in the knockout, champion and placements", () => {
    const t = [...teams(16, "UEFA"), ...teams(10, "CAF"), ...teams(9, "AFC"), ...teams(6, "CONMEBOL"), ...teams(6, "CONCACAF"), ...teams(1, "OFC")]
      .map((x, i) => ({ ...x, elo: 2000 - i }));
    const elo = new Map(t.map((x) => [x.id, x.elo]));
    let c = buildTournament({ tournament: "wc", year: 2030, teams: t, seedKey: "s" });
    expect(c.fixtures).toHaveLength(72);
    let eliminated = 0;
    for (let step = 0; step < 10 && c.status !== "finished"; step++) {
      c = playAll(c, elo);
      const r = advanceTournament(c, (id) => elo.get(id)!);
      c = r.comp;
      eliminated += r.change.eliminated.length;
    }
    expect(c.status).toBe("finished");
    expect(c.championId).toBe(t[0]!.id);
    expect(eliminated).toBe(48);
    expect(c.fixtures).toHaveLength(72 + 16 + 8 + 4 + 2 + 1);
    expect(tournamentPlacement(c, t[0]!.id)).toBe(1);
    expect(tournamentPlacement(c, t[47]!.id)).toBe(33);
  });

  test("friendlies: disjoint pairs, never the avoided opponent", () => {
    const t = [...teams(7, "CAF"), ...teams(4, "AFC")];
    const pairs = pairFriendlies(t, mulberry32(3), new Map([["nat_CAF_0", "nat_CAF_1"], ["nat_CAF_1", "nat_CAF_0"]]));
    const ids = pairs.flat();
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(10);
    expect(pairs.some(([a, b]) => (a === "nat_CAF_0" && b === "nat_CAF_1") || (a === "nat_CAF_1" && b === "nat_CAF_0"))).toBe(false);
  });
});
