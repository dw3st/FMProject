import { LEGACY_CLOCK_SCALE } from "@/GameEngine/Domain/gameState";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { formationForSimId } from "@/Domain/matchFormations";
import { emptySeasonLog, type Squad } from "@/types/playerTypes";

// Stage 16 (`DefensiveMind.ts`): off = no mind window and no lapse counted; on = lapses, more for the distracted side.
function load(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  const squad = JSON.parse(readFileSync(path, "utf8")) as Squad;
  return { ...squad, players: squad.players.map((p) => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 90 } })) };
}

function run(on: boolean, seed: number) {
  const F = formationForSimId("4-3-3");
  const r = simulateMatch(load("33.json"), load("34.json"), F, F, undefined, undefined, {
    tactics: { A: { style: "balanced" }, B: { style: "balanced" } },
    decisions: { DEFENSIVE_MIND: on },
    mental: { A: 8, B: 1 },
    clockScale: LEGACY_CLOCK_SCALE,
    seed,
  });
  return { a: r.teamStats.A, b: r.teamStats.B, score: r.score };
}

describe("defensive mind in a match", () => {
  test("off: nothing rolled, nothing counted", () => {
    const off = run(false, 31);
    expect(off.a.mindLapsesDefence + off.a.mindLapsesOffBall + off.b.mindLapsesDefence + off.b.mindLapsesOffBall).toBe(0);
    expect(off.a.mindDefenseShifts + off.b.mindDefenseShifts).toBe(0);
  }, 120_000);

  test("on: the distracted side lapses far more and drops marks", () => {
    const on = run(true, 31);
    const lapsesA = on.a.mindLapsesDefence + on.a.mindLapsesOffBall;
    const lapsesB = on.b.mindLapsesDefence + on.b.mindLapsesOffBall;
    expect(lapsesB).toBeGreaterThan(5);
    expect(lapsesB).toBeGreaterThan(lapsesA * 2);
    expect(on.a.mindDefenseShifts + on.b.mindDefenseShifts).toBeGreaterThan(0);
    expect(on.b.mindMarkDrops).toBeGreaterThan(0);
  }, 120_000);
});
