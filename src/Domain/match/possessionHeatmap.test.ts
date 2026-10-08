import { describe, expect, test } from "bun:test";
import type { GameState } from "@/GameEngine/types";
import {
  HEATMAP_CELLS, HEATMAP_COLS, addSample, cellOf, createPossessionHeatmap, displayAttackDir, displayColRow,
  exportPossessionHeatmap, heatmapCells, importPossessionHeatmap, possessingTeam, samplePossessionHeatmap,
} from "@/Domain/match/possessionHeatmap";
import { PITCH_LENGTH } from "@/GameEngine/Domain/pitch";

function state(over: Partial<{ holder: number | null; dirA: 1 | -1; ballX: number; ballY: number; time: number; phase: string }>): GameState {
  const dirA = over.dirA ?? 1;
  const holder = over.holder === undefined ? 1 : over.holder;
  return {
    players: [
      { id: 1, team: "A", attackDir: dirA, x: over.ballX ?? 10, y: over.ballY ?? 5 },
      { id: 2, team: "B", attackDir: -dirA, x: over.ballX ?? 10, y: over.ballY ?? 5 },
    ],
    ballHolderId: holder,
    pass: null,
    shot: null,
    looseBall: null,
    matchTime: over.time ?? 0,
    matchPhase: over.phase ?? "firstHalf",
  } as unknown as GameState;
}

const sum = (a: Float64Array) => a.reduce((s, v) => s + v, 0);

describe("possession heat map", () => {
  test("cells cover the pitch and clamp at the edges", () => {
    expect(cellOf(0, 0)).toBe(0);
    expect(cellOf(PITCH_LENGTH, 74)).toBe(HEATMAP_CELLS - 1);
    expect(cellOf(-5, 200)).toBe(HEATMAP_CELLS - HEATMAP_COLS);
  });

  test("samples weigh the game-seconds since the previous emission, live phases only", () => {
    const acc = createPossessionHeatmap();
    samplePossessionHeatmap(acc, state({ time: 0 }));
    samplePossessionHeatmap(acc, state({ time: 4 }));
    expect(sum(heatmapCells(acc, "A", "all"))).toBe(4);
    expect(sum(heatmapCells(acc, "B", "all"))).toBe(0);
    // Half-time: no sample; the new phase restarts the clock (no negative / jump).
    samplePossessionHeatmap(acc, state({ time: 10, phase: "halfTime" }));
    samplePossessionHeatmap(acc, state({ time: 0, phase: "secondHalf", holder: 2 }));
    samplePossessionHeatmap(acc, state({ time: 3, phase: "secondHalf", holder: 2 }));
    expect(sum(heatmapCells(acc, "A", "all"))).toBe(4);
    expect(sum(heatmapCells(acc, "B", "all"))).toBe(3);
  });

  test("no possession (loose ball) is not counted; a pass in the air counts for the passer", () => {
    expect(possessingTeam(state({ holder: null }))).toBeNull();
    const s = { ...state({ holder: null }), pass: { fromId: 2 } } as unknown as GameState;
    expect(possessingTeam(s)).toBe("B");
  });

  test("the stored frame undoes the side switch (team A always attacks +x)", () => {
    const acc = createPossessionHeatmap();
    samplePossessionHeatmap(acc, state({ time: 0, dirA: -1, ballX: 5, ballY: 5 }));
    samplePossessionHeatmap(acc, state({ time: 2, dirA: -1, ballX: 5, ballY: 5 }));
    const cells = heatmapCells(acc, "A", "all");
    expect(cells[cellOf(PITCH_LENGTH - 5, 5)]).toBe(2);
    expect(cells[cellOf(5, 5)]).toBe(0);
  });

  test("the recent window keeps the last 10 played minutes", () => {
    const acc = createPossessionHeatmap();
    addSample(acc, "A", 5, 5, 60);         // minute 0
    for (let m = 1; m < 12; m++) addSample(acc, "A", 100, 60, 60); // minutes 1..11
    addSample(acc, "A", 100, 60, 1);       // minute 12 (current, partial)
    const recent = heatmapCells(acc, "A", "recent");
    expect(recent[cellOf(5, 5)]).toBe(0);
    expect(recent[cellOf(100, 60)]).toBe(9 * 60 + 1);
    expect(sum(heatmapCells(acc, "A", "all"))).toBe(12 * 60 + 1);
  });

  test("display mirrors the columns and the attack direction when away", () => {
    expect(displayColRow(0, false)).toEqual({ col: 0, row: 0 });
    expect(displayColRow(0, true)).toEqual({ col: HEATMAP_COLS - 1, row: 0 });
    expect(displayColRow(HEATMAP_COLS + 2, true)).toEqual({ col: HEATMAP_COLS - 3, row: 1 });
    expect(displayAttackDir("A", false)).toBe(1);
    expect(displayAttackDir("A", true)).toBe(-1);
    expect(displayAttackDir("B", true)).toBe(1);
  });

  test("export / import round-trips; a malformed snapshot gives an empty map", () => {
    const acc = createPossessionHeatmap();
    addSample(acc, "B", 50, 30, 75);
    const back = importPossessionHeatmap(JSON.parse(JSON.stringify(exportPossessionHeatmap(acc))), { matchTime: 9, matchPhase: "secondHalf" });
    expect(Array.from(heatmapCells(back, "B", "recent"))).toEqual(Array.from(heatmapCells(acc, "B", "recent")));
    expect(back.played).toBe(75);
    expect(back.lastTime).toBe(9);
    const bad = importPossessionHeatmap({ total: { A: [1] } }, { matchTime: 0, matchPhase: "firstHalf" });
    expect(sum(heatmapCells(bad, "A", "all"))).toBe(0);
  });
});
