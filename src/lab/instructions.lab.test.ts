import { describe, expect, test } from "bun:test";
import { variantAutoLabel } from "@/lab/labNames";
import { addSlotRaws, emptySlotRaw, slotViews } from "@/lab/slotStats";
import { emptyInstrPair, mergeInstrPairs, rel, summarizeInstr } from "@/lab/instructionMatrixSummary";
import { buildInstrTasks } from "@/lab/instructionMatrixPool";
import { naturalFormation } from "@/lab/instructionMatrix";
import type { Variant } from "@/lab/types";

const v = (extra: Partial<Variant> = {}): Variant =>
  ({ id: "v", label: "", formation: "4-3-3", tacticalStyle: "possession", squad: { kind: "level", level: 5 }, ...extra }) as Variant;

describe("lab: player instructions in the variant label", () => {
  test("' · instr N' counts non-default slots, ' · mark' when man-marking", () => {
    expect(variantAutoLabel(v({ slotInstructions: [null, { variant: "fb_inverted" }, { press: "normal" }, { press: "more" }] })))
      .toBe("4-3-3 · Possession · instr 2");
    expect(variantAutoLabel(v({ manMarks: [{ slot: 5, targetSlot: 9 }] }))).toBe("4-3-3 · Possession · mark");
  });
});

describe("lab: per-slot stats", () => {
  test("element-wise sum and per-match views", () => {
    const a = [{ ...emptySlotRaw("LB"), passes: 4, xSum: 100, posSamples: 2 }];
    const b = [{ ...emptySlotRaw(), passes: 2, xSum: 50, posSamples: 1 }, { ...emptySlotRaw("CB"), shots: 1 }];
    const sum = addSlotRaws(a, b);
    expect(sum).toHaveLength(2);
    expect(sum[0]!.role).toBe("LB");
    expect(sum[0]!.passes).toBe(6);
    const views = slotViews(sum, 2);
    expect(views[0]!.passes).toBe(3);
    expect(views[0]!.avgX).toBe(50);
    expect(views[1]!.shots).toBe(0.5);
  });
});

describe("instruction matrix", () => {
  test("tasks per variant in its natural formation, rounds merge by key", () => {
    expect(naturalFormation("dm_box")).toBe("4-2-3-1");
    expect(naturalFormation("wb_attack")).toBe("3-5-2");
    expect(naturalFormation("wm_inside")).toBe("4-4-2");
    expect(naturalFormation("st_false9")).toBe("4-3-3");
    const tasks = buildInstrTasks({ league: "x", parts: ["variants"], variants: ["fb_hold"], matches: 60, mirrorMatches: 25, baseMatches: 0 });
    expect(tasks.map((t) => `${t.kind}:${t.matches}`)).toEqual(["edge:25", "edge:25", "edge:10", "mirror:25"]);
    const p1 = { ...emptyInstrPair("fb_hold", "4-3-3", "edge"), matches: 2, wins: 2 };
    const p2 = { ...emptyInstrPair("fb_hold", "4-3-3", "edge"), matches: 2, losses: 1 };
    const merged = mergeInstrPairs([p1, p2]);
    expect(merged).toHaveLength(1);
    expect(summarizeInstr(merged[0]!).edge).toBe(25);
    expect(rel(3, 2)).toBeCloseTo(0.5);
    expect(rel(1, 0)).toBe(0);
  });
});
