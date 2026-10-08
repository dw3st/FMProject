import { describe, expect, test } from "bun:test";
import { computeLeagueAwards, leagueCandidates, managerAwardScore, pickTeamOfSeason, seasonScore } from "@/Domain/awards/leagueAwards";
import type { ManagerRecord } from "@/types/managerTypes";
import type { RosterPlayer, Squad, StandingRow } from "@/types/playerTypes";

const STATS = {
  passing: 5, vision: 5, finishing: 5, dribbling: 5, speed: 5, acceleration: 5,
  tackling: 5, pressing: 5, stamina: 5, heading: 5, strength: 5, reflex: 5, jump: 5,
};

interface MkOpts {
  apps: number; goals?: number; assists?: number; rating: number; age?: number; cup?: number;
  titles?: string[]; natural?: string; league?: string; partial?: boolean;
}

/** Player with the closing row of `season`/`league` (the squad already aged at the transition). */
function mk(id: string, pos: string, o: MkOpts): RosterPlayer {
  return {
    id, name: id, age: (o.age ?? 25) + 1, positions: [pos], stats: { ...STATS }, preferredFoot: "right",
    ...(o.natural ? { naturalPosition: o.natural } : {}),
    history: [{
      season: "2026-27", squadId: "c1", clubName: "C1", league: o.league ?? "pl",
      apps: o.apps + (o.cup ?? 0), goals: o.goals ?? 0, assists: o.assists ?? 0, avgRating: o.rating,
      cupApps: o.cup ?? 0, cupGoals: 0, contApps: 0, contGoals: 0, yellowCards: 0, redCards: 0, injuries: 0, daysInjured: 0,
      titles: o.titles ?? [], ...(o.partial ? { partial: true as const } : {}),
    }],
  } as never;
}
const squadOf = (id: string, players: RosterPlayer[]): Squad => ({ id, name: id.toUpperCase(), colors: ["#000", "#fff"], players } as never);

function fixtureSquad(): Squad {
  return squadOf("c1", [
    mk("gk1", "GK", { apps: 30, rating: 6.8, natural: "GK" }),
    mk("gk2", "GK", { apps: 30, rating: 6.1, natural: "GK" }),
    mk("lb", "Defender", { apps: 30, rating: 6.9, natural: "LB" }),
    mk("cb1", "Defender", { apps: 30, rating: 7.1, natural: "CB" }),
    mk("cb2", "Defender", { apps: 30, rating: 7.0, natural: "CB" }),
    mk("rb", "Defender", { apps: 30, rating: 6.7, natural: "RB" }),
    mk("cb3", "Defender", { apps: 30, rating: 6.2, natural: "CB" }),
    mk("cm1", "Midfielder", { apps: 30, rating: 7.2, natural: "CM" }),
    mk("cm2", "Midfielder", { apps: 30, rating: 6.9, natural: "CM" }),
    mk("cam", "Midfielder", { apps: 30, rating: 7.3, natural: "CAM" }),
    mk("cm3", "Midfielder", { apps: 30, rating: 6.0, natural: "CM" }),
    mk("lw", "Forward", { apps: 30, rating: 7.0, natural: "LW" }),
    mk("st", "Forward", { apps: 30, rating: 7.5, natural: "ST" }),
    mk("rw", "Forward", { apps: 30, rating: 6.9, natural: "RW" }),
    mk("st2", "Forward", { apps: 30, rating: 6.3, natural: "ST" }),
  ]);
}

const base = {
  league: "pl", season: "2026-27", closedOn: "2027-05-20", country: "England", tier: 1, weight: 1,
  totalRounds: 38, table: [] as StandingRow[], managers: [] as ManagerRecord[], targets: new Map<string, number>(),
  tierChanges: {}, seasonMid: "2027-01-01",
};

describe("league candidates", () => {
  test("league numbers subtract cups; age is the season age", () => {
    const c = leagueCandidates([squadOf("c1", [mk("p", "Forward", { apps: 20, goals: 9, rating: 7, cup: 3 })])], "pl", "2026-27");
    expect(c[0]).toMatchObject({ leagueApps: 20, leagueGoals: 9, age: 25, line: "Forward", squadId: "c1", clubName: "C1" });
  });
  test("only the closing row of this league and season, never a partial", () => {
    const c = leagueCandidates([squadOf("c1", [
      mk("a", "Forward", { apps: 20, rating: 7, league: "other" }),
      mk("b", "Forward", { apps: 20, rating: 7, partial: true }),
      mk("c", "Forward", { apps: 20, rating: 7 }),
    ])], "pl", "2026-27");
    expect(c.map((x) => x.player.id)).toEqual(["c"]);
  });
});

