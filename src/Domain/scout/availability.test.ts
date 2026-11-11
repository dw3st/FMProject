import { describe, expect, test } from "bun:test";
import { playerAvailability } from "@/Domain/scout/availability";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

const p = (o: Partial<RosterPlayer> = {}) => ({ id: "x", age: 25, positions: ["CM"], contract: { until: "2027-12-31", wage: 1000 }, ...o }) as unknown as RosterPlayer;
const squad = { id: "c", players: [] } as unknown as Squad;
const ctx = { date: "2027-08-01", listed: false, starterIds: new Set<string>(), humanClub: false };

describe("playerAvailability", () => {
  test("a free agent is free", () => {
    expect(playerAvailability(p(), null, ctx)).toEqual({ free: true });
  });
  test("listed and near the end of the contract", () => {
    const a = playerAvailability(p(), squad, { ...ctx, listed: true });
    expect(a.sale).toBe(true);
    expect(a.preContract).toBe(true);
  });
  test("another manager's player: only his list counts", () => {
    expect(playerAvailability(p(), squad, { ...ctx, humanClub: true })).toEqual({});
    expect(playerAvailability(p(), squad, { ...ctx, humanClub: true, listed: true })).toEqual({ sale: true });
  });
});
