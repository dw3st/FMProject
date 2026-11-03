import { describe, expect, test } from "bun:test";
import { neededGap, spreadMarkers } from "@/Domain/formation/pitchMarkers";
import { getFormationSlots } from "@/types/formationSlots";
import formation4312 from "@/Data/formations/4-3-1-2.json";
import formation442 from "@/Data/formations/4-4-2.json";

const close = (s: { x: number; y: number }[]) =>
  s.some((a, i) => s.some((b, j) => j > i && Math.abs(a.y - b.y) < neededGap(a.x - b.x) - 0.05));

describe("spreadMarkers", () => {
  test("4-3-1-2: the CAM no longer sits on the middle CM", () => {
    const slots = getFormationSlots(formation4312 as never);
    expect(close(slots)).toBe(true);
    const out = spreadMarkers(slots);
    expect(close(out)).toBe(false);
    const cam = out[8]!, cm = out[6]!;
    expect(cam.y).toBeLessThan(cm.y);
  });
  test("a formation without clashes is unchanged", () => {
    const slots = getFormationSlots(formation442 as never);
    expect(spreadMarkers(slots)).toEqual(slots);
  });
});

describe("substitution panel cards", () => {
  test("no two cards overlap in any formation", async () => {
    const { spreadSubsMarkers, cardsOverlap, SUBS_CARD } = await import("@/Domain/formation/pitchMarkers");
    const { FORMATION_IDS, formationForSimId } = await import("@/Domain/matchFormations");
    const { getFormationSlots } = await import("@/types/formationSlots");
    for (const id of FORMATION_IDS) {
      expect([id, cardsOverlap(spreadSubsMarkers(getFormationSlots(formationForSimId(id))), SUBS_CARD.W, SUBS_CARD.H)]).toEqual([id, false]);
    }
  });

  test("a line of four in neighbouring columns of the free formation stays a line (report)", async () => {
    const { spreadSubsMarkers } = await import("@/Domain/formation/pitchMarkers");
    const { getFormationSlots } = await import("@/types/formationSlots");
    const attacking = [
      [10, 37, "GK"], [36, 22, "CB"], [36, 52, "CB"], [54, 8, "LWB"], [54, 22, "CDM"], [54, 52, "CDM"], [54, 66, "RWB"],
      [72, 37, "CM"], [98, 8, "LW"], [98, 37, "ST"], [98, 66, "RW"],
    ].map(([x, y, role]) => ({ x: x as number, y: y as number, role: role as string }));
    const out = spreadSubsMarkers(getFormationSlots({ attacking } as never));
    const y = (i: number) => out[i]!.y;
    // Left and right mirror each other: nobody is pushed up on one side and down on the other.
    expect(y(3)).toBeCloseTo(y(6), 5);
    expect(y(4)).toBeCloseTo(y(5), 5);
    expect(Math.abs(y(3) - y(4))).toBeLessThan(4);
  });
});
