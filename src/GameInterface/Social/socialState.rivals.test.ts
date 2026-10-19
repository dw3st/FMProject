import { describe, expect, test } from "bun:test";
import { parseServerEvent, pushRivalPopup, type RivalPopup } from "@/GameInterface/Social/socialState";
import type { SeatResult } from "@/types/rivalsTypes";

const result: SeatResult = {
  id: "r1", date: "2027-03-10", seatId: "b", nickname: "fabio", clubId: "c1", clubName: "Vasco", opponentId: "c2",
  opponentName: "Bahia", home: true, competition: "x", score: { for: 0, against: 3 }, goals: [], situations: ["loss"],
};

describe("rivals socket events", () => {
  test("world_results keeps the well-formed results", () => {
    const ev = parseServerEvent(JSON.stringify({ type: "world_results", saveId: "s", results: [result, { id: 3 }] }));
    expect(ev).toEqual({ type: "world_results", saveId: "s", results: [result] });
  });
  test("friend_live with a view, with null, and junk", () => {
    const live = { ...result, fixtureId: "f", status: "live", minute: 10, lastGoal: null, events: 1, updatedAt: 1 };
    expect(parseServerEvent(JSON.stringify({ type: "friend_live", saveId: "s", seatId: "b", live, goal: true })))
      .toMatchObject({ type: "friend_live", seatId: "b", goal: true });
    expect(parseServerEvent(JSON.stringify({ type: "friend_live", saveId: "s", seatId: "b", live: null })))
      .toEqual({ type: "friend_live", saveId: "s", seatId: "b", live: null });
    expect(parseServerEvent(JSON.stringify({ type: "friend_live", saveId: "s", seatId: "b", live: { x: 1 } }))).toBeNull();
  });
  test("a message keeps its taunt", () => {
    const taunt = { kind: "reaction", id: "fire", target: "fabio", clubId: "c1", clubName: "Vasco", opponentName: "Bahia", home: true, score: { for: 0, against: 3 } };
    const ev = parseServerEvent(JSON.stringify({ type: "message", room: "world:s", message: { id: 1, from: "a", mine: false, body: "x", at: 1, taunt } }));
    expect(ev).toMatchObject({ message: { taunt } });
  });
  test("pushRivalPopup: newest first, one per key, at most max", () => {
    const p = (key: string): RivalPopup => ({ key, kind: "result", result });
    expect(pushRivalPopup([p("a"), p("b"), p("c")], p("d"), 3).map((x) => x.key)).toEqual(["d", "a", "b"]);
    expect(pushRivalPopup([p("a"), p("b")], p("a"), 3).map((x) => x.key)).toEqual(["a", "b"]);
  });
});
