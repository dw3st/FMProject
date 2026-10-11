import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { createMatchState, tickState } from "@/GameEngine/Domain/gameState";
import { DEFAULT_FORMATION } from "@/GameEngine/Domain/SimulateMatch";
import { THROUGH_BALL_CONFIG } from "@/GameEngine/Configs/ThroughBallConfig";
import { COMMIT_TICKS, EMPTY_DECISION_MEMORY, type PlayerDecision } from "@/GameEngine/Domain/DecisionTree";
import type { GameState } from "@/GameEngine/types";
import type { Squad } from "@/types/playerTypes";

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Squad;
}

/**
 * The loose ball was just collected by team A's LW, but three players of each team still carry a
 * committed `chase_loose_ball` toward the old landing point (#145).
 */
function staleChasers(): { state: GameState; chaserIds: number[] } {
  const base = createMatchState(loadSquad("33.json").players, DEFAULT_FORMATION, loadSquad("34.json").players, DEFAULT_FORMATION);
  const holder = base.players.find(p => p.team === "A" && p.role === "LW")!;
  const chase: PlayerDecision = { type: "chase_loose_ball", toX: holder.x, toY: holder.y };
  const chasers = [
    ...base.players.filter(p => p.team === "A" && p.role !== "GK" && p.id !== holder.id).slice(0, 3),
    ...base.players.filter(p => p.team === "B" && p.role !== "GK").slice(0, 3),
  ];
  const chaserIds = chasers.map(p => p.id);
  const players = base.players.map(p => ({
    ...p,
    decisionMemory: chaserIds.includes(p.id)
      ? { path: p.team === "A" ? "TEAM_WITH_BALL" as const : "TEAM_WITHOUT_BALL" as const, decision: chase, commitTicks: COMMIT_TICKS.chase_loose_ball }
      : EMPTY_DECISION_MEMORY,
  }));
  const decisions: Record<number, PlayerDecision> = {};
  for (const id of chaserIds) decisions[id] = chase;
  return {
    chaserIds,
    state: {
      ...base, players, decisions,
      matchPhase: "firstHalf", presentationCountdown: 0, setPiece: null,
      ballHolderId: holder.id, pass: null, looseBall: null, shot: null,
    } as GameState,
  };
}

describe("chasers drop the chase once the ball is collected (#145)", () => {
  test("no player keeps chase_loose_ball while the ball is held", () => {
    const { state, chaserIds } = staleChasers();
    const next = tickState(state, 0.2).state;
    for (const id of chaserIds) expect(next.decisions[id]?.type).not.toBe("chase_loose_ball");
  });

  test("the race losers are beaten (short slow recovery), the winners are not", () => {
    const { state, chaserIds } = staleChasers();
    const next = tickState(state, 0.2).state;
    for (const id of chaserIds) {
      const p = next.players.find(q => q.id === id)!;
      if (p.team === "B") {
        expect(p.recoveryTime).toBeGreaterThan(0);
        expect(p.recoveryTime).toBeLessThanOrEqual(THROUGH_BALL_CONFIG.RACE_LOSS_RECOVERY);
        expect(p.recoverySpeed).toBe(THROUGH_BALL_CONFIG.RACE_LOSS_SPEED_FACTOR);
      } else {
        expect(p.recoveryTime).toBe(0);
      }
    }
  });
});
