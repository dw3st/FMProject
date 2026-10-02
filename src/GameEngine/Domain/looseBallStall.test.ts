import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { createMatchState, tickState } from "@/GameEngine/Domain/gameState";
import { DEFAULT_FORMATION } from "@/GameEngine/Domain/SimulateMatch";
import { EMPTY_DECISION_MEMORY } from "@/GameEngine/Domain/DecisionTree";
import type { GameState } from "@/GameEngine/types";
import type { Squad } from "@/types/playerTypes";

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Squad;
}

/** A live first-half state with a resting loose ball and NOBODY committed to chase it (#36). */
function orphanLooseBall(opts: { removePasser?: boolean } = {}): GameState {
  const base = createMatchState(loadSquad("33.json").players, DEFAULT_FORMATION, loadSquad("34.json").players, DEFAULT_FORMATION);
  const passer = base.players.find(p => p.team === "A" && p.role === "CM")!;
  let players = base.players.map(p => ({ ...p, decisionMemory: EMPTY_DECISION_MEMORY }));
  if (opts.removePasser) players = players.filter(p => p.id !== passer.id);
  const holder = players.find(p => p.team === "A" && p.role === "LW")!;
  return {
    ...base,
    players,
    matchPhase: "firstHalf",
    presentationCountdown: 0,
    kickoffCountdown: 0,
    setPiece: null,
    decisions: {},
    ballHolderId: holder.id,
    looseBall: {
      x: 20, y: 60, vx: 0, vy: 0,
      startTime: base.matchTime,
      fromPasserId: passer.id,
      fromTeamLastTouch: "A",
      intendedRunnerId: null,
      receiverOffside: false,
    },
  } as GameState;
}

function ticksUntilResolved(s: GameState, maxTicks: number): number {
  for (let i = 1; i <= maxTicks; i++) {
    s = tickState(s, 0.2).state;
    if (!s.looseBall) return i;
  }
  return Infinity;
}

describe("loose ball never stalls (#36)", () => {
  test("a loose ball with no chaser gets chasers re-committed and is collected", () => {
    expect(ticksUntilResolved(orphanLooseBall(), 60)).toBeLessThan(60);
  });

  test("passer removed from the pitch (injury) — still collected", () => {
    expect(ticksUntilResolved(orphanLooseBall({ removePasser: true }), 60)).toBeLessThan(60);
  });

  test("watchdog awards a stale loose ball to the nearest player", () => {
    const s = orphanLooseBall();
    // Freeze everyone so no chaser can arrive — only the watchdog can resolve it.
    const frozen = { ...s, players: s.players.map(p => ({ ...p, recoveryTime: 1e9 })) };
    expect(ticksUntilResolved(frozen, 60)).toBeLessThan(60);
  });
});
