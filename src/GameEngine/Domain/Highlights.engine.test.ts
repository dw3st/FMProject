import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { highlightsAtLevel } from "@/GameEngine/Domain/Highlights";
import type { Squad } from "@/types/playerTypes";

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Squad;
}

describe("highlights in a headless match (stage 18)", () => {
  test("the match result carries the lances, deterministic by seed, every goal inside a main lance", () => {
    const a = simulateMatch(loadSquad("33.json"), loadSquad("34.json"), undefined, undefined, undefined, undefined, { seed: 4242 });
    const b = simulateMatch(loadSquad("33.json"), loadSquad("34.json"), undefined, undefined, undefined, undefined, { seed: 4242 });
    expect(a.highlights.length).toBeGreaterThan(0);
    expect(b.highlights).toEqual(a.highlights);
    expect(a.liveSeconds).toBeGreaterThan(200);
    const goals = a.score.A + a.score.B;
    const goalTriggers = highlightsAtLevel(a.highlights, "main").flatMap(h => h.triggers).filter(t => t === "goal").length;
    expect(goalTriggers).toBe(goals);
    for (let i = 1; i < a.highlights.length; i++) expect(a.highlights[i]!.start).toBeGreaterThanOrEqual(a.highlights[i - 1]!.end);
    // The team stats carry the counts (cumulative levels).
    const t = a.teamStats;
    expect(t.A.highlightsFull + t.B.highlightsFull).toBeCloseTo(a.highlights.length, 5);
    expect(t.A.highlightsMain + t.B.highlightsMain).toBeLessThanOrEqual(t.A.highlightsExtended + t.B.highlightsExtended);
  }, 60_000);
});
