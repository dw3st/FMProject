import { describe, expect, test } from "bun:test";
import {
  ROLE_VARIANTS, ROLE_VARIANT_IDS, applyAnchorOffset, effectiveInstruction, instructionAnchor,
  resolveSlotTuning, variantsForRole,
} from "@/GameEngine/Configs/RoleVariantConfig";
import { roleEngine } from "@/GameEngine/Domain/roleEngineData";
import rolesJson from "@/Data/roles.json";

describe("resolveSlotTuning", () => {
  test("default instruction is the very same object as roleEngine(role)", () => {
    expect(resolveSlotTuning("LB", undefined)).toBe(roleEngine("LB"));
    expect(resolveSlotTuning("LB", null)).toBe(roleEngine("LB"));
    expect(resolveSlotTuning("LB", {})).toBe(roleEngine("LB"));
    expect(resolveSlotTuning("ST", { press: "normal" })).toBe(roleEngine("ST"));
  });

  test("a variant replaces only its own fields", () => {
    const base = roleEngine("LB");
    const t = resolveSlotTuning("LB", { variant: "fb_overlap" });
    expect(t.bounds).toEqual({ minX: base.bounds.minX, maxX: 85 });
    expect(t.offBallIntentWeights).toEqual({ offer_support: base.offBallIntentWeights.offer_support, hold_space: 0.35, make_run: 0.45 });
    expect(t.carryBias).toBe(0.6);
    expect(t.offBallBias).toBe(0.35);
    expect(t.passBias).toBe(base.passBias);
    expect(t.passTargetWeight).toBe(base.passTargetWeight);
    expect(t.defensiveIntentWeights).toEqual(base.defensiveIntentWeights);
    expect(t.yRange).toBe(base.yRange);
    // roles.json untouched
    expect((rolesJson as Record<string, { engine: { bounds: { maxX: number } } }>).LB!.engine.bounds.maxX).toBe(65);
  });

  test("pressing scales the two press weights", () => {
    const base = roleEngine("CM").defensiveIntentWeights;
    const more = resolveSlotTuning("CM", { press: "more" }).defensiveIntentWeights;
    const less = resolveSlotTuning("CM", { press: "less" }).defensiveIntentWeights;
    expect(more.press_holder).toBeCloseTo(base.press_holder * 1.4);
    expect(more.step_into_carry_lane).toBeCloseTo(base.step_into_carry_lane * 1.15);
    expect(less.press_holder).toBeCloseTo(base.press_holder * 0.6);
    expect(less.step_into_carry_lane).toBeCloseTo(base.step_into_carry_lane * 0.8);
    expect(more.hold_shape).toBe(base.hold_shape);
  });

  test("a variant the role does not accept falls back to the default (pressing kept)", () => {
    expect(resolveSlotTuning("CB", { variant: "st_false9" })).toBe(roleEngine("CB"));
    expect(effectiveInstruction("CB", { variant: "st_false9", press: "more" })).toEqual({ press: "more" });
    expect(effectiveInstruction("GK", { press: "more" })).toBeUndefined();
  });

  test("every variant targets fields that exist and roles that exist", () => {
    for (const id of ROLE_VARIANT_IDS) {
      for (const role of ROLE_VARIANTS[id].roles) {
        expect(roleEngine(role)).toBeDefined();
        const t = resolveSlotTuning(role, { variant: id });
        expect(t).not.toBe(roleEngine(role));
      }
    }
    expect(variantsForRole("GK")).toEqual([]);
    expect(variantsForRole("ST")).toEqual(["st_poacher", "st_false9", "st_target"]);
  });
});

describe("anchor offsets", () => {
  test("dx follows the attack direction", () => {
    expect(applyAnchorOffset({ x: 36, y: 11 }, { dx: 12, dyIn: 0 }, 1)).toEqual({ x: 48, y: 11 });
    expect(applyAnchorOffset({ x: 79, y: 11 }, { dx: 12, dyIn: 0 }, -1)).toEqual({ x: 67, y: 11 });
  });

  test("dyIn goes toward the centre line on both sides, never past it", () => {
    expect(applyAnchorOffset({ x: 36, y: 11 }, { dx: 0, dyIn: 14 }, 1)).toEqual({ x: 36, y: 25 });
    expect(applyAnchorOffset({ x: 36, y: 63 }, { dx: 0, dyIn: 14 }, 1)).toEqual({ x: 36, y: 49 });
    expect(applyAnchorOffset({ x: 36, y: 30 }, { dx: 0, dyIn: 14 }, -1)).toEqual({ x: 36, y: 37 });
    // negative = toward the touchline
    expect(applyAnchorOffset({ x: 36, y: 20 }, { dx: 0, dyIn: -6 }, 1)).toEqual({ x: 36, y: 14 });
    expect(applyAnchorOffset({ x: 36, y: 54 }, { dx: 0, dyIn: -6 }, 1)).toEqual({ x: 36, y: 60 });
  });

  test("instructionAnchor per phase", () => {
    expect(instructionAnchor({ variant: "fb_inverted" }, "attacking")).toEqual({ dx: 0, dyIn: 14 });
    expect(instructionAnchor({ variant: "fb_inverted" }, "defending")).toBeUndefined();
    expect(instructionAnchor({ variant: "cb_cover" }, "defending")).toEqual({ dx: -3, dyIn: 0 });
    expect(instructionAnchor(undefined, "attacking")).toBeUndefined();
  });
});
