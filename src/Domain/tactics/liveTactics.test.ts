import { afterEach, describe, expect, test } from "bun:test";
import { applyLiveTactics, withLiveAxis, withLiveStyle } from "@/Domain/tactics/liveTactics";
import { applyTeamTacticsConfig, getDefenseConfig, getDefenseTacticKeys } from "@/GameEngine/Configs/DefenseConfig";
import { applyTeamAttackConfig, getTeamBuildUp, getTeamTacticalStyle, getTeamPassConfig } from "@/GameEngine/Configs/AttackConfig";

afterEach(() => {
  for (const t of ["A", "B"] as const) {
    applyTeamTacticsConfig(t, "balanced");
    applyTeamAttackConfig(t, "balanced");
  }
});

describe("live tactics", () => {
  test("a style clears the axis edits; an axis equal to the style drops out", () => {
    expect(withLiveStyle("high_press")).toEqual({ style: "high_press" });
    const edited = withLiveAxis({ style: "balanced" }, "width", "wide");
    expect(edited).toEqual({ style: "balanced", axesOverride: { width: "wide" } });
    expect(withLiveAxis(edited, "width", "normal")).toEqual({ style: "balanced" });
  });

  test("applies to the user's team only, with the familiarity of the chosen style", () => {
    const beforeB = { ...getDefenseConfig("B") };
    const passB = { ...getTeamPassConfig("B") };
    applyLiveTactics("A", { style: "high_press", axesOverride: { build_up: "possession" } }, "balanced", { high_press: 100 });
    expect(getDefenseTacticKeys("A").pressingStyle).toBe("high_press");
    expect(getTeamBuildUp("A")).toBe("possession");
    expect(getTeamTacticalStyle("A")).toBe("high_press");
    expect(getDefenseConfig("B")).toEqual(beforeB);
    expect(getTeamPassConfig("B")).toEqual(passB);
    // Familiarity 100 with the chosen style raises its pressing weight; 50 leaves the style as is.
    const trained = getDefenseConfig("A").PRESS_INTENSITY;
    applyLiveTactics("A", { style: "high_press" }, "balanced", { high_press: 50 });
    expect(trained).toBeGreaterThan(getDefenseConfig("A").PRESS_INTENSITY);
  });

  test("the mentality stays on top", () => {
    applyLiveTactics("A", { style: "counter_attack" }, "attacking");
    expect(getDefenseTacticKeys("A").pressingStyle).toBe("mid_block");
  });

  test("never saves the tactics (no network call)", () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (() => { calls++; return Promise.reject(new Error("no network")); }) as unknown as typeof fetch;
    try {
      applyLiveTactics("A", withLiveAxis(withLiveStyle("possession"), "defensive_line", "high"), "defensive", {});
    } finally {
      globalThis.fetch = original;
    }
    expect(calls).toBe(0);
  });
});
