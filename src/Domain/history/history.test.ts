import { describe, expect, test } from "bun:test";
import {
  addPendingTitle, closePartialSeason, closeSeasonForPlayers, historyRowFromLog, seasonLabel,
} from "@/Domain/history/history";
import { emptySeasonLog } from "@/types/playerTypes";
import type { RosterPlayer } from "@/types/playerTypes";

const club = { squadId: "s1", clubName: "Club", league: "premier_league" };
const log = (apps: number) => ({
  ...emptySeasonLog(), appearances: apps, goals: 3, assists: 2, avgRating: 7.123, fitness: 60, load: 40,
  cup: { appearances: 2, goals: 1, assists: 0 },
});
const player = (over: Partial<RosterPlayer> = {}): RosterPlayer =>
  ({ id: "p1", name: "P", age: 25, squadId: "s1", preferredFoot: "right", positions: ["ST"], stats: {} as never,
    profile: { summary: "", archetype: "" }, ...over }) as RosterPlayer;

describe("history", () => {
  test("seasonLabel", () => {
    expect(seasonLabel(2026, "2026-08-15", "2027-05-20")).toBe("2026-27");
    expect(seasonLabel(2027, "2027-02-05", "2027-11-30")).toBe("2027");
  });
  test("row from log, null without games", () => {
    expect(historyRowFromLog(log(0), club, "2027")).toBeNull();
    const r = historyRowFromLog(log(10), club, "2027", ["league:x"])!;
    expect(r.apps).toBe(10);
    expect(r.avgRating).toBe(7.12);
    expect(r.cupApps).toBe(2);
    expect(r.titles).toEqual(["league:x"]);
  });
  test("partial season appends an open row and leaves the seasonLog untouched", () => {
    const sl = { ...log(5), recentRatings: [7, 6.5], trainingSessions: 9 };
    const p = closePartialSeason(player({ seasonLog: sl }), club, "2027");
    expect(p.history!.length).toBe(1);
    expect(p.history![0]).toMatchObject({ apps: 5, partial: true, open: true, clubName: "Club" });
    expect(p.seasonLog).toBe(sl);
  });
  test("no partial row without games", () => {
    const p = player({ seasonLog: log(0) });
    expect(closePartialSeason(p, club, "2027")).toBe(p);
  });
  test("two transfers in a season: each row subtracts the earlier open partials", () => {
    const a = { squadId: "a", clubName: "A", league: "l" };
    const b = { squadId: "b", clubName: "B", league: "l" };
    const c = { squadId: "c", clubName: "C", league: "l" };
    // 4 games at A (rating 6), then 6 more at B (rating 8): log avg = (24 + 48) / 10 = 7.2.
    let p = player({ seasonLog: { ...emptySeasonLog(), appearances: 4, goals: 1, assists: 0, avgRating: 6,
      cup: { appearances: 1, goals: 1, assists: 0 } } });
    p = closePartialSeason(p, a, "2027");
    p = { ...p, seasonLog: { ...p.seasonLog!, appearances: 10, goals: 3, assists: 2, avgRating: 7.2,
      cup: { appearances: 2, goals: 1, assists: 0 } } };
    p = closePartialSeason(p, b, "2027");
    expect(p.history!.map((r) => r.apps)).toEqual([4, 6]);
    expect(p.history![1]).toMatchObject({ goals: 2, assists: 2, avgRating: 8, cupApps: 1, cupGoals: 0 });
    // 5 more at C (rating 7): log 15 games, avg (72 + 35) / 15.
    const closed = { ...emptySeasonLog(), appearances: 15, goals: 5, assists: 2, avgRating: 107 / 15,
      cup: { appearances: 2, goals: 1, assists: 0 } };
    const [out] = closeSeasonForPlayers([p], { p1: closed }, c, "2027", { c: ["league:l"] });
    expect(out!.history!.map((r) => r.apps)).toEqual([4, 6, 5]);
    expect(out!.history![2]).toMatchObject({ goals: 2, avgRating: 7, cupApps: 0, titles: ["league:l"] });
    expect(out!.history![2]!.partial).toBeUndefined();
    // Rollover settles the open partials: the next season does not subtract them again.
    expect(out!.history!.some((r) => r.open)).toBe(false);
    expect(out!.history![0]!.partial).toBe(true);
    const [next] = closeSeasonForPlayers([out!], { p1: log(3) }, c, "2028", {});
    expect(next!.history![3]!.apps).toBe(3);
  });
  test("rollover with no games after a transfer still settles the partial", () => {
    const p = closePartialSeason(player({ seasonLog: log(5) }), club, "2027");
    const [out] = closeSeasonForPlayers([p], { p1: log(5) }, { ...club, squadId: "s2" }, "2027", { s2: ["league:x"] });
    expect(out!.history!.length).toBe(1);
    expect(out!.history![0]!.open).toBeUndefined();
    expect(out!.history![0]!.titles).toEqual([]);
  });
  test("season close: row with titles, no row without games", () => {
    const out = closeSeasonForPlayers([player(), player({ id: "p2" })], { p1: log(30) }, club, "2027", { s1: ["league:premier_league"] });
    expect(out[0]!.history![0]!.titles).toEqual(["league:premier_league"]);
    expect(out[1]!.history).toBeUndefined();
  });
  test("a partial row at a titled club of the same league gets the club's titles at rollover", () => {
    const sold = closePartialSeason(player({ seasonLog: log(5) }), club, "2027");
    const [out] = closeSeasonForPlayers([sold], { p1: log(9) }, { ...club, squadId: "rival" }, "2027",
      { s1: ["league:x", "cup:y"] });
    expect(out!.history![0]!.titles).toEqual(["league:x", "cup:y"]);
    expect(out!.history![1]!.titles).toEqual([]);
  });
  test("pending titles merge without duplicates", () => {
    const p = addPendingTitle(addPendingTitle({}, "s1", "cup:a"), "s1", "cup:a");
    expect(p).toEqual({ s1: ["cup:a"] });
  });
});

import { squadsAfterAcceptedTransfer } from "@/Domain/transfer/transferAcceptance";
import type { Squad } from "@/types/playerTypes";

test("a transfer closes a partial row at the selling club", () => {
  const p = player({ seasonLog: log(8) });
  const seller = { id: "s1", name: "Old", players: [p] } as unknown as Squad;
  const buyer = { id: "s2", name: "New", players: [] } as unknown as Squad;
  const { buying } = squadsAfterAcceptedTransfer(p, seller, buyer, "s2", "p1", undefined, { league: "l", season: "2027" });
  const moved = buying.players[0]!;
  expect(moved.history![0]!.clubName).toBe("Old");
  expect(moved.history![0]!.apps).toBe(8);
  expect(moved.history![0]!.partial).toBe(true);
  expect(moved.seasonLog).toBe(p.seasonLog);
});
