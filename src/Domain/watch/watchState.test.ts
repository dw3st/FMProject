import { describe, expect, test } from "bun:test";
import { watchInfoOf, withBenches } from "@/Domain/watch/watchState";
import type { H2HWireState } from "@/types/h2hTypes";
import type { LiveScoreView } from "@/types/rivalsTypes";

const live = (home: boolean) => ({ seatId: "s", nickname: "fabio", clubId: "c1", clubName: "Vasco", opponentId: "c2", opponentName: "Bahia", home } as LiveScoreView);
const club = { id: "c1", name: "Vasco", colors: ["#000", "#fff"] as [string, string] };
const opp = { id: "c2", name: "Bahia", colors: ["#00f", "#fff"] as [string, string] };

describe("watchInfoOf", () => {
  test("solo: the friend is engine A; drawn turned when he plays away", () => {
    expect(watchInfoOf(live(true), "solo", club, opp)).toMatchObject({ friendSide: "A", mirror: false, teams: { A: club, B: opp } });
    expect(watchInfoOf(live(false), "solo", club, opp)).toMatchObject({ friendSide: "A", mirror: true, teams: { A: club, B: opp } });
  });
  test("between two managers: engine A is the home side, never turned", () => {
    expect(watchInfoOf(live(false), "h2h", club, opp)).toMatchObject({ friendSide: "B", mirror: false, teams: { A: opp, B: club } });
    expect(watchInfoOf(live(true), "h2h", club, opp)).toMatchObject({ friendSide: "A", mirror: false });
  });
});

describe("withBenches", () => {
  test("a state without benches keeps the previous ones", () => {
    const prev = { players: [], benchA: [{ id: 1 }], benchB: [{ id: 2 }] } as unknown as H2HWireState;
    const next = { players: [{ id: 3 }] } as unknown as H2HWireState;
    expect(withBenches(prev, next)).toMatchObject({ players: [{ id: 3 }], benchA: [{ id: 1 }], benchB: [{ id: 2 }] });
    expect(withBenches(undefined, next)).toMatchObject({ benchA: [], benchB: [] });
  });
});
