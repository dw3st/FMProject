import { describe, expect, test } from "bun:test";
import {
  applyCompetitionEvent,
  applyMatchResult,
  applyPurchase,
  applyTransferSale,
  applyWeekly,
  boardBonus,
  carryIntoNewSeason,
  evaluateSeason,
  followersAfterMood,
  initialBoardState,
  isDerby,
  isIdol,
  objectiveFor,
  reviewBoardStatus,
  snapshotBoard,
  stadiumFillRate,
  trendOf,
} from "@/Domain/boardFans/boardFans";
import { BOARD_FANS } from "@/Domain/boardFans/boardFansConfig";
import type { BoardState, SeasonObjective } from "@/types/boardTypes";
import type { LeagueZone, RosterPlayer, Squad } from "@/types/playerTypes";

const objective: SeasonObjective = { kind: "mid_table", target: 14, leagueSlug: "pl", leagueSize: 20, season: "2026-27" };
const base = (over: Partial<BoardState> = {}): BoardState => ({ ...initialBoardState("2026-08-01", objective), ...over });

const ZONES: LeagueZone[] = [
  { id: "ucl", label: "UCL", color: "blue", from: 1, to: 4 },
  { id: "uel", label: "UEL", color: "orange", from: 5, to: 5 },
  { id: "uecl", label: "UECL", color: "cyan", from: 6, to: 6 },
  { id: "rel", label: "Rel", color: "red", fromEnd: 3 },
];
const clubs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ squadId: `c${i + 1}`, level: 6 - i * 0.1, tier: "MEDIUM" as const }));

describe("initial state", () => {
  test("starts at 60/60 with the objective and an empty record", () => {
    const s = initialBoardState("2026-08-01", objective);
    expect(s.board).toBe(60);
    expect(s.fans).toBe(60);
    expect(s.objective).toEqual(objective);
    expect(s.record).toEqual({ startDate: "2026-08-01", played: 0, wins: 0, draws: 0, losses: 0, titles: [] });
    expect(s.history).toEqual([]);
  });
});

describe("objectiveFor", () => {
  const args = (squadId: string) => ({ squadId, clubs: clubs(20), zones: ZONES, leagueSlug: "pl", season: "2026-27" });
  test("the strongest club must win the title", () => {
    expect(objectiveFor(args("c1"))).toMatchObject({ kind: "title", target: 1, leagueSize: 20 });
    expect(objectiveFor(args("c2")).kind).toBe("title");
  });
  test("a top-6 club must qualify for a continental competition", () => {
    expect(objectiveFor(args("c4"))).toMatchObject({ kind: "continental", target: 6 });
  });
  test("top half, mid table, avoid relegation by expected rank", () => {
    expect(objectiveFor(args("c9"))).toMatchObject({ kind: "top_half", target: 10 });
    expect(objectiveFor(args("c13"))).toMatchObject({ kind: "mid_table", target: 14 });
    expect(objectiveFor(args("c18"))).toMatchObject({ kind: "avoid_relegation", target: 17 });
  });
  test("league without continental zones only uses positions", () => {
    const o = objectiveFor({ ...args("c4"), zones: [] });
    expect(o.kind).toBe("top_half");
  });
  test("financial tier shifts the expected rank", () => {
    const cs = clubs(20).map((c) => (c.squadId === "c3" ? { ...c, tier: "ELITE" as const } : c));
    expect(objectiveFor({ ...args("c3"), clubs: cs }).kind).toBe("title");
  });
});

