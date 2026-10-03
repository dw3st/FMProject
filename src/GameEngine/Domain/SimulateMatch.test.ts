import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import type { Squad } from "@/types/playerTypes";

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Squad;
}

describe("simulateMatch pass accounting", () => {
  // Every counted pass must end in passCompleted or passFailed. Through balls have their own
  // stat family (throughBallStarted → Completed / LostInFlight / LostInRace / LostInDuel) and
  // must not be counted as passes. Slack covers a pass still in flight at the final whistle.
  test("passesAttempted ≈ passesCompleted + passesFailed, and through balls are not passes", () => {
    let throughBalls = 0;
    const off = gameBus.on("throughBallStarted", () => { throughBalls++; });
    const result = simulateMatch(loadSquad("33.json"), loadSquad("34.json"));
    off();

    for (const team of ["A", "B"] as const) {
      const t = result.teamStats[team];
      const unresolved = t.passesAttempted - t.passesCompleted - t.passesFailed;
      expect(unresolved).toBeGreaterThanOrEqual(0);
      expect(unresolved).toBeLessThanOrEqual(2);
    }
    // Sanity: the match did play through balls, so the check above is meaningful.
    expect(throughBalls).toBeGreaterThan(0);
  }, 30_000);
});

describe("simulateMatch knockout", () => {
  test("never ends level; decider is consistent with the score", () => {
    const squad = loadSquad("33.json");
    for (let i = 0; i < 6; i++) {
      // Same squad both sides → many level games after 90'.
      const r = simulateMatch(squad, squad, undefined, undefined, undefined, undefined, { knockout: true });
      const d = r.decider;
      let goalsFromPlayers = 0;
      for (const s of r.playerStats.values()) goalsFromPlayers += s.goals;
      expect(goalsFromPlayers).toBe(r.score.A + r.score.B); // shootout kicks are not goals
      if (!d) {
        expect(r.score.A).not.toBe(r.score.B);
        continue;
      }
      if (d.penalties) {
        expect(r.score.A).toBe(r.score.B);
        expect(d.penalties.A).not.toBe(d.penalties.B);
        expect(d.winner).toBe(d.penalties.A > d.penalties.B ? "A" : "B");
      } else {
        expect(r.score.A).not.toBe(r.score.B);
      }
      expect(r.teamStats.A.extraTimePlayed).toBe(1);
      expect(r.teamStats.B.extraTimePlayed).toBe(1);
    }
  }, 120_000);

  test("league match reports no decider", () => {
    const r = simulateMatch(loadSquad("33.json"), loadSquad("34.json"));
    expect(r.decider).toBeNull();
  }, 30_000);

  test("second leg: aggregate decides whether the tie is level", () => {
    const squad = loadSquad("33.json");
    for (let i = 0; i < 4; i++) {
      const r = simulateMatch(squad, squad, undefined, undefined, undefined, undefined, {
        knockout: true,
        aggregate: { A: 3, B: 0 },
      });
      // Extra time happens only when the 90' score levels the aggregate (B ahead by exactly 3).
      const et = r.decider?.extraTime ?? { A: 0, B: 0 };
      const regulationDiff = r.score.B - et.B - (r.score.A - et.A);
      expect(r.decider !== null).toBe(regulationDiff === 3);
    }
  }, 120_000);
});

describe("simulateMatch tactics option", () => {
  test("applies tactics per match and does not leak between matches", async () => {
    const { getTeamTacticalStyle } = await import("@/GameEngine/Configs/AttackConfig");
    const { getDefenseTacticKeys } = await import("@/GameEngine/Configs/DefenseConfig");
    const a = loadSquad("33.json");
    const b = loadSquad("34.json");
    simulateMatch(a, b, undefined, undefined, undefined, undefined, {
      tactics: {
        A: { style: "high_press" as never, axesOverride: { defensive_line: "deep" } },
        B: { style: "balanced" as never },
      },
    });
    expect(getTeamTacticalStyle("A")).toBe("high_press" as never);
    expect(getDefenseTacticKeys("A").pressingStyle).toBe("high_press");
    expect(getDefenseTacticKeys("A").defensiveLine).toBe("deep");
    expect(getTeamTacticalStyle("B")).toBe("balanced" as never);
    // The next match applies its own tactics: A's previous style must not survive.
    simulateMatch(a, b, undefined, undefined, undefined, undefined, {
      tactics: { A: { style: "balanced" as never }, B: { style: "balanced" as never } },
    });
    expect(getTeamTacticalStyle("A")).toBe("balanced" as never);
    expect(getDefenseTacticKeys("A").defensiveLine).not.toBe("deep");
  });
});

describe("simulateMatch: style familiarity execution", () => {
  test("without `tactics` a previous familiarity never leaks; executionFamiliarity sets it", async () => {
    const { applyTeamAttackConfig } = await import("@/GameEngine/Configs/AttackConfig");
    const { getTeamExecutionMult, FAMILIARITY_ENGINE } = await import("@/GameEngine/Configs/FamiliarityConfig");
    const squad = loadSquad("33.json");
    applyTeamAttackConfig("A", "possession", "balanced", undefined, { possession: 100 });
    expect(getTeamExecutionMult("A")).toBeGreaterThan(1);
    simulateMatch(squad, squad);
    expect(getTeamExecutionMult("A")).toBe(1);
    simulateMatch(squad, squad, undefined, undefined, undefined, undefined, { executionFamiliarity: { B: 100 } });
    expect(getTeamExecutionMult("A")).toBe(1);
    expect(getTeamExecutionMult("B")).toBeCloseTo(1 + FAMILIARITY_ENGINE.EXECUTION_STAT_SCALE);
  }, 60_000);
});
