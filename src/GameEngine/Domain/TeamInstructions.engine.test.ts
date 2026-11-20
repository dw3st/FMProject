import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { LEGACY_CLOCK_SCALE } from "@/GameEngine/Domain/gameState";
import { simulateMatch, type TeamTactics } from "@/GameEngine/Domain/SimulateMatch";
import type { Squad } from "@/types/playerTypes";

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Squad;
}

const fingerprint = (r: ReturnType<typeof simulateMatch>) => JSON.stringify({
  score: r.score,
  a: [r.teamStats.A.shots, r.teamStats.A.passesAttempted, r.teamStats.A.tackles, r.teamStats.A.fouls],
  b: [r.teamStats.B.shots, r.teamStats.B.passesAttempted, r.teamStats.B.tackles, r.teamStats.B.fouls],
});

function play(tA: TeamTactics, tB: TeamTactics, decisions?: Record<string, boolean>): string {
  return fingerprint(simulateMatch(loadSquad("33.json"), loadSquad("34.json"), undefined, undefined, undefined, undefined, {
    seed: 4242, clockScale: LEGACY_CLOCK_SCALE, tactics: { A: tA, B: tB }, ...(decisions ? { decisions } : {}),
  }));
}

describe("team instructions (stage 20): the template plays as the style always did", () => {
  test("the style's template written out = nothing written; flag off = on with nothing", () => {
    const plain = play({ style: "counter_attack" }, { style: "balanced" });
    const written = play({
      style: "counter_attack",
      instructions: {
        inPossession: { passing: 1, width: -1, tempo: 1, passTarget: 1 },
        transition: { onWin: 2, onLoss: -1 },
        outOfPossession: { line: -1, engagement: -1, pressing: -1, tackling: -1, defWidth: -1 },
      },
    }, { style: "balanced", instructions: {}, mentality: 0 });
    expect(written).toBe(plain);
    expect(play({ style: "counter_attack" }, { style: "balanced" }, { TEAM_INSTRUCTIONS: false })).toBe(plain);
  }, 120_000);
});
