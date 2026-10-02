import { describe, expect, test } from "bun:test";
import {
  addPendingTitle, addTitle, closePartialSeason, closeSeasonForPlayers, historyRowFromLog, seasonLabel,
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
  test("partial season closes a row and resets counters, keeping fitness and load", () => {
    const p = closePartialSeason(player({ seasonLog: log(5) }), club, "2027");
    expect(p.history!.length).toBe(1);
    expect(p.seasonLog!.appearances).toBe(0);
    expect(p.seasonLog!.fitness).toBe(60);
    expect(p.seasonLog!.load).toBe(40);
  });
  test("addTitle never creates a row and does not duplicate", () => {
    expect(addTitle(player(), "cup:x").history).toBeUndefined();
    const p = closePartialSeason(player({ seasonLog: log(5) }), club, "2027");
    const t = addTitle(addTitle(p, "cup:x"), "cup:x");
    expect(t.history![0]!.titles).toEqual(["cup:x"]);
  });
  test("season close: row with titles, no row without games", () => {
    const withOld = closePartialSeason(player({ id: "p2", seasonLog: log(5) }), club, "2026");
    const out = closeSeasonForPlayers([player(), withOld], { p1: log(30) }, club, "2027", ["league:premier_league"]);
    expect(out[0]!.history![0]!.titles).toEqual(["league:premier_league"]);
    expect(out[1]!.history!.length).toBe(1);
    expect(out[1]!.history![0]!.titles).toEqual([]);
  });
  test("pending titles merge without duplicates", () => {
    const p = addPendingTitle(addPendingTitle({}, "s1", "cup:a"), "s1", "cup:a");
    expect(p).toEqual({ s1: ["cup:a"] });
  });
});
