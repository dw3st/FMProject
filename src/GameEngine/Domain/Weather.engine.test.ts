import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { simulateMatch, DEFAULT_FORMATION } from "@/GameEngine/Domain/SimulateMatch";
import { mulberry32 } from "@/Domain/rng";
import { gkClaimChance } from "@/GameEngine/Infrastructure/ActionOutcomes";
import type { EngineWeather } from "@/GameEngine/Configs/WeatherConfig";
import { onDebugLog, setDebugMode, type DebugEntry } from "@/GameEngine/Support/DebugLog";
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
    // Energy spent in the first 20 ticks, same seed: too little drain to move any fatigue recompute, so both runs
    // play the same moves and only the drain differs. A later tick let module state left by earlier test files
    // (full-suite order) move the play and flip the comparison.
    const spentAt20 = (weather?: EngineWeather) => {
      const orig = Math.random;
      Math.random = mulberry32(7);
      let ticks = 0;
      let start = 0;
      let spent = 0;
      try {
        simulateMatch(A, B, DEFAULT_FORMATION, DEFAULT_FORMATION, [], [], {
          ...(weather ? { weather } : {}),
          onTick: (s) => {
            const total = s.players.reduce((t, p) => t + p.energy, 0);
            if (++ticks === 1) start = total;
            if (ticks === 20) spent = start - total;
          },
        });
      } finally {
        Math.random = orig;
      }
      return spent;
    };
    const base = spentAt20();
    expect(base).toBeGreaterThan(0);
    expect(spentAt20("hot")).toBeGreaterThan(base);
  });

  test("gkClaimChance takes the weather multiplier", () => {
    const gk = { runtimeStats: { withoutBall: { gkPositioning: 0.6, gkReflex: 0.6 } } } as never;
    expect(gkClaimChance(gk, 1, 0.9)).toBeCloseTo(gkClaimChance(gk, 1) * 0.9, 10);
  });

  test("/test logs each lance the weather changed, with weatherMult; neutral weather logs none", () => {
    const linesOf = (weather?: EngineWeather) => {
      const seen = new Map<number, DebugEntry>();
      setDebugMode(true);
      const off = onDebugLog((log) => { for (const e of log) if (e.category === "weather") seen.set(e.id, e); });
      try {
        run(weather, 3);
      } finally {
        off();
        setDebugMode(false);
      }
      return [...seen.values()];
    };
    const rain = linesOf("rain");
    const levers = new Set(rain.map((e) => e.data?.lever));
    expect(levers.has("control")).toBe(true);
    expect(levers.has("looseDecel")).toBe(true);
    for (const e of rain.filter((x) => x.data?.lever)) {
      expect(e.data?.weatherMult).not.toBe(1);
      expect(e.message).toContain("×");
    }
    // Only the match-start line (the weather name) for a neutral weather: no lance changed.
    expect(linesOf("sunny").filter((e) => e.data?.lever)).toEqual([]);
  }, 60_000);
});
