import { describe, expect, test } from "bun:test";
import { mergeTacticsBody } from "@/Domain/tactics/tacticsBody";
import { CUSTOM_PRESETS } from "@/Domain/formation/zones";
import { formationForSimId } from "@/Domain/matchFormations";
import type { TacticsSave } from "@/types/tacticsTypes";

const base: TacticsSave = { formation: "4-4-2", tactical_style: "balanced", lineup: [] };
const slotOf = (id: string, role: string) => formationForSimId(id).attacking.findIndex((s) => s.role === role);

describe("mergeTacticsBody (club and national tactics PUT)", () => {
  test("an empty body keeps the stored tactics", () => {
    const r = mergeTacticsBody(base, {});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ ...base, assistantRotation: false });
  });

  test("every part is merged: axes, takers, instructions, free formation", () => {
    const st = slotOf("4-4-2", "ST");
    const instr = Array.from({ length: st + 1 }, (_, i) => (i === st ? { variant: "st_target" as const } : null));
    const r = mergeTacticsBody(base, {
      axesOverride: { width: "wide" },
      setPieceTakers: { corners: ["a", "b"], routines: { corners: [{ target: "near_post", attackers: 6 }] } },
      slotInstructions: instr,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.axesOverride).toEqual({ width: "wide" });
    expect(r.value.setPieceTakers?.corners).toEqual(["a", "b"]);
    expect(r.value.setPieceTakers?.routines?.corners).toEqual([{ target: "near_post", attackers: 6 }]);
    expect(r.value.slotInstructions?.[st]).toEqual({ variant: "st_target" });
    expect(r.formation.id).toBe("4-4-2");

    const custom = mergeTacticsBody(r.value, { formation: "custom", customFormation: CUSTOM_PRESETS["4-1-3-2"]! });
    expect(custom.ok).toBe(true);
    if (custom.ok) expect(custom.formation.id).toBe("custom");
  });

  test("an invalid part stops it with its error", () => {
    const lb = slotOf("4-4-2", "LB");
    const misfit = Array.from({ length: lb + 1 }, (_, i) => (i === lb ? { variant: "st_target" } : null));
    expect(mergeTacticsBody(base, { slotInstructions: misfit as never })).toEqual({ ok: false, error: "role variant does not fit the slot" });
    expect(mergeTacticsBody(base, { formation: "custom" })).toEqual({ ok: false, error: "custom formation missing" });
    expect(mergeTacticsBody(base, { axesOverride: { width: "huge" } as never }).ok).toBe(false);
    expect(mergeTacticsBody(base, { setPieceTakers: { corners: ["a", "a"] } }).ok).toBe(false);
  });

  test("a kept instruction list follows a formation change", () => {
    const st = slotOf("4-4-2", "ST");
    const instr = Array.from({ length: st + 1 }, (_, i) => (i === st ? { variant: "st_target" as const } : null));
    const withInstr = mergeTacticsBody(base, { slotInstructions: instr });
    expect(withInstr.ok).toBe(true);
    if (!withInstr.ok) return;
    const moved = mergeTacticsBody(withInstr.value, { formation: "5-4-1" });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    const f = formationForSimId("5-4-1");
    for (const [i, ins] of (moved.value.slotInstructions ?? []).entries()) {
      if (ins?.variant === "st_target") expect(f.attacking[i]!.role).toBe("ST");
    }
  });
});
