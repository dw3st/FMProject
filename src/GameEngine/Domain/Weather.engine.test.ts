import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { simulateMatch, DEFAULT_FORMATION } from "@/GameEngine/Domain/SimulateMatch";
import { mulberry32 } from "@/Domain/rng";
import { gkClaimChance } from "@/GameEngine/Infrastructure/ActionOutcomes";
import type { EngineWeather } from "@/GameEngine/Configs/WeatherConfig";
import { emptySeasonLog, type Squad } from "@/types/playerTypes";

/** Weather in the engine (`.claude/rules/game/weather.md`): absent / neutral changes nothing. */

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  const squad = JSON.parse(readFileSync(path, "utf8")) as Squad;
  return { ...squad, players: squad.players.map((p) => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 88, load: 0 } })) };
}

const A = loadSquad("33.json");
const B = loadSquad("34.json");

function run(weather?: EngineWeather) {
  const orig = Math.random;
  Math.random = mulberry32(7);
  try {
    return simulateMatch(A, B, DEFAULT_FORMATION, DEFAULT_FORMATION, [], [], weather ? { weather } : {});
  } finally {
    Math.random = orig;
  }
}

describe("weather in the engine", () => {
  test("absent and neutral weather play the identical match", () => {
    const base = run();
    const sunny = run("sunny");
    const cloudy = run("cloudy");
    expect(sunny.score).toEqual(base.score);
    expect(cloudy.score).toEqual(base.score);
    expect(sunny.teamStats.A.shots).toBe(base.teamStats.A.shots);
    expect(sunny.teamStats.B.passesCompleted).toBe(base.teamStats.B.passesCompleted);
    expect(sunny.teamStats.A.avgEndEnergy).toBe(base.teamStats.A.avgEndEnergy);
  });

  test("heat drains more energy", () => {
    const base = run();
    const hot = run("hot");
    expect(hot.teamStats.A.avgEndEnergy).toBeLessThan(base.teamStats.A.avgEndEnergy);
  });

  test("gkClaimChance takes the weather multiplier", () => {
    const gk = { runtimeStats: { withoutBall: { gkPositioning: 0.6, gkReflex: 0.6 } } } as never;
    expect(gkClaimChance(gk, 1, 0.9)).toBeCloseTo(gkClaimChance(gk, 1) * 0.9, 10);
  });
});
