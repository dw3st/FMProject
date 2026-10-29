import { describe, expect, test } from "bun:test";
import {
  buildSeatResults, formOf, isSeatResult, penaltiesInLineOrder, mergeFeed, resultLetter, resultSituations, scoreLineOf,
} from "@/Domain/rivals/results";
import type { MatchEvent } from "@/types/dayLogTypes";
import type { SeatResult, SeatResultGoal } from "@/types/rivalsTypes";

const g = (minute: number, side: "for" | "against"): SeatResultGoal => ({ minute, side, scorer: "" });

function match(over: Partial<MatchEvent>): MatchEvent {
  return {
    kind: "match", fixtureId: "f1", competition: "premier_league", round: 1, home: "c1", away: "c2",
    score: { home: 0, away: 0 }, playerNames: { p1: "Silva", p2: "Costa" }, ...over,
  } as unknown as MatchEvent;
}

describe("scoreLineOf", () => {
  test("home side first", () => {
    expect(scoreLineOf({ clubName: "Vasco", opponentName: "Bahia", home: true, score: { for: 0, against: 3 } })).toBe("Vasco 0–3 Bahia");
    expect(scoreLineOf({ clubName: "Vasco", opponentName: "Bahia", home: false, score: { for: 3, against: 0 } })).toBe("Bahia 0–3 Vasco");
  });
});

describe("penaltiesInLineOrder", () => {
  test("follows the score line: home side first (report: Levante 1-1 Barcelona, pen. 2-4 for a Barcelona loss)", () => {
    const pens = { penalties: { for: 2, against: 4 } };
    expect(penaltiesInLineOrder({ home: false, decider: pens })).toEqual({ home: 4, away: 2 });
    expect(penaltiesInLineOrder({ home: true, decider: pens })).toEqual({ home: 2, away: 4 });
    expect(penaltiesInLineOrder({ home: true })).toBeNull();
  });
});

describe("resultSituations", () => {
  const base = { home: true, goals: [] as SeatResultGoal[] };
  test("always one of win / draw / loss", () => {
    expect(resultSituations({ ...base, score: { for: 1, against: 0 } })).toContain("win");
    expect(resultSituations({ ...base, score: { for: 1, against: 1 } })).toContain("draw");
    expect(resultSituations({ ...base, score: { for: 0, against: 1 } })).toContain("loss");
  });
  test("big margins, home loss, away win", () => {
    expect(resultSituations({ ...base, score: { for: 3, against: 0 } })).toContain("big_win");
    expect(resultSituations({ ...base, score: { for: 0, against: 3 } })).toEqual(["loss", "big_loss", "home_loss"]);
    expect(resultSituations({ home: false, goals: [], score: { for: 2, against: 1 } })).toContain("away_win");
    expect(resultSituations({ ...base, score: { for: 2, against: 0 } })).not.toContain("big_win");
  });
  test("comeback by the goals' minutes", () => {
    const s = resultSituations({ ...base, score: { for: 2, against: 1 }, goals: [g(10, "against"), g(50, "for"), g(70, "for")] });
    expect(s).toContain("comeback_win");
    expect(s).not.toContain("late_winner");
  });
  test("blown lead", () => {
    expect(resultSituations({ ...base, score: { for: 1, against: 1 }, goals: [g(20, "for"), g(60, "against")] })).toContain("blown_lead");
    expect(resultSituations({ ...base, score: { for: 1, against: 2 }, goals: [g(20, "for"), g(60, "against"), g(80, "against")] })).toContain("blown_lead");
  });
  test("late equalizer and late winner", () => {
    expect(resultSituations({ ...base, score: { for: 1, against: 1 }, goals: [g(30, "against"), g(89, "for")] })).toContain("late_equalizer");
    expect(resultSituations({ ...base, score: { for: 2, against: 1 }, goals: [g(10, "for"), g(40, "against"), g(90, "for")] })).toContain("late_winner");
    expect(resultSituations({ ...base, score: { for: 2, against: 0 }, goals: [g(10, "for"), g(90, "for")] })).not.toContain("late_winner");
  });
  test("shootout", () => {
    const s = resultSituations({ ...base, score: { for: 1, against: 1 }, decider: { penalties: { for: 4, against: 3 } } });
    expect(s).toContain("draw");
    expect(s).toContain("shootout_win");
    expect(resultSituations({ ...base, score: { for: 0, against: 0 }, decider: { penalties: { for: 2, against: 4 } } })).toContain("shootout_loss");
  });
});