describe("applyMatchResult", () => {
  test("a win lifts both meters and counts in the record", () => {
    const s = applyMatchResult(base(), { goalsFor: 2, goalsAgainst: 0, home: true, derby: false });
    expect(s.fans).toBeGreaterThan(60);
    expect(s.board).toBeGreaterThan(60);
    expect(s.record).toMatchObject({ played: 1, wins: 1 });
    expect(s.recent).toEqual(["W"]);
  });
  test("a home loss hurts the fans more than an away loss", () => {
    const home = applyMatchResult(base(), { goalsFor: 0, goalsAgainst: 1, home: true, derby: false });
    const away = applyMatchResult(base(), { goalsFor: 0, goalsAgainst: 1, home: false, derby: false });
    expect(home.fans).toBeLessThan(away.fans);
  });
  test("a derby weighs 1.5x", () => {
    const normal = applyMatchResult(base({ recent: ["D", "D", "D", "D"] }), { goalsFor: 1, goalsAgainst: 0, home: false, derby: false });
    const derby = applyMatchResult(base({ recent: ["D", "D", "D", "D"] }), { goalsFor: 1, goalsAgainst: 0, home: false, derby: true });
    expect(derby.fans - 60).toBeGreaterThan(normal.fans - 60);
  });
  test("the last five results move the fans (form)", () => {
    const hot = applyMatchResult(base({ recent: ["W", "W", "W", "W"] }), { goalsFor: 1, goalsAgainst: 1, home: false, derby: false });
    const cold = applyMatchResult(base({ recent: ["L", "L", "L", "L"] }), { goalsFor: 1, goalsAgainst: 1, home: false, derby: false });
    expect(hot.fans).toBeGreaterThan(cold.fans);
    expect(hot.recent).toHaveLength(5);
    const six = applyMatchResult(base({ recent: ["W", "W", "W", "W", "W"] }), { goalsFor: 1, goalsAgainst: 1, home: false, derby: false });
    expect(six.recent).toEqual(["W", "W", "W", "W", "D"]);
  });
  test("league position vs the objective moves the board", () => {
    const above = applyMatchResult(base(), { goalsFor: 1, goalsAgainst: 1, home: false, derby: false, league: { position: 4, size: 20, played: 30, total: 38 } });
    const below = applyMatchResult(base(), { goalsFor: 1, goalsAgainst: 1, home: false, derby: false, league: { position: 19, size: 20, played: 30, total: 38 } });
    expect(above.board).toBeGreaterThan(60);
    expect(below.board).toBeLessThan(60);
  });
  test("meters stay within 0..100", () => {
    let s = base({ fans: 1, board: 1 });
    for (let i = 0; i < 10; i++) s = applyMatchResult(s, { goalsFor: 0, goalsAgainst: 5, home: true, derby: true, league: { position: 20, size: 20, played: 38, total: 38 } });
    expect(s.fans).toBe(0);
    expect(s.board).toBe(0);
    let w = base({ fans: 99, board: 99 });
    for (let i = 0; i < 10; i++) w = applyMatchResult(w, { goalsFor: 5, goalsAgainst: 0, home: true, derby: true, league: { position: 1, size: 20, played: 38, total: 38 } });
    expect(w.fans).toBe(100);
    expect(w.board).toBe(100);
  });
  test("an ultimatum counts league points", () => {
    const s = applyMatchResult(base({ ultimatum: { since: "x", matchesLeft: 5, pointsNeeded: 7, points: 0 } }), {
      goalsFor: 2, goalsAgainst: 1, home: true, derby: false, league: { position: 18, size: 20, played: 10, total: 38 },
    });
    expect(s.ultimatum).toEqual({ since: "x", matchesLeft: 4, pointsNeeded: 7, points: 3 });
    const cup = applyMatchResult(base({ ultimatum: { since: "x", matchesLeft: 5, pointsNeeded: 7, points: 0 } }), {
      goalsFor: 2, goalsAgainst: 1, home: true, derby: false,
    });
    expect(cup.ultimatum?.matchesLeft).toBe(5);
  });
});

