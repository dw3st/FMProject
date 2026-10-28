import { describe, expect, test } from "bun:test";
import { matchIsBig } from "@/backend/matchImportance";
import type { SaveService } from "@/backend/SaveService";
import type { Fixture } from "@/types/calendarTypes";
import type { Squad } from "@/types/playerTypes";

const squad = (id: string, city: string) => ({ id, name: id, venue: { name: `${id} Arena`, city, capacity: 30000 } }) as Squad;
const service = {
  getLeagueMeta: async () => ({ cup: { stages: [{ round: 1, name: "r32" }, { round: 3, name: "qf" }] } }),
} as unknown as SaveService;
const fx = (over: Partial<Fixture>): Fixture => ({
  id: "f", date: "2027-03-01", competition: "premier_league", round: 1, home: "a", away: "b", played: false, result: null, ...over,
});

describe("big game (stadium atmosphere)", () => {
  test("continental, cup from the quarter-finals, same-city derby", async () => {
    const a = squad("a", "Manchester"), b = squad("b", "Liverpool");
    expect(await matchIsBig(service, "s", fx({ competition: "ucl" }), a, b)).toBe(true);
    expect(await matchIsBig(service, "s", fx({ competition: "cup_england", round: 3 }), a, b)).toBe(true);
    expect(await matchIsBig(service, "s", fx({ competition: "cup_england", round: 1 }), a, b)).toBe(false);
    expect(await matchIsBig(service, "s", fx({}), a, b)).toBe(false);
    expect(await matchIsBig(service, "s", fx({}), a, squad("b", "manchester"))).toBe(true);
  });
});
