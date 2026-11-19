import { describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { formationForSimId } from "@/Domain/matchFormations";
import { mulberry32 } from "@/Domain/rng";
import { emptySeasonLog, type Squad } from "@/types/playerTypes";

// Phase 3 of the FM-style decisions (`.claude/rules/game-engine/decisions.md`): with HOLDER off nothing reads the mental
// profile and no die is drawn by the holder mind; with it on the holder picks away from the true argmax sometimes.
function load(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  const squad = JSON.parse(readFileSync(path, "utf8")) as Squad;
  return { ...squad, players: squad.players.map((p) => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 90 } })) };
}

function run(holder: boolean, mental?: { A?: number; B?: number }) {
  const F = formationForSimId("4-3-3");
  let draws = 0;
  const rng = mulberry32(4242);
  const spy = spyOn(Math, "random").mockImplementation(() => { draws++; return rng(); });
  try {
    const r = simulateMatch(load("33.json"), load("34.json"), F, F, undefined, undefined, {
      tactics: { A: { style: "balanced" }, B: { style: "balanced" } },
      decisions: { HOLDER: holder },
      ...(mental ? { mental } : {}),
    });
    return { score: r.score, ratings: r.playerRatings, a: r.teamStats.A, b: r.teamStats.B, draws };
  } finally {
    spy.mockRestore();
  }
}

describe("holder mind", () => {
  test("off: the mental profile is never read and no extra die is drawn", () => {
    const sharp = run(false, { A: 8, B: 8 });
    const dull = run(false, { A: 2, B: 2 });
    expect(dull.score).toEqual(sharp.score);
    expect(dull.ratings).toEqual(sharp.ratings);
    expect(dull.draws).toBe(sharp.draws);
    expect(sharp.a.holderMindDecisions + sharp.b.holderMindDecisions).toBe(0);
  }, 180_000);

  test("on: the mind runs, deviates from the argmax and the level matters", () => {
    const on = run(true, { A: 8, B: 2 });
    expect(on.a.holderMindDecisions).toBeGreaterThan(100);
    expect(on.a.holderWindows).toBeGreaterThan(10);
    expect(on.a.holderWindows).toBeLessThan(on.a.holderMindDecisions);
    expect(on.b.holderOffArgmax / on.b.holderMindDecisions).toBeGreaterThan(on.a.holderOffArgmax / on.a.holderMindDecisions);
  }, 180_000);
});
