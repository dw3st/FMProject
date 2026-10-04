import { describe, expect, test } from "bun:test";
import type { CardRecord } from "@/GameEngine/types";
import { playerMatchEvents } from "@/GameInterface/matchPlayerEvents";

function card(playerId: number, kind: "yellow" | "red", secondYellow = false): CardRecord {
  return { team: "A", playerId, playerName: `P${playerId}`, playerRosterId: `r${playerId}`, card: kind, secondYellow, matchMinute: 10, energy: 80 };
}

describe("playerMatchEvents", () => {
  test("collects goals, assists and cards per player", () => {
    const stats = new Map([
      [1, { goals: 2, assists: 0 }],
      [2, { goals: 0, assists: 1 }],
      [3, { goals: 0, assists: 0 }],
    ]);
    const ev = playerMatchEvents([card(2, "yellow"), card(4, "yellow"), card(4, "red", true), card(5, "red")], stats);
    expect(ev.get(1)).toEqual({ goals: 2, assists: 0, yellows: 0, red: false });
    expect(ev.get(2)).toEqual({ goals: 0, assists: 1, yellows: 1, red: false });
    expect(ev.has(3)).toBe(false);
    expect(ev.get(4)).toEqual({ goals: 0, assists: 0, yellows: 1, red: true });
    expect(ev.get(5)).toEqual({ goals: 0, assists: 0, yellows: 0, red: true });
  });
});