describe("events and transfers", () => {
  test("a title lifts both meters and is recorded", () => {
    const s = applyCompetitionEvent(base(), { kind: "title", title: "cup:cup_england" });
    expect(s.board).toBe(60 + BOARD_FANS.events.TITLE_BOARD);
    expect(s.fans).toBe(60 + BOARD_FANS.events.TITLE_FANS);
    expect(s.record.titles).toEqual(["cup:cup_england"]);
  });
  test("an early elimination is a small minus, a stage won a small plus", () => {
    expect(applyCompetitionEvent(base(), { kind: "early_exit" }).board).toBeLessThan(60);
    expect(applyCompetitionEvent(base(), { kind: "stage" }).fans).toBeGreaterThan(60);
  });
  test("a big sale pleases the board, selling an idol angers the fans", () => {
    const big = applyTransferSale(base(), { fee: 20_000_000, annualRevenue: 100_000_000, idol: false });
    expect(big.board).toBe(63);
    expect(big.fans).toBe(60);
    const idol = applyTransferSale(base(), { fee: 1_000_000, annualRevenue: 100_000_000, idol: true });
    expect(idol.board).toBe(60);
    expect(idol.fans).toBe(52);
  });
  test("a purchase that leaves the balance negative costs board confidence", () => {
    expect(applyPurchase(base(), { balanceAfter: -1 }).board).toBe(56);
    expect(applyPurchase(base(), { balanceAfter: 10 }).board).toBe(60);
  });
  test("isIdol: best overall, or 4+ seasons at the club", () => {
    const p = (id: string, v: number, history: RosterPlayer["history"] = []): RosterPlayer =>
      ({ id, name: id, overallAvg: v, positions: ["Midfielder"], history } as unknown as RosterPlayer);
    const row = (season: string) => ({ season, squadId: "me" } as NonNullable<RosterPlayer["history"]>[number]);
    const squad = { id: "me", players: [p("a", 8), p("b", 4), p("c", 3, [row("1"), row("2"), row("3"), row("4")])] } as unknown as Squad;
    expect(isIdol(squad.players[0]!, squad)).toBe(true);
    expect(isIdol(squad.players[1]!, squad)).toBe(false);
    expect(isIdol(squad.players[2]!, squad)).toBe(true);
  });
  test("isDerby: same city, or the league leader", () => {
    expect(isDerby({ myCity: "London", opponentCity: "london", opponentIsLeader: false })).toBe(true);
    expect(isDerby({ myCity: "London", opponentCity: "Leeds", opponentIsLeader: false })).toBe(false);
    expect(isDerby({ myCity: "", opponentCity: "", opponentIsLeader: false })).toBe(false);
    expect(isDerby({ myCity: "London", opponentCity: "Leeds", opponentIsLeader: true })).toBe(true);
  });
});

describe("weekly", () => {
  test("a negative balance drags the board down, a positive one holds it", () => {
    expect(applyWeekly(base(), { balance: -1, weeklyRevenue: 1_000_000 }).board).toBeLessThan(60);
    expect(applyWeekly(base(), { balance: 5, weeklyRevenue: 1_000_000 }).board).toBeGreaterThanOrEqual(60);
  });
  test("drift towards 60", () => {
    const hi = applyWeekly(base({ board: 90, fans: 90 }), { balance: 0, weeklyRevenue: 1 });
    expect(hi.fans).toBeLessThan(90);
    expect(hi.fans).toBeGreaterThan(60);
    const lo = applyWeekly(base({ board: 20, fans: 20 }), { balance: 0, weeklyRevenue: 1 });
    expect(lo.fans).toBeGreaterThan(20);
  });
});

