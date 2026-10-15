import { describe, expect, test } from "bun:test";
import { sessionFromSave } from "@/GameInterface/gameSession";
import { sessionFromSaveJson, type GameSaveApiResponse } from "@/GameInterface/GameSaveProvider";

describe("group advance flag", () => {
  test("groupAdvance comes from a multi world with a world state", () => {
    const base = { id: "s", seatId: "a", leagueSlug: "l", leagueName: "L", clubId: "c", clubName: "C", clubColors: ["#000", "#fff"] };
    expect(sessionFromSave({ ...base, mode: "multi", world: { phase: "running" } }).groupAdvance).toBe(true);
    expect(sessionFromSave({ ...base, mode: "multi" }).groupAdvance).toBe(false);
    expect(sessionFromSave({ ...base, mode: "solo" }).groupAdvance).toBe(false);
  });
});

describe("game session carries the seat", () => {
  test("the seat id comes from the save response", () => {
    const s = sessionFromSave({
      id: "w1", seatId: "s1", leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000", "#fff"], formation: "4-3-3",
    });
    expect(s.seatId).toBe("s1");
    expect(s.saveId).toBe("w1");
  });

  test("a refresh takes the seat from the merged meta and keeps the old one when absent", () => {
    const base = sessionFromSave({
      id: "w1", leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000", "#fff"], formation: "4-3-3",
    });
    const raw = { id: "w1", seatId: "s2", clubId: "40" } as unknown as GameSaveApiResponse;
    const next = sessionFromSaveJson(base, raw);
    expect(next.seatId).toBe("s2");
    expect(next.clubId).toBe("40");
    const kept = sessionFromSaveJson(next, { id: "w1" } as unknown as GameSaveApiResponse);
    expect(kept.seatId).toBe("s2");
  });
});
