import { describe, expect, test } from "bun:test";
import { tickState } from "@/GameEngine/Domain/gameState";
import { gameBus, type GameEvents } from "@/GameEngine/Infrastructure/EventBus";
import { initStats, getTeamStats } from "@/GameEngine/Domain/Statistics";
import { getMomentum } from "@/GameEngine/Domain/Momentum";
import { initRatings } from "@/GameEngine/Domain/PlayerRating";
import { TEST_SCENARIOS } from "@/GameEngine/Support/TestCases";
import type { GameState } from "@/GameEngine/types";

/** Stage 17: the engine step feeds FM's momentum (touches and passes in the attacking half, shots) and the rating hooks. */
describe("momentum and rating hooks in play", () => {
  test("team A attacking from 28 yd earns momentum points; nothing reads them back", () => {
    const defaults: Partial<GameState> = {
      injuries: [], cards: [], substitutions: [], pendingSubsA: [], pendingSubsB: [], benchA: [], benchB: [], subsRemainingA: 5, subsRemainingB: 5,
    };
    let s = { ...defaults, ...TEST_SCENARIOS.find(t => t.id === "rating-chance-created")!.createState(), testMode: true } as GameState;
    initStats(s.players.map(p => ({ id: p.id, team: p.team })));
    initRatings(s.players.map(p => ({ id: p.id, team: p.team })));
    const pts: GameEvents["momentumPoints"][] = [];
    const off = gameBus.on("momentumPoints", e => pts.push(e));
    for (let i = 0; i < 60 && !s.shot && s.score.A === 0; i++) s = tickState(s, 0.2).state;
    for (let i = 0; i < 30; i++) s = tickState(s, 0.2).state;
    off();
    expect(pts.length).toBeGreaterThan(0);
    expect(pts.every(p => p.points > 0)).toBe(true);
    const a = pts.filter(p => p.team === "A").reduce((x, p) => x + p.points, 0);
    expect(getTeamStats("A").momentumPoints).toBe(a);
    expect(getMomentum().points.A).toBe(a);
    expect(getMomentum().bar).toBeGreaterThan(0);
  });
});
