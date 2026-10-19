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

function run(weather?: EngineWeather, seed = 7) {
  const orig = Math.random;
  Math.random = mulberry32(seed);
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
    // Mean energy on the pitch after 400 ticks (first half, before any substitution): the drain itself. The end-of-match
    // average is not a fair metric (heat brings more fatigue substitutions, fresh legs lift it). Averaged over a few
    // seeds: one seed alone flips when module state left by earlier test files moves the play (full-suite order).
    const energyAt = (weather?: EngineWeather) =>
      [3, 7, 11, 19].reduce((t, seed) => t + energyAtSeed(seed, weather), 0) / 4;
    const energyAtSeed = (seed: number, weather?: EngineWeather) => {
      const orig = Math.random;
      Math.random = mulberry32(seed);
      let ticks = 0;
      let mean = 0;
      try {
        simulateMatch(A, B, DEFAULT_FORMATION, DEFAULT_FORMATION, [], [], {
          ...(weather ? { weather } : {}),
          onTick: (s) => {
            if (++ticks === 400) mean = s.players.reduce((t, p) => t + p.energy, 0) / s.players.length;
          },
        });
      } finally {
        Math.random = orig;
      }
      return mean;
    };
    expect(energyAt("hot")).toBeLessThan(energyAt());
  });

  test("gkClaimChance takes the weather multiplier", () => {
    const gk = { runtimeStats: { withoutBall: { gkPositioning: 0.6, gkReflex: 0.6 } } } as never;
    expect(gkClaimChance(gk, 1, 0.9)).toBeCloseTo(gkClaimChance(gk, 1) * 0.9, 10);
  });
});
