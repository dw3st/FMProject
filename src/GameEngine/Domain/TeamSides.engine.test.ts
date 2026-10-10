import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { createMatchState, tickState } from "@/GameEngine/Domain/gameState";
import { slotBasePosition } from "@/GameEngine/FormationSlots";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Squad } from "@/types/playerTypes";
import type { Formation, GamePlayer, GameState } from "@/GameEngine/types";
import formation433Json from "@/Data/formations/4-3-3.json";

/**
 * #142: a left winger plays on his team's LEFT, whatever the team and the half. The formation slots
 * are drawn in Team A's frame (attacking +x, y = 0 the top touchline, which is the left of a team
 * facing +x). A team attacking −x is that frame turned 180° — x AND y mirrored — not reflected on x
 * only (which put team B's, and team A's second-half, wingers and full-backs on the wrong flank).
 */

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  const squad = JSON.parse(readFileSync(path, "utf8")) as Squad;
  return { ...squad, players: squad.players.map(p => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 100 } })) };
}

const f = formation433Json as Formation;

/** y of a point seen from the player's team: negative = his left, positive = his right. */
const sideOf = (p: GamePlayer, y: number) => (y - 37) * p.attackDir;

function checkSides(state: GameState, what: (p: GamePlayer) => number) {
  for (const p of state.players) {
    const role = p.role;
    const y = what(p);
    if (role === "LW" || role === "LB") expect(sideOf(p, y)).toBeLessThan(0);
    if (role === "RW" || role === "RB") expect(sideOf(p, y)).toBeGreaterThan(0);
  }
}

function build(): GameState {
  const home = loadSquad("33.json");
  const away = loadSquad("34.json");
  return createMatchState(home.players, f, away.players, f);
}

describe("team sides (#142)", () => {
  test("both teams anchor their left players on their own left", () => {
    const state = build();
    checkSides(state, p => slotBasePosition(p, f, "attacking").y);
    checkSides(state, p => slotBasePosition(p, f, "defending").y);
    // The kickoff layout too (set-piece slots are in the same frame).
    checkSides(state, p => p.y);
    // Y bounds are centred on the slot.
    checkSides(state, p => (p.bounds.minY + p.bounds.maxY) / 2);
  });

  test("after half-time the sides stay on the team's own left/right", () => {
    const state = { ...build(), matchPhase: "halfTime", presentationCountdown: 0.01 } as GameState;
    const after = tickState(state, 0.1).state;
    expect(after.matchPhase).toBe("secondHalf");
    expect(after.players.find(p => p.team === "A")!.attackDir).toBe(-1);
    checkSides(after, p => slotBasePosition(p, f, "attacking").y);
    checkSides(after, p => p.y);
    checkSides(after, p => (p.bounds.minY + p.bounds.maxY) / 2);
  });
});
