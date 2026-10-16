import { describe, expect, test } from "bun:test";
import { publicSeatSquad } from "@/Domain/seats/publicSquad";
import type { Squad } from "@/types/playerTypes";

describe("publicSeatSquad", () => {
  test("drops the seat's private club and player data, keeps the rest", () => {
    const squad = {
      id: "c1", name: "Club", colors: ["#000000", "#ffffff"],
      finances: { broadcasting: 1, commercial: 2, total: 3, budget: 99, followers: 4 },
      moraleClub: { talks: [] }, staff: { members: [] }, facilities: {}, managerAttributes: {}, styleFamiliarity: {},
      registrations: { premier_league: {} },
      players: [{ id: "p1", name: "P", morale: 40, moraleLog: {}, squadStatus: "key", age: 20 }],
    } as unknown as Squad;
    const pub = publicSeatSquad(squad) as unknown as Record<string, unknown>;
    for (const k of ["moraleClub", "staff", "facilities", "managerAttributes", "styleFamiliarity", "registrations"]) {
      expect(k in pub).toBe(false);
    }
    expect(pub.finances).toEqual({ broadcasting: 1, commercial: 2, total: 3, followers: 4 });
    expect(pub.players).toEqual([{ id: "p1", name: "P", age: 20 }]);
    expect(pub.name).toBe("Club");
  });
});
