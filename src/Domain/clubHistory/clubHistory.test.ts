import { describe, expect, test } from "bun:test";
import type { Fixture } from "@/types/calendarTypes";
import type { StandingRow } from "@/types/playerTypes";
import {
  applySeason, applyTransfer, clubMatchesOf, emptyClubHistory, longestUnbeaten, titleGallery, topPlayers,
  type ClubMatch, type ClubSeasonInput,
} from "@/Domain/clubHistory/clubHistory";

const standing = (over: Partial<StandingRow> = {}): StandingRow => ({
  squadId: "A", name: "A", mp: 38, w: 20, d: 10, l: 8, gf: 60, ga: 40, gd: 20, pts: 70, form: [], ...over,
} as StandingRow);

const m = (date: string, gf: number, ga: number, competition = "pl", opp = "B"): ClubMatch =>
  ({ date, competition, opponentId: opp, opponentName: `Club ${opp}`, gf, ga });

function input(over: Partial<ClubSeasonInput> = {}): ClubSeasonInput {
  return {
    season: "2026-27", league: "pl", tier: 1, standing: standing(), position: 3, titles: [],
    players: [
      { playerId: "p1", name: "Striker", row: { goals: 20, apps: 30, assists: 3 } },
      { playerId: "p2", name: "Mid", row: { goals: 5, apps: 34, assists: 9 } },
    ],
    matches: [m("2026-08-20", 3, 0), m("2026-08-27", 1, 1), m("2026-09-03", 0, 2), m("2026-09-10", 2, 1)],
    ...over,
  };
}

describe("clubMatchesOf", () => {
  const fx = (id: string, date: string, home: string, away: string, h: number, a: number, played = true): Fixture =>
    ({ id, date, competition: "pl", round: 1, home, away, played, result: played ? { home: h, away: a } : null });
  test("club point of view, played only, sorted, windowed", () => {
    const out = clubMatchesOf([
      fx("2", "2026-09-01", "B", "A", 2, 5),
      fx("1", "2026-08-01", "A", "C", 1, 0),
      fx("3", "2026-09-05", "A", "D", 0, 0, false),
      fx("4", "2026-09-06", "C", "D", 1, 0),
      fx("5", "2027-07-01", "A", "C", 9, 0),
    ], "A", (id) => `N${id}`, { from: "2026-07-01", to: "2027-06-01" });
    expect(out.map((x) => [x.opponentId, x.gf, x.ga, x.opponentName])).toEqual([["C", 1, 0, "NC"], ["B", 5, 2, "NB"]]);
  });
});

