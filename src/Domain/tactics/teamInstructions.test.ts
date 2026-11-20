import { describe, expect, test } from "bun:test";
import {
  aiInstructions, axesOfLevels, differsFromTemplate, instructionsOffTemplate, levelsOfAxes, parseTeamInstructions,
  resolveInstructions, styleTemplate, INSTRUCTION_KEYS,
} from "@/Domain/tactics/teamInstructions";
import { STYLE_TO_AXES, effectiveAxes, type TacticalStyle } from "@/types/tacticsTypes";

const STYLES = Object.keys(STYLE_TO_AXES) as TacticalStyle[];

describe("team instructions", () => {
  test("a style's template gives exactly the style's axes (attack and defence)", () => {
    for (const style of STYLES) {
      const { attack, defense } = axesOfLevels(styleTemplate(style).levels);
      expect(attack).toEqual(STYLE_TO_AXES[style]);
      expect(defense).toEqual(STYLE_TO_AXES[style]);
    }
  });

  test("an old axesOverride resolves into the same axes", () => {
    const o = { pressing_style: "high_press", width: "wide" } as const;
    for (const style of STYLES) {
      const r = resolveInstructions(style, o);
      expect(axesOfLevels(r.levels).attack).toEqual(effectiveAxes(style, o));
    }
  });

  test("±2 keeps the axis value of ±1", () => {
    const r = resolveInstructions("balanced", undefined, { inPossession: { passing: 2, width: -2 }, outOfPossession: { line: 2 } });
    const { attack } = axesOfLevels(r.levels);
    expect(attack.build_up).toBe("direct");
    expect(attack.width).toBe("narrow");
    expect(attack.defensive_line).toBe("high");
  });

  test("pressing splits into engagement, intensity and tackling", () => {
    expect(levelsOfAxes({ pressing_style: "low_block" })).toEqual({ engagement: -1, pressing: -1, tackling: -1 });
  });

  test("nothing set = the template, nothing differs", () => {
    for (const style of STYLES) {
      const r = resolveInstructions(style);
      expect(r.levels).toEqual(r.template);
      expect(differsFromTemplate(r)).toBe(false);
      expect(instructionsOffTemplate(style, r.levels, r.focus)).toBeUndefined();
    }
  });

  test("off-template keeps only what changed", () => {
    const r = resolveInstructions("counter_attack");
    const levels = { ...r.levels, shooting: 2 as const };
    expect(instructionsOffTemplate("counter_attack", levels, "left")).toEqual({ inPossession: { shooting: 2, focus: "left" } });
  });

  test("parser", () => {
    expect(parseTeamInstructions(null)).toEqual({ ok: true, value: undefined });
    expect(parseTeamInstructions({ inPossession: { tempo: 1, focus: "wings" } }).ok).toBe(true);
    expect(parseTeamInstructions({ inPossession: { tempo: 3 } }).ok).toBe(false);
    expect(parseTeamInstructions({ inPossession: { tempo: 0.5 } }).ok).toBe(false);
    expect(parseTeamInstructions({ inPossession: { focus: "up" } }).ok).toBe(false);
    expect(parseTeamInstructions({ outOfPossession: { passing: 1 } }).ok).toBe(false);
    expect(parseTeamInstructions({ other: {} }).ok).toBe(false);
    expect(parseTeamInstructions([]).ok).toBe(false);
  });

  test("every key has a level in the template", () => {
    const t = styleTemplate("balanced").levels;
    for (const k of INSTRUCTION_KEYS) expect(t[k]).toBe(0);
  });

  test("AI: template when level, regroups when leading late, goes for it when trailing", () => {
    expect(aiInstructions("balanced", { lead: 0, minute: 85 })).toEqual({ instructions: undefined, mentality: 0 });
    expect(aiInstructions("balanced", { lead: 1, minute: 60 }).instructions).toBeUndefined();
    const lead = aiInstructions("balanced", { lead: 1, minute: 80 });
    expect(lead.mentality).toBe(-1);
    expect(lead.instructions?.transition?.onLoss).toBe(-1);
    const trail = aiInstructions("balanced", { lead: -2, minute: 82 });
    expect(trail.mentality).toBe(1);
    expect(trail.instructions?.inPossession?.passing).toBe(1);
  });
});