describe("reviewBoardStatus", () => {
  test("warning once below 35", () => {
    const r = reviewBoardStatus(base({ board: 34 }), { sackingEnabled: true, date: "d" });
    expect(r.messages).toEqual(["warning"]);
    expect(reviewBoardStatus(r.state, { sackingEnabled: true, date: "d" }).messages).toEqual([]);
    expect(reviewBoardStatus({ ...r.state, board: 45 }, { sackingEnabled: true, date: "d" }).state.warned).toBe(false);
  });
  test("ultimatum below 25 only with sacking enabled", () => {
    const on = reviewBoardStatus(base({ board: 24, warned: true }), { sackingEnabled: true, date: "d" });
    expect(on.messages).toEqual(["ultimatum"]);
    expect(on.state.ultimatum).toEqual({ since: "d", matchesLeft: 5, pointsNeeded: 7, points: 0 });
    const off = reviewBoardStatus(base({ board: 24, warned: true }), { sackingEnabled: false, date: "d" });
    expect(off.messages).toEqual([]);
    expect(off.state.ultimatum).toBeUndefined();
  });
  test("sacked below 15 only with sacking enabled", () => {
    expect(reviewBoardStatus(base({ board: 14, warned: true }), { sackingEnabled: true, date: "d" }).sacked).toBe("board");
    const off = reviewBoardStatus(base({ board: 0, warned: true }), { sackingEnabled: false, date: "d" });
    expect(off.sacked).toBeNull();
  });
  test("an ultimatum not met sacks; met clears it", () => {
    const failed = reviewBoardStatus(
      base({ board: 30, warned: true, ultimatum: { since: "x", matchesLeft: 0, pointsNeeded: 7, points: 4 } }),
      { sackingEnabled: true, date: "d" },
    );
    expect(failed.sacked).toBe("ultimatum");
    const met = reviewBoardStatus(
      base({ board: 30, warned: true, ultimatum: { since: "x", matchesLeft: 2, pointsNeeded: 7, points: 7 } }),
      { sackingEnabled: true, date: "d" },
    );
    expect(met.sacked).toBeNull();
    expect(met.state.ultimatum).toBeUndefined();
    expect(met.messages).toEqual(["ultimatum_met"]);
    expect(met.state.board).toBe(35);
  });
  test("praise once above 80", () => {
    const r = reviewBoardStatus(base({ board: 81 }), { sackingEnabled: true, date: "d" });
    expect(r.messages).toEqual(["praise"]);
    expect(reviewBoardStatus(r.state, { sackingEnabled: true, date: "d" }).messages).toEqual([]);
  });
});

describe("season end", () => {
  test("objective met raises the board, missed lowers it", () => {
    expect(evaluateSeason(base(), { position: 10 }).board).toBeGreaterThan(60);
    expect(evaluateSeason(base(), { position: 18 }).board).toBeLessThan(60);
    expect(evaluateSeason(base(), { position: null }).board).toBe(60);
  });
  test("bonus only from 75", () => {
    expect(boardBonus(74, 100_000_000)).toBe(0);
    expect(boardBonus(75, 100_000_000)).toBe(2_000_000);
    expect(boardBonus(100, 100_000_000)).toBe(6_000_000);
  });
  test("carry: half the distance to 60 stays, ultimatum cleared, new objective", () => {
    const next: SeasonObjective = { ...objective, season: "2027-28", kind: "top_half", target: 10 };
    const s = carryIntoNewSeason(base({ board: 80, fans: 40, ultimatum: { since: "x", matchesLeft: 1, pointsNeeded: 7, points: 0 } }), next);
    expect(s.board).toBe(70);
    expect(s.fans).toBe(50);
    expect(s.ultimatum).toBeUndefined();
    expect(s.objective).toEqual(next);
  });
});

describe("history, trend and effects", () => {
  test("one snapshot per day, trimmed", () => {
    let s = base();
    for (let d = 1; d <= 20; d++) s = snapshotBoard({ ...s, board: 60 + d }, `2026-08-${String(d).padStart(2, "0")}`);
    s = snapshotBoard(s, "2026-08-20");
    expect(s.history).toHaveLength(BOARD_FANS.HISTORY_DAYS);
    expect(s.history.at(-1)).toEqual({ date: "2026-08-20", board: 80, fans: 60 });
    expect(trendOf(s.history, "2026-08-20", "board")).toBe(7);
    expect(trendOf([], "2026-08-20", "board")).toBeNull();
  });
  test("stadium fill: 0.45 empty, 0.65 at 60, 0.9 full", () => {
    expect(stadiumFillRate(0)).toBeCloseTo(0.45);
    expect(stadiumFillRate(60)).toBeCloseTo(0.65);
    expect(stadiumFillRate(100)).toBeCloseTo(0.9);
  });
  test("followers gain scales 0.8..1.2", () => {
    expect(followersAfterMood(1000, 2000, 60)).toBe(2000);
    expect(followersAfterMood(1000, 2000, 100)).toBe(2200);
    expect(followersAfterMood(1000, 2000, 0)).toBe(1800);
    expect(followersAfterMood(2000, 1000, 100)).toBe(1200);
  });
});
