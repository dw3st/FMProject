import { describe, expect, test } from "bun:test";
import { lastLineupFor, lastLineupKey } from "@/Domain/tactics/lastLineups";
import { mergeTacticsBody } from "@/Domain/tactics/tacticsBody";
import { CUSTOM_PRESETS } from "@/Domain/formation/zones";
import type { TacticsSave } from "@/types/tacticsTypes";

const presets = Object.values(CUSTOM_PRESETS);
const shapeA = presets[0]!;
const shapeB = presets[1]!;

describe("lastLineups key (report 4749dd0e)", () => {
  test("a ready formation is keyed by its id; a free one by its shape", () => {
    expect(lastLineupKey("4-4-2")).toBe("4-4-2");
    expect(lastLineupKey("custom")).toBeNull();
    const a = lastLineupKey("custom", shapeA)!;
    expect(a.startsWith("custom:")).toBe(true);
    expect(a).not.toBe(lastLineupKey("custom", shapeB));
    expect(lastLineupKey("custom", structuredClone(shapeA))).toBe(a);
  });

  test("the XI of one free shape is never offered to another", () => {
    const base: TacticsSave = { formation: "4-4-2", tactical_style: "balanced", lineup: [] };
    const r = mergeTacticsBody(base, { formation: "custom", customFormation: shapeA, lineup: ["p1", "p2"] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.lastLineups?.custom).toBeUndefined();
    expect(lastLineupFor(r.value.lastLineups, "custom", shapeA)).toEqual(["p1", "p2"]);
    expect(lastLineupFor(r.value.lastLineups, "custom", shapeB)).toBeUndefined();
    expect(lastLineupFor(r.value.lastLineups, "4-4-2")).toBeUndefined();
  });
});