describe("buildSeatResults", () => {
  const names = (id: string) => ({ c1: "Vasco", c2: "Bahia", c3: "Grêmio" }[id] ?? id);
  test("one side", () => {
    const events = [
      match({ score: { home: 0, away: 3 }, goals: [
        { playerId: "p2", team: "away", minute: 10, header: false, distance: 10, outsideBox: false },
      ] }),
      { kind: "training", squadId: "c1", effects: [] },
      match({ fixtureId: "f9", home: "c8", away: "c9" }),
    ];
    const r = buildSeatResults({ date: "2027-03-10", events, seats: [{ seatId: "a", clubId: "c1", nickname: "fabio" }], clubName: names });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      id: "2027-03-10:premier_league:f1:a", seatId: "a", nickname: "fabio", clubName: "Vasco", opponentId: "c2",
      opponentName: "Bahia", home: true, score: { for: 0, against: 3 }, goals: [{ minute: 10, side: "against", scorer: "Costa" }],
    });
    expect(r[0]!.situations).toContain("big_loss");
  });
  test("two seats meeting: one result each", () => {
    const events = [match({ score: { home: 2, away: 1 } })];
    const r = buildSeatResults({
      date: "2027-03-10", events, clubName: names,
      seats: [{ seatId: "a", clubId: "c1", nickname: "a" }, { seatId: "b", clubId: "c2", nickname: "b" }],
    });
    expect(r.map((x) => [x.seatId, x.home, x.score.for, x.score.against])).toEqual([["a", true, 2, 1], ["b", false, 1, 2]]);
  });
  test("penalties from the club's side", () => {
    const events = [match({ score: { home: 1, away: 1 }, decider: { extraTime: { home: 0, away: 0 }, penalties: { home: 3, away: 5 } } })];
    const r = buildSeatResults({ date: "2027-03-10", events, seats: [{ seatId: "b", clubId: "c2", nickname: "b" }], clubName: names });
    expect(r[0]!.decider).toEqual({ penalties: { for: 5, against: 3 } });
    expect(r[0]!.situations).toContain("shootout_win");
  });
  test("no events = nothing", () => {
    expect(buildSeatResults({ date: "d", events: undefined, seats: [], clubName: names })).toEqual([]);
  });
});

function result(id: string, date: string, seatId: string, f: number, a: number): SeatResult {
  return {
    id, date, seatId, nickname: seatId, clubId: "c", clubName: "C", opponentId: "o", opponentName: "O", home: true,
    competition: "x", score: { for: f, against: a }, goals: [], situations: [],
  };
}

describe("feed and form", () => {
  test("mergeFeed: newest first, no duplicate id, capped", () => {
    const cur = [result("2:a", "2027-03-02", "a", 1, 0)];
    const merged = mergeFeed(cur, [result("3:a", "2027-03-03", "a", 0, 0), result("2:a", "2027-03-02", "a", 9, 9)], 2);
    expect(merged.map((r) => r.id)).toEqual(["3:a", "2:a"]);
    expect(merged[1]!.score.for).toBe(1);
    expect(mergeFeed(merged, [result("1:a", "2027-03-01", "a", 0, 0)], 2).map((r) => r.id)).toEqual(["3:a", "2:a"]);
  });
  test("formOf: the seat's last five, oldest first", () => {
    const feed = [
      result("6", "2027-03-06", "a", 1, 0), result("5", "2027-03-05", "b", 0, 0), result("4", "2027-03-04", "a", 0, 1),
      result("3", "2027-03-03", "a", 1, 1), result("2", "2027-03-02", "a", 2, 0), result("1", "2027-03-01", "a", 3, 0),
      result("0", "2027-02-28", "a", 0, 2),
    ];
    expect(formOf(feed, "a")).toEqual(["W", "W", "D", "L", "W"]);
    expect(resultLetter(result("x", "d", "a", 1, 1))).toBe("D");
  });
  test("isSeatResult", () => {
    expect(isSeatResult(result("1", "2027-03-01", "a", 1, 0))).toBe(true);
    expect(isSeatResult({ id: 1 })).toBe(false);
  });
});
