import { describe, expect, test } from "bun:test";
import { stripHumanOnly } from "@/backend/startKits";
import type { Squad } from "@/types/playerTypes";

describe("start kits never carry human-only fields", () => {
  test("stripHumanOnly drops staff and styleFamiliarity, keeps the rest", () => {
    const squad = {
      id: "s", name: "S", colors: ["#000", "#fff"], money: 0, players: [], wageFactor: 1.2,
      staff: { assistant: { id: "a", name: "A", rating: 7 } },
      styleFamiliarity: { possession: 90 },
    } as unknown as Squad;
    const out = stripHumanOnly(squad);
    expect(out.staff).toBeUndefined();
    expect(out.styleFamiliarity).toBeUndefined();
    expect("staff" in out).toBe(false);
    expect(out.wageFactor).toBe(1.2);
    const plain = { id: "p", name: "P", colors: ["#000", "#fff"], money: 0, players: [] } as unknown as Squad;
    expect(stripHumanOnly(plain)).toBe(plain);
  });
});