describe("applySeason", () => {
  test("season row, top scorer, scorers and first records (nothing broken)", () => {
    const { history, broken } = applySeason(emptyClubHistory("A"), input({ titles: ["cup:cup_x"], manager: "Boss" }));
    expect(broken).toEqual([]);
    const row = history.seasons[0]!;
    expect(row).toMatchObject({ season: "2026-27", position: 3, played: 38, won: 20, points: 70, titles: ["cup:cup_x"], manager: "Boss" });
    expect(row.topScorer).toEqual({ playerId: "p1", name: "Striker", goals: 20 });
    expect(history.scorers.p2).toEqual({ name: "Mid", goals: 5, apps: 34, assists: 9 });
    expect(history.records.biggestWin).toMatchObject({ gf: 3, ga: 0, opponentName: "Club B" });
    expect(history.records.biggestLoss).toMatchObject({ gf: 0, ga: 2 });
    expect(history.records.unbeaten).toMatchObject({ matches: 2, from: "2026-08-20", to: "2026-08-27" });
    expect(history.records.highestFinish).toEqual({ season: "2026-27", league: "pl", tier: 1, position: 3 });
    expect(history.records.mostGoalsSeason).toMatchObject({ playerId: "p1", goals: 20 });
  });

  test("idempotent for the same season", () => {
    const once = applySeason(emptyClubHistory("A"), input()).history;
    const twice = applySeason(once, input());
    expect(twice.history).toBe(once);
    expect(twice.broken).toEqual([]);
  });

  test("next season beats records and reports them; totals add up", () => {
    const first = applySeason(emptyClubHistory("A"), input()).history;
    const { history, broken } = applySeason(first, input({
      season: "2027-28", position: 1, titles: ["league:pl"],
      players: [{ playerId: "p1", name: "Striker", row: { goals: 25, apps: 32, assists: 4 } }],
      matches: [m("2027-08-20", 5, 0), m("2027-08-27", 1, 0), m("2027-09-03", 1, 0), m("2027-09-10", 0, 0)],
    }));
    expect(broken.map((b) => b.kind).sort()).toEqual(["biggestWin", "highestFinish", "mostGoalsSeason", "unbeaten"]);
    expect(history.scorers.p1).toEqual({ name: "Striker", goals: 45, apps: 62, assists: 7 });
    expect(history.records.biggestLoss).toMatchObject({ season: "2026-27" });
  });

  test("lower tier never beats a higher tier finish", () => {
    const first = applySeason(emptyClubHistory("A"), input({ position: 18 })).history;
    const { history } = applySeason(first, input({ season: "2027-28", league: "ch", tier: 2, position: 1 }));
    expect(history.records.highestFinish).toMatchObject({ tier: 1, position: 18 });
  });

  test("a mid-season departure counts for the season top scorer and is settled", () => {
    const sold = applyTransfer(emptyClubHistory("A"), {
      side: "sale",
      record: { playerId: "p9", name: "Gone", fee: 10, season: "2026-27", date: "2027-01-10", clubId: "Z", clubName: "Z" },
      partial: { playerId: "p9", name: "Gone", season: "2026-27", row: { goals: 22, apps: 18, assists: 1 } },
    }).history;
    expect(sold.scorers.p9!.goals).toBe(22);
    const { history } = applySeason(sold, input());
    expect(history.seasons[0]!.topScorer).toMatchObject({ playerId: "p9", goals: 22 });
    expect(history.openPartials).toBeUndefined();
    expect(history.scorers.p9!.goals).toBe(22);
  });
});

describe("applyTransfer", () => {
  const rec = (fee: number) => ({ playerId: "x", name: "X", fee, season: "2026-27", date: "2026-09-01", clubId: "B", clubName: "B" });
  test("first signing is a record, a bigger one breaks it, a smaller one doesn't", () => {
    let h = applyTransfer(emptyClubHistory("A"), { side: "signing", record: rec(5) });
    expect(h.broken).toEqual([]);
    h = applyTransfer(h.history, { side: "signing", record: rec(3) });
    expect(h.broken).toEqual([]);
    expect(h.history.records.recordSigning!.fee).toBe(5);
    h = applyTransfer(h.history, { side: "signing", record: rec(8) });
    expect(h.broken.map((b) => b.kind)).toEqual(["recordSigning"]);
  });
  test("zero fee is no record", () => {
    expect(applyTransfer(emptyClubHistory("A"), { side: "sale", record: rec(0) }).history.records.recordSale).toBeUndefined();
  });
});

describe("helpers", () => {
  test("longestUnbeaten", () => {
    expect(longestUnbeaten([m("1", 0, 1)])).toBeNull();
    expect(longestUnbeaten([m("1", 1, 0), m("2", 0, 1), m("3", 0, 0), m("4", 2, 2), m("5", 3, 1)]))
      .toEqual({ matches: 3, from: "3", to: "5" });
  });
  test("titleGallery groups by competition", () => {
    const g = titleGallery([
      { titles: ["league:pl", "cup:c"], season: "1" },
      { titles: ["league:pl", "continental:ucl"], season: "2" },
    ] as never);
    expect(g).toEqual([
      { title: "continental:ucl", seasons: ["2"] },
      { title: "league:pl", seasons: ["1", "2"] },
      { title: "cup:c", seasons: ["1"] },
    ]);
  });
  test("topPlayers", () => {
    const s = { a: { name: "A", goals: 3, apps: 10, assists: 0 }, b: { name: "B", goals: 9, apps: 5, assists: 0 }, c: { name: "C", goals: 0, apps: 40, assists: 0 } };
    expect(topPlayers(s, "goals").map((x) => x.playerId)).toEqual(["b", "a"]);
    expect(topPlayers(s, "apps").map((x) => x.playerId)).toEqual(["c", "a", "b"]);
  });
});
