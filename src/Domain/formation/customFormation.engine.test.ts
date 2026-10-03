import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { aiMatchFormation, computeMatchSimulationLineups, slotRoles } from "@/Domain/advanceDay/matchSimulationLineups";
import { CUSTOM_PRESETS, customToFormation, parseAxesOverride, parseCustomFormation } from "@/Domain/formation/zones";
import { applyTeamAttackConfig, getTeamBuildUp, getTeamTacticalStyle, getTeamWidth } from "@/GameEngine/Configs/AttackConfig";
import { applyTeamTacticsConfig, getDefenseTacticKeys } from "@/GameEngine/Configs/DefenseConfig";
import { axesFor, axesWithMentality, effectiveAxes, hasAxesOverride, type TacticsSave } from "@/types/tacticsTypes";
import type { Fixture } from "@/types/calendarTypes";
import type { Squad } from "@/types/playerTypes";

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Squad;
}

describe("effective axes", () => {
  test("override replaces only the edited axes; style stays the base", () => {
    const eff = effectiveAxes("possession", { width: "wide" });
    expect(eff).toEqual({ ...axesFor("possession"), width: "wide" });
    expect(hasAxesOverride("possession", { width: "wide" })).toBe(true);
    expect(hasAxesOverride("possession", { width: "narrow" })).toBe(false); // same as the style's own
    expect(hasAxesOverride("possession", undefined)).toBe(false);
  });

  test("mentality layers on top of the overridden axes", () => {
    const axes = axesWithMentality("balanced", "attacking", { pressing_style: "low_block" });
    expect(axes.pressing_style).toBe("mid_block"); // low_block stepped up one notch
    expect(axes.width).toBe("wide");
  });

  test("applyTeam*Config use the override for the axes but keep the style for intents", () => {
    applyTeamTacticsConfig("A", "counter_attack", "balanced", { pressing_style: "high_press", defensive_line: "high" });
    applyTeamAttackConfig("A", "counter_attack", "balanced", { width: "wide", build_up: "possession" });
    expect(getDefenseTacticKeys("A").pressingStyle).toBe("high_press");
    expect(getDefenseTacticKeys("A").defensiveLine).toBe("high");
    expect(getTeamBuildUp("A")).toBe("possession");
    expect(getTeamWidth("A")).toBe("wide");
    expect(getTeamTacticalStyle("A")).toBe("counter_attack");
    // reset
    applyTeamTacticsConfig("A", "balanced");
    applyTeamAttackConfig("A", "balanced");
  });
});

describe("request parsing", () => {
  test("parseAxesOverride accepts valid axes and rejects unknown keys/values", () => {
    expect(parseAxesOverride({ width: "wide" })).toEqual({ width: "wide" });
    expect(parseAxesOverride(null)).toEqual({});
    expect(parseAxesOverride({ width: "huge" })).toBeNull();
    expect(parseAxesOverride({ speed: "fast" })).toBeNull();
    expect(parseAxesOverride([])).toBeNull();
  });

  test("parseCustomFormation validates and canonicalises slot order", () => {
    const preset = CUSTOM_PRESETS["3-2-4-1"]!;
    const shuffled = { slots: [...preset.slots].reverse() };
    expect(parseCustomFormation(shuffled)).toEqual(preset);
    expect(parseCustomFormation({ slots: preset.slots.slice(1) })).toBeNull();
    expect(parseCustomFormation({ slots: [{ x: 1, y: 2 }] })).toBeNull();
    expect(parseCustomFormation("nope")).toBeNull();
  });
});

describe("custom formation in the match pipeline", () => {
  const home = loadSquad("33.json");
  const away = loadSquad("34.json");
  const fixture = { home: home.id, away: away.id, date: "2026-10-01", competition: "premier_league" } as unknown as Fixture;

  test("computeMatchSimulationLineups uses the free formation for the user's side", () => {
    const tactics: TacticsSave = {
      formation: "custom",
      customFormation: CUSTOM_PRESETS["3-2-4-1"],
      tactical_style: "balanced",
      lineup: [],
    };
    const r = computeMatchSimulationLineups(fixture, home, away, home.id, tactics);
    expect(r.homeFormation.id).toBe("custom");
    // The AI side plays its own season formation.
    expect(r.awayFormation.id).toBe(aiMatchFormation(away, home, fixture.date).formation.id);
    expect(r.aiFormations.home).toBeUndefined();
    expect(r.aiFormations.away?.id).toBeDefined();
    expect(r.homeLineup).toHaveLength(11);
    expect(new Set(r.homeLineup).size).toBe(11);
    expect(slotRoles(r.homeFormation)).toEqual(CUSTOM_PRESETS["3-2-4-1"]!.slots.map((s) => s.role));
  });

  test("the full engine plays a complete match with a free formation", () => {
    const f = customToFormation(CUSTOM_PRESETS["3-4-1-2"]!);
    const r = simulateMatch(home, away, f, undefined);
    expect(r.score.A).toBeGreaterThanOrEqual(0);
    expect(r.teamStats.A.passesAttempted).toBeGreaterThan(0);
  }, 30_000);
});
