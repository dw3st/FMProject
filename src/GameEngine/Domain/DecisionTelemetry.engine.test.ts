import { describe, expect, test } from "bun:test";
import { spyMatchRandom } from '@/GameEngine/Support/spyMatchRandom';
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { formationForSimId } from "@/Domain/matchFormations";
import { setDecisionTelemetry } from "@/GameEngine/Domain/Statistics";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { mulberry32 } from "@/Domain/rng";
import { emptySeasonLog, type Squad } from "@/types/playerTypes";

// Phase 2 of the FM-style decisions (`.claude/rules/game-engine/decisions.md`): the decision telemetry draws no dice and
// changes no decision, so a seeded match is the same with the listeners on and off.
function load(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  const squad = JSON.parse(readFileSync(path, "utf8")) as Squad;
  return { ...squad, players: squad.players.map((p) => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 90 } })) };
}

const TELEMETRY_KEYS = new Set([
  "holderDecisions", "offBallDecisions", "defenseDecisions",
  "holderNearTies", "offBallNearTies", "defenseNearTies",
  "holderEntropy", "offBallEntropy", "defenseEntropy",
  "holderPressureSum", "shotPressureSum", "shotPressureCount",
]);
const strip = (o: object) => Object.fromEntries(Object.entries(o).filter(([k]) => !TELEMETRY_KEYS.has(k)));

describe("decision telemetry changes nothing", () => {
  test("same seeded match with and without listeners", () => {
    const F = formationForSimId("4-3-3");
    const run = (on: boolean) => {
      setDecisionTelemetry(on);
      const spy = spyMatchRandom().mockImplementation(mulberry32(777));
      try {
        const r = simulateMatch(load("33.json"), load("34.json"), F, F, undefined, undefined, {
          tactics: { A: { style: "balanced" }, B: { style: "balanced" } },
        });
        return {
          score: r.score,
          teamStats: { A: strip(r.teamStats.A), B: strip(r.teamStats.B) },
          ratings: r.playerRatings,
          stats: [...r.playerStats].map(([id, s]) => [id, strip(s)]),
          subs: r.substitutions,
          raw: r.teamStats,
        };
      } finally {
        spy.mockRestore();
        setDecisionTelemetry(true);
      }
    };
    const off = run(false);
    expect(gameBus.has("holderDecision")).toBe(true);
    const on = run(true);
    expect(off.raw.A.holderDecisions).toBe(0);
    expect(on.raw.A.holderDecisions + on.raw.B.holderDecisions).toBeGreaterThan(200);
    expect(on.raw.A.offBallDecisions).toBeGreaterThan(0);
    expect(on.raw.A.defenseDecisions).toBeGreaterThan(0);
    expect(on.raw.A.holderEntropy).toBeGreaterThan(0);
    const { raw: _a, ...offRest } = off;
    const { raw: _b, ...onRest } = on;
    expect(onRest).toEqual(offRest);
  }, 120_000);
});
