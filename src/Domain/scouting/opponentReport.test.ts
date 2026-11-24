import { describe, expect, test } from "bun:test";
import { buildOpponentReport, playedGamesOf } from "@/Domain/scouting/opponentReport";
import type { Fixture } from "@/types/calendarTypes";
import type { Squad } from "@/types/playerTypes";

const fx = (id: string, date: string, home: string, away: string, h: number, a: number, extra: Partial<Fixture> = {}): Fixture =>
  ({ id, date, competition: "lg", round: 1, home, away, played: true, result: { home: h, away: a }, ...extra });

const squad = { id: "X", players: [] } as unknown as Squad;

describe("opponent report", () => {
  test("form newest first, results from the club's side, shoot-out decides a draw", () => {
    const games = playedGamesOf("X", [
      fx("1", "2027-01-01", "X", "A", 2, 0),
      fx("2", "2027-01-08", "B", "X", 3, 1),
      fx("3", "2027-01-15", "X", "C", 1, 1, { decider: { extraTime: { home: 0, away: 0 }, penalties: { home: 4, away: 5 } } }),
      fx("4", "2027-01-20", "Y", "Z", 1, 0),
      { ...fx("5", "2027-02-01", "X", "D", 0, 0), played: false, result: null },
    ]);
    const r = buildOpponentReport(squad, games, new Map());
    expect(r.form.map((g) => g.result)).toEqual(["L", "L", "W"]);
    expect(r.form[1]).toMatchObject({ home: false, goalsFor: 1, goalsAgainst: 3, opponentId: "B" });
    expect(r.tacticGames).toBe(0);
  });

  test("records by own and faced formation", () => {
    const games = playedGamesOf("X", [fx("1", "2027-01-01", "X", "A", 2, 0), fx("2", "2027-01-08", "B", "X", 3, 1), fx("3", "2027-01-15", "X", "C", 0, 0)]);
    const f = new Map<string, [string, string]>([["lg:1", ["4-3-3", "4-4-2"]], ["lg:2", ["4-3-3", "3-5-2"]], ["lg:3", ["5-4-1", "4-4-2"]]]);
    const r = buildOpponentReport(squad, games, f);
    expect(r.tacticGames).toBe(3);
    expect(r.byOwnFormation[0]).toEqual({ formation: "4-3-3", played: 2, won: 1, drawn: 0, lost: 1 });
    expect(r.byFacedFormation.find((t) => t.formation === "4-4-2")).toEqual({ formation: "4-4-2", played: 2, won: 1, drawn: 1, lost: 0 });
  });
});
