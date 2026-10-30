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
