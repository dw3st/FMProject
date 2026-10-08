import { describe, expect, test } from "bun:test";
import type { Fixture } from "@/types/calendarTypes";
import type { RosterPlayer, StandingRow } from "@/types/playerTypes";
import { emptySeasonLog } from "@/types/playerTypes";
import type { InboxMessage } from "@/types/inboxTypes";
import type { LedgerEntry } from "@/Domain/finance/ledger";
import {
  attentionItems,
  currentRound,
  lastResults,
  latestWeekMoney,
  nextFixture,
  seasonHighlights,
  standingsWindow,
} from "@/GameInterface/Dashboard/dashboardData";

function fx(id: string, date: string, home: string, away: string, result?: [number, number], competition = "pl", round = 1): Fixture {
  return {
    id, date, competition, round, home, away,
    played: !!result,
    result: result ? { home: result[0], away: result[1] } : null,
  };
}

const STATS = {
  passing: 5, vision: 5, finishing: 5, dribbling: 5, speed: 5, acceleration: 5, tackling: 5,
  pressing: 5, stamina: 5, heading: 5, strength: 5, reflex: 5, jump: 5,
};

function player(id: string, patch: Partial<RosterPlayer> = {}, statLevel = 5): RosterPlayer {
  const stats = Object.fromEntries(Object.keys(STATS).map((k) => [k, statLevel]));
  return {
    id, name: `P ${id}`, age: 25, squadId: "me", preferredFoot: "right", positions: ["Midfielder"],
    stats: stats as unknown as RosterPlayer["stats"], profile: {} as RosterPlayer["profile"],
    ...patch,
  };
}

describe("next match and form", () => {
  const fixtures = [
    fx("1", "2027-02-01", "me", "a", [2, 0]),
    fx("2", "2027-02-08", "b", "me", [1, 1]),
    fx("3", "2027-02-15", "me", "c", [0, 3], "pl", 3),
    fx("4", "2027-02-22", "d", "me", undefined, "pl", 4),
    fx("5", "2027-02-25", "e", "f", undefined, "pl", 4),
  ];

  test("next fixture is the earliest unplayed one of the club on or after today", () => {
    expect(nextFixture(fixtures, "me", "2027-02-16")?.id).toBe("4");
    expect(nextFixture(fixtures, "me", "2027-02-23")).toBeNull();
  });

  test("last results from the club's side, oldest first", () => {
    expect(lastResults(fixtures, "me")).toEqual(["W", "D", "L"]);
    expect(lastResults(fixtures, "me", 2)).toEqual(["D", "L"]);
  });

  test("current round: next league fixture, else the last played", () => {
    expect(currentRound(fixtures, "me", "pl", "2027-02-16")).toBe(4);
    expect(currentRound(fixtures, "me", "pl", "2027-03-01")).toBe(3);
    expect(currentRound(fixtures, "me", "other", "2027-02-16")).toBeNull();
  });
});

describe("standingsWindow", () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ squadId: `c${i}`, name: `C${i}` }) as StandingRow);

  test("centres the club", () => {
    expect(standingsWindow(rows, "c5").map((r) => r.rank)).toEqual([4, 5, 6, 7, 8]);
  });

  test("clamps at the table edges", () => {
    expect(standingsWindow(rows, "c0").map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(standingsWindow(rows, "c9").map((r) => r.rank)).toEqual([6, 7, 8, 9, 10]);
  });

  test("short table returns every row", () => {
    expect(standingsWindow(rows.slice(0, 3), "c1")).toHaveLength(3);
    expect(standingsWindow([], "c1")).toEqual([]);
  });
});

describe("attentionItems", () => {
  const today = "2027-03-01";

  test("lists injuries, bans, tired players, ending contracts and an unread intake", () => {
    const players = [
      player("inj", { injury: { severity: "medium", returnDate: "2027-03-10" } }),
      player("healed", { injury: { severity: "light", returnDate: "2027-02-20" } }),
      player("ban", { suspension: { matches: 2 } }),
      player("tired", { seasonLog: { ...emptySeasonLog(), fitness: 55 } }),
      player("fresh", { seasonLog: { ...emptySeasonLog(), fitness: 90 } }),
      player("ending", { contract: { until: "2027-05-31", wage: 1000 } }),
      player("long", { contract: { until: "2029-05-31", wage: 1000 } }),
    ];
    const inbox = [{ id: "m", category: "youth", kind: "intake", read: false, count: 4 } as unknown as InboxMessage];
    const items = attentionItems({ players, today, seasonEnd: "2027-05-31", inbox });
    expect(items.map((i) => i.kind)).toEqual(["injured", "suspended", "lowFitness", "contract", "youthIntake"]);
    expect(items.find((i) => i.kind === "youthIntake")).toEqual({ kind: "youthIntake", count: 4 });
  });

  test("groups many tired players and ignores a read intake", () => {
    const players = ["a", "b", "c", "d"].map((id) => player(id, { seasonLog: { ...emptySeasonLog(), fitness: 60 } }));
    const inbox = [{ id: "m", category: "youth", kind: "intake", read: true, count: 4 } as unknown as InboxMessage];
    const items = attentionItems({ players, today, seasonEnd: null, inbox });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "lowFitnessGroup", count: 4 });
  });

  test("facility items worn or condemned in the last week, once per item", () => {
    const msg = (date: string, kind: "worn" | "condemned", item: string, condition: number) =>
      ({ id: `${date}${kind}`, date, createdAt: date, read: false, category: "facilities", subject: "", preview: "", kind, item, condition }) as never;
    const inbox = [msg(today, "condemned", "gym", 14), msg(today, "worn", "gym", 39), msg(today, "worn", "pool", 38), msg("2000-01-01", "worn", "canteen", 30)];
    const items = attentionItems({ players: [player("x")], today, seasonEnd: null, inbox });
    expect(items).toEqual([
      { kind: "facilityWorn", item: "gym", condemned: true, condition: 14 },
      { kind: "facilityWorn", item: "pool", condemned: false, condition: 38 },
    ]);
  });

  test("nothing to report", () => {
    expect(attentionItems({ players: [player("x")], today, seasonEnd: "2027-05-31", inbox: [] })).toEqual([]);
  });
});

describe("seasonHighlights", () => {
  test("before any match: best by overall", () => {
    const res = seasonHighlights([player("lo", {}, 3), player("hi", {}, 8)], 1);
    expect(res.mode).toBe("overall");
    expect(res.items[0]!.player.id).toBe("hi");
  });

  test("during the season: best rating among the regulars", () => {
    const log = (apps: number, rating: number, goals = 0) => ({ ...emptySeasonLog(), appearances: apps, avgRating: rating, goals });
    const res = seasonHighlights([
      player("reg", { seasonLog: log(10, 7.1, 3) }),
      player("star", { seasonLog: log(9, 7.6) }),
      player("cameo", { seasonLog: log(1, 9.0) }),
    ]);
    expect(res.mode).toBe("season");
    expect(res.items.map((h) => h.player.id)).toEqual(["star", "reg"]);
  });
});

describe("latestWeekMoney", () => {
  const e = (date: string, amount: number): LedgerEntry => ({ date, kind: amount > 0 ? "commercial" : "wages", amount, label: "" });

  test("sums the most recent ISO week", () => {
    const res = latestWeekMoney([e("2027-02-22", 500), e("2027-03-01", 1000), e("2027-03-01", -400), e("2027-03-04", 200)]);
    expect(res).toEqual({ weekStart: "2027-03-01", income: 1200, expenses: -400, net: 800 });
  });

  test("empty ledger", () => {
    expect(latestWeekMoney([])).toBeNull();
  });
});
