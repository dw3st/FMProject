import { describe, expect, test } from "bun:test";
import { closeCountrySeason, emptyRefereeState, pruneRefereeState, recordMatches, refereeRows } from "@/Domain/referees/stats";
import type { MatchEvent, MatchTeamStats } from "@/types/dayLogTypes";

const ts = (o: Partial<MatchTeamStats>) => ({ passes: 0, ...o }) as unknown as MatchTeamStats;
const ev = (id: string, ref: string | null, o: Partial<MatchEvent> = {}): MatchEvent => ({
  kind: "match", fixtureId: id, competition: "premier_league", round: 1, home: `h${id}`, away: `a${id}`,
  score: { home: 0, away: 0 }, teamStats: { home: ts({ fouls: 6, penaltiesAwarded: 1 }), away: ts({ fouls: 5 }) },
  playerStats: {}, playerRatings: {}, playerNames: {}, playerTeams: {}, scorers: [], substitutions: [],
  cards: [
    { team: "home", playerId: "p1", playerName: "x", card: "yellow", secondYellow: false, matchMinute: 10 },
    { team: "away", playerId: "p2", playerName: "y", card: "yellow", secondYellow: false, matchMinute: 20 },
    { team: "away", playerId: "p2", playerName: "y", card: "red", secondYellow: true, matchMinute: 30 },
  ],
  developmentChanges: [], durationMs: 0, ...(ref ? { referee: { id: ref, name: ref, country: "England" } } : {}), ...o,
});

describe("recordMatches", () => {
  const state = { ...emptyRefereeState(), assignments: { "2027-01-10": { "premier_league:f1": { refereeId: "r1", assistantIds: ["a1", "a2"] as [string, string] } } } };
  const s = recordMatches(state, "2027-01-10", [ev("f1", "r1"), ev("f2", null), ev("f3", "r1", { competition: "cup_england" })]);
  test("sums matches, fouls, cards, penalties per competition", () => {
    expect(s.stats.r1!.matches).toBe(2);
    expect(s.stats.r1!.fouls).toBe(22);
    expect(s.stats.r1!.yellows).toBe(4);
    expect(s.stats.r1!.reds).toBe(2);
    expect(s.stats.r1!.penalties).toBe(2);
    expect(s.stats.r1!.byCompetition.cup_england!.matches).toBe(1);
  });
  test("lastWorked (referee and assistants), recentByClub", () => {
    expect(s.lastWorked).toMatchObject({ r1: "2027-01-10", a1: "2027-01-10", a2: "2027-01-10" });
    expect(s.recentByClub.hf1).toEqual(["r1"]);
  });
  test("idempotent per fixture", () => {
    const again = recordMatches(s, "2027-01-10", [ev("f1", "r1")]);
    expect(again.stats.r1!.matches).toBe(2);
  });
  test("recentByClub keeps three, most recent first", () => {
    let st = emptyRefereeState();
    for (const [i, r] of ["r1", "r2", "r3", "r4"].entries()) st = recordMatches(st, `2027-01-1${i}`, [ev("f1", r, { home: "c" })]);
    expect(st.recentByClub.c).toEqual(["r4", "r3", "r2"]);
  });
});

describe("prune and close", () => {
  test("prune keeps yesterday on", () => {
    const st = { ...emptyRefereeState(), assignments: { "2027-01-01": {}, "2027-01-09": {}, "2027-01-10": {} }, lastWorked: { x: "2026-12-01", y: "2027-01-08" } };
    const p = pruneRefereeState(st, "2027-01-10");
    expect(Object.keys(p.assignments).sort()).toEqual(["2027-01-09", "2027-01-10"]);
    expect(p.lastWorked).toEqual({ y: "2027-01-08" });
  });
  test("close moves the country's referees to the archive", () => {
    const st = recordMatches(emptyRefereeState(), "2027-01-10", [ev("f1", "r1"), ev("f2", "r2")]);
    const { state, archived } = closeCountrySeason(st, new Set(["r1"]));
    expect(Object.keys(archived)).toEqual(["r1"]);
    expect(Object.keys(state.stats)).toEqual(["r2"]);
  });
});

describe("refereeRows", () => {
  test("per match numbers, band, never the raw rigor", () => {
    const st = recordMatches(emptyRefereeState(), "2027-01-10", [ev("f1", "r1"), ev("f2", "r2", { cards: [] })]);
    const info = (id: string) => ({ name: id, country: "England", strictness: id === "r1" ? 0.8 : -0.5, fifa: false, gender: "male" as const, age: 40 });
    const rows = refereeRows(st.stats, info, "premier_league");
    expect(rows.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(rows[0]).toMatchObject({ matches: 1, foulsPerMatch: 11, yellowsPerMatch: 2, reds: 1, band: "strict" });
    expect(rows[1]!.band).toBe("lenient");
    expect("strictness" in rows[0]!).toBe(false);
    expect(refereeRows(st.stats, info, "cup_england")).toEqual([]);
  });
});