describe("computeLeagueAwards", () => {
  test("min games for rating awards, young ≤ 21, top scorer without minimum, keeper from the GK line", () => {
    const squad = squadOf("c1", [
      mk("star", "Midfielder", { apps: 30, rating: 7.4 }),
      mk("cameo", "Midfielder", { apps: 5, rating: 9.0 }),
      mk("kid", "Forward", { apps: 25, rating: 7.0, age: 20, goals: 4 }),
      mk("nine", "Forward", { apps: 12, rating: 6.4, goals: 15 }),
      mk("gk", "GK", { apps: 38, rating: 6.9 }),
    ]);
    const a = computeLeagueAwards({ ...base, squads: [squad] });
    expect(a.bestPlayer?.playerId).toBe("star"); // cameo has 5 < 19 games
    expect(a.youngPlayer?.playerId).toBe("kid");
    expect(a.topScorer).toMatchObject({ playerId: "nine", value: 15 });
    expect(a.bestGoalkeeper?.playerId).toBe("gk");
    expect(a.shortlist.players.map((p) => p.playerId)).not.toContain("cameo");
  });
  test("no goal in the league: no top scorer; no young player when nobody qualifies", () => {
    const a = computeLeagueAwards({ ...base, squads: [squadOf("c1", [mk("a", "Midfielder", { apps: 30, rating: 7 })])] });
    expect(a.topScorer).toBeUndefined();
    expect(a.youngPlayer).toBeUndefined();
  });
  test("top scorer tie-break: fewer league games, then rating", () => {
    const a = computeLeagueAwards({ ...base, squads: [squadOf("c1", [
      mk("a", "Forward", { apps: 30, rating: 7.5, goals: 10 }),
      mk("b", "Forward", { apps: 25, rating: 6.5, goals: 10 }),
    ])] });
    expect(a.topScorer?.playerId).toBe("b");
  });
  test("team of the season: 11, the 4-3-3 slots, best aptitude per slot", () => {
    const xi = pickTeamOfSeason(leagueCandidates([fixtureSquad()], "pl", "2026-27"), 19);
    expect(xi.map((p) => p.slot)).toEqual(["GK", "LB", "CB", "CB", "RB", "CM", "CM", "CAM", "LW", "ST", "RW"]);
    expect(new Set(xi.map((p) => p.playerId)).size).toBe(11);
    expect(xi.map((p) => p.playerId)).toEqual(["gk1", "lb", "cb1", "cb2", "rb", "cm1", "cm2", "cam", "lw", "st", "rw"]);
  });
  test("team of the season completes a short line with players of ≥ 1 league game", () => {
    const sq = fixtureSquad();
    sq.players = sq.players.map((p) => (p.id === "gk1" || p.id === "gk2"
      ? mk(p.id, "GK", { apps: 3, rating: p.id === "gk1" ? 6 : 7, natural: "GK" })
      : p));
    const xi = pickTeamOfSeason(leagueCandidates([sq], "pl", "2026-27"), 19);
    expect(xi[0]).toMatchObject({ slot: "GK", playerId: "gk2" });
  });
  test("manager: beats the target most; champion bonus; late hire excluded", () => {
    expect(managerAwardScore({ position: 3, target: 10, size: 20, champion: false, promoted: false })).toBeCloseTo(0.35);
    expect(managerAwardScore({ position: 1, target: 1, size: 20, champion: true, promoted: false })).toBeCloseTo(0.3);
    const row = (squadId: string, pts: number): StandingRow => ({
      squadId, name: squadId.toUpperCase(), colors: ["#000", "#fff"], mp: 38, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts, form: [],
    });
    const m = (id: string, squadId: string, hiredOn?: string): ManagerRecord => ({
      id, name: id, squadId, isPlayer: false, points: 0, seasons: 0, titles: [], ...(hiredOn ? { hiredOn } : {}),
    });
    const table = [row("a", 80), row("b", 70), row("c", 60), row("d", 50)];
    const a = computeLeagueAwards({
      ...base, squads: [], table,
      managers: [m("ma", "a"), m("mb", "b"), m("mc", "c", "2027-03-01"), m("md", "d")],
      targets: new Map([["a", 1], ["b", 4], ["c", 4], ["d", 4]]),
    });
    // a: 0 + 0.3 = 0.3; b: (4 − 2)/4 = 0.5; c: hired after mid-season; d: 0
    expect(a.bestManager).toMatchObject({ managerId: "mb", squadId: "b", clubName: "B", position: 2, target: 4 });
    expect(a.bestManager!.score).toBeCloseTo(0.5);
    expect(a.shortlist.managers.map((x) => x.managerId)).toEqual(["mb", "ma", "md"]);
  });
  test("promotion bonus", () => {
    const row: StandingRow = { squadId: "a", name: "A", colors: ["#000", "#fff"], mp: 38, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 1, form: [] };
    const a = computeLeagueAwards({
      ...base, squads: [], table: [row], targets: new Map([["a", 1]]),
      managers: [{ id: "ma", name: "ma", squadId: "a", isPlayer: false, points: 0, seasons: 0, titles: [] }],
      tierChanges: { a: { from: 2, to: 1 } },
    });
    expect(a.bestManager!.score).toBeCloseTo(0.3 + 0.15);
  });
  test("season score", () => {
    expect(seasonScore({ avgRating: 7, goals: 10, assists: 5, titles: ["league:pl", "continental:ucl"] })).toBeCloseTo(7 + 0.3 + 0.1 + 0.15 + 0.3);
  });
  test("deterministic tie-break of the best player: goals + assists, then id", () => {
    const a = computeLeagueAwards({ ...base, squads: [squadOf("c1", [
      mk("b", "Midfielder", { apps: 30, rating: 7, goals: 2 }),
      mk("a", "Midfielder", { apps: 30, rating: 7, goals: 2 }),
      mk("c", "Midfielder", { apps: 30, rating: 7, goals: 1 }),
    ])] });
    expect(a.bestPlayer?.playerId).toBe("a");
  });
  test("the goal of the season passes through", () => {
    const goal = { key: "f:10:p", fixtureId: "f", date: "2027-01-01", playerId: "p", playerName: "P", squadId: "c1", opponentId: "c2", minute: 10, header: true, distance: 9 };
    expect(computeLeagueAwards({ ...base, squads: [], goalOfSeason: goal }).goalOfSeason).toEqual(goal);
    expect(computeLeagueAwards({ ...base, squads: [] }).goalOfSeason).toBeUndefined();
  });
});
