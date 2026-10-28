import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { createMatchState, tickState, DECISION_REF_DT } from "@/GameEngine/Domain/gameState";
import { DEFAULT_FORMATION } from "@/GameEngine/Domain/SimulateMatch";
import { type PlayerDecision } from "@/GameEngine/Domain/DecisionTree";
import type { GameState } from "@/GameEngine/types";
import type { Squad } from "@/types/playerTypes";

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Squad;
}

/** Team A's CM holds the ball in midfield, live play. */
function liveState(): GameState {
  const base = createMatchState(loadSquad("33.json").players, DEFAULT_FORMATION, loadSquad("34.json").players, DEFAULT_FORMATION);
  const holder = base.players.find(p => p.team === "A" && p.role === "CM")!;
  return {
    ...base,
    matchPhase: "firstHalf", presentationCountdown: 0, setPiece: null,
    ballHolderId: holder.id, pass: null, looseBall: null, shot: null,
  } as GameState;
}

describe("decisions keep the 0.2 s cadence at any step (live match goal volume)", () => {
  test("at the reference step commitments count one per tick", () => {
    const s = liveState();
    const next = tickState(s, DECISION_REF_DT).state;
    const other = next.players.find(p => p.id !== next.ballHolderId && p.decisionMemory?.decision)!;
    const before = other.decisionMemory!.commitTicks;
    const after = tickState(next, DECISION_REF_DT).state.players.find(p => p.id === other.id)!.decisionMemory!;
    if (after.decision === other.decisionMemory!.decision && before > 0) expect(after.commitTicks).toBeCloseTo(before - 1, 9);
  });

  test("a finer step spends commitments by time, not by tick", () => {
    const dt = 0.05;
    const s = liveState();
    const next = tickState(s, dt).state;
    const other = next.players.find(p => p.id !== next.ballHolderId && (p.decisionMemory?.commitTicks ?? 0) >= 1)!;
    const before = other.decisionMemory!.commitTicks;
    const after = tickState(next, dt).state.players.find(p => p.id === other.id)!.decisionMemory!;
    const reused: PlayerDecision | null = after.decision === other.decisionMemory!.decision ? after.decision : null;
    if (reused) expect(after.commitTicks).toBeCloseTo(before - dt / DECISION_REF_DT, 9);
  });
});
