import { describe, expect, it } from "bun:test";
import {
  CUSTOM_FORMATION_ID,
  customFromFormation,
  customShape,
  customToFormation,
  slotForZone,
  sortCustomSlots,
  validateCustomFormation,
  zoneAt,
  zoneRole,
} from "@/Domain/formation/zones";
import { formationForSimId } from "@/Domain/matchFormations";
import type { CustomFormationSlot } from "@/types/tacticsTypes";

function slotsOf(zones: [number, number][]): CustomFormationSlot[] {
  return zones.map(([r, c]) => slotForZone(r, c)!);
}

const FOUR_THREE_THREE: [number, number][] = [
  [0, 2], [1, 0], [1, 1], [1, 3], [1, 4], [3, 1], [3, 2], [3, 3], [5, 0], [5, 2], [5, 4],
];

describe("zones", () => {
  it("maps zones to roles by the fixed table", () => {
    expect(zoneRole(0, 2)).toBe("GK");
    expect(zoneRole(0, 0)).toBeNull();
    expect(zoneRole(1, 0)).toBe("LB");
    expect(zoneRole(1, 4)).toBe("RB");
    expect(zoneRole(2, 0)).toBe("LWB");
    expect(zoneRole(2, 2)).toBe("CDM");
    expect(zoneRole(3, 4)).toBe("RM");
    expect(zoneRole(4, 2)).toBe("CAM");
    expect(zoneRole(5, 2)).toBe("ST");
  });

  it("snaps a point to the nearest zone", () => {
    expect(zoneAt(11, 37)).toEqual({ row: 0, col: 2 });
    expect(zoneAt(96, 60)).toEqual({ row: 5, col: 4 });
  });

  it("accepts a 4-3-3 built from zones", () => {
    expect(validateCustomFormation(slotsOf(FOUR_THREE_THREE))).toEqual({ ok: true });
    expect(customShape(slotsOf(FOUR_THREE_THREE))).toBe("4-3-3");
  });

  it("rejects an invalid formation with the reason", () => {
    const base = slotsOf(FOUR_THREE_THREE);
    expect(validateCustomFormation(base.slice(0, 10))).toEqual({ ok: false, reason: "count" });
    const noAtt = slotsOf([[0, 2], [1, 0], [1, 1], [1, 3], [1, 4], [3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [4, 2]]);
    expect(validateCustomFormation(noAtt)).toEqual({ ok: false, reason: "attackers" });
    const noGk = slotsOf([[1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [3, 1], [3, 2], [3, 3], [5, 0], [5, 2], [5, 4]]);
    expect(validateCustomFormation(noGk)).toEqual({ ok: false, reason: "goalkeeper" });
    const few = slotsOf([[0, 2], [1, 1], [1, 3], [3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [5, 0], [5, 2], [5, 4]]);
    expect(validateCustomFormation(few)).toEqual({ ok: false, reason: "defenders" });
    const dup = [...base.slice(0, 10), base[9]!];
    expect(validateCustomFormation(dup)).toEqual({ ok: false, reason: "duplicate" });
    const off = [...base.slice(0, 10), { x: 50, y: 10, role: "CM" }];
    expect(validateCustomFormation(off)).toEqual({ ok: false, reason: "zone" });
  });

  it("converts to an engine Formation keeping slot order and a defending shape", () => {
    const custom = { slots: sortCustomSlots(slotsOf(FOUR_THREE_THREE)) };
    const f = customToFormation(custom);
    expect(f.id).toBe(CUSTOM_FORMATION_ID);
    expect(f.attacking).toHaveLength(11);
    expect(f.defending).toHaveLength(11);
    expect(f.attacking[0]!.role).toBe("GK");
    expect(f.attacking.map((s) => s.role as string)).toEqual(custom.slots.map((s) => s.role));
    for (let i = 0; i < 11; i++) {
      expect(f.defending[i]!.y).toBe(f.attacking[i]!.y);
      expect(f.defending[i]!.x).toBeLessThan(f.attacking[i]!.x);
    }
  });

  it("seeds a valid custom formation from every ready-made one", () => {
    for (const id of ["4-3-3", "4-4-2", "3-5-2", "5-3-2", "4-2-3-1", "3-4-3", "4-1-4-1", "4-2-2-2", "4-3-1-2", "4-5-1"]) {
      const c = customFromFormation(formationForSimId(id));
      expect(c.slots).toHaveLength(11);
      expect(validateCustomFormation(c.slots)).toEqual({ ok: true });
    }
  });
});

describe("formationForTactics", () => {
  it("uses the custom formation when active and valid, falls back otherwise", async () => {
    const { formationForTactics } = await import("@/Domain/matchFormations");
    const custom = { slots: sortCustomSlots(slotsOf(FOUR_THREE_THREE)) };
    expect(formationForTactics({ formation: "custom", customFormation: custom }).id).toBe("custom");
    expect(formationForTactics({ formation: "4-4-2" }).id).toBe("4-4-2");
    expect(formationForTactics({ formation: "custom" }).id).toBe("4-3-3");
    expect(formationForTactics({ formation: "custom", customFormation: { slots: [] } }).id).toBe("4-3-3");
  });
});
