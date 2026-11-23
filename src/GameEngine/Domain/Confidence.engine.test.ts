import { LEGACY_CLOCK_SCALE } from "@/GameEngine/Domain/gameState";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { formationForSimId } from "@/Domain/matchFormations";
import { emptySeasonLog, type Squad } from "@/types/playerTypes";

// Phase 5 (`Confidence.ts`): off = nothing counted; on = goals and duels move confidence.
function load(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  const squad = JSON.parse(readFileSync(path, "utf8")) as Squad;
  return { ...squad, players: squad.players.map((p) => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 90 } })) };
}

function run(on: boolean, seed: number) {
  const F = formationForSimId("4-3-3");
  const r = simulateMatch(load("33.json"), load("34.json"), F, F, undefined, undefined, {
    tactics: { A: { style: "balanced" }, B: { style: "balanced" } },
    decisions: { CONFIDENCE: on },
    clockScale: LEGACY_CLOCK_SCALE,
    seed,
  });
  return { a: r.teamStats.A, b: r.teamStats.B };
}

describe("in-match confidence in a match", () => {
  test("off: no confidence change counted", () => {
    const off = run(false, 41);
    expect(off.a.confidenceRises + off.a.confidenceFalls + off.b.confidenceRises + off.b.confidenceFalls).toBe(0);
  }, 120_000);

  test("on: rises and falls are counted", () => {
    const on = run(true, 41);
    expect(on.a.confidenceRises + on.b.confidenceRises).toBeGreaterThan(0);
    expect(on.a.confidenceFalls + on.b.confidenceFalls).toBeGreaterThan(0);
  }, 120_000);
});
