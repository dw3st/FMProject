import { describe, expect, test, spyOn, afterEach } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { createMatchState, tickState, forceInjurySubstitution } from "@/GameEngine/Domain/gameState";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Squad } from "@/types/playerTypes";
import type { GameState } from "@/GameEngine/types";

/**
 * Task 2 of `docs/superpowers/plans/2026-09-28-injuries.md` — in-match injuries. See
 * `docs/superpowers/specs/2026-09-28-injuries-design.md` §1 "Na partida".
 */

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Squad;
}

function freshSquad(squad: Squad): Squad {
  return { ...squad, players: squad.players.map(p => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 100 } })) };
}

import formation433Json from "@/Data/formations/4-3-3.json";
import type { Formation } from "@/GameEngine/types";

function buildFreshState(): GameState {
  const home = freshSquad(loadSquad("33.json"));
  const away = freshSquad(loadSquad("34.json"));
  const f = formation433Json as Formation;
  return {
    ...createMatchState(home.players, f, away.players, f),
    matchPhase: "firstHalf",
    presentationCountdown: 0,
    // Skip the kickoff set-piece freeze (countdown: 2) — without this, tickState's dead-ball
    // branch returns before ever reaching the injury roll.
    setPiece: null,
  } as GameState;
}

let randomSpy: ReturnType<typeof spyOn> | null = null;

afterEach(() => {
  randomSpy?.mockRestore();
  randomSpy = null;
});

describe("in-match injuries — tickState integration", () => {
  test("a single triggered per-minute roll emits `injury`, records it on state, and force-substitutes the player", () => {
    const state = buildFreshState();
    // First player in state.players is Team A's first starter. Force ONLY that one roll to
    // trigger (Math.random() < prob is true only when the returned value is 0) — every other
    // Math.random() call (every other player's roll, plus rollSeverity()) gets 0.999, which
    // never satisfies `< prob` (prob is always « 1) and rolls "severe" for the one that did.
    let calls = 0;
    randomSpy = spyOn(Math, "random").mockImplementation(() => (calls++ === 0 ? 0 : 0.999));

    const injuredEvents: Array<{ playerId: number; team: string; severity: string }> = [];
    const unsub = gameBus.on("injury", (e) => injuredEvents.push(e));

    const injuredPlayer = state.players[0]!;
    const result = tickState(state, 0.2);
    unsub();

    expect(injuredEvents).toHaveLength(1);
    expect(injuredEvents[0]!.playerId).toBe(injuredPlayer.id);
    expect(injuredEvents[0]!.severity).toBe("severe");

    expect(result.state.injuries).toHaveLength(1);
    expect(result.state.injuries[0]!.playerRosterId).toBe(injuredPlayer.rosterId);
    expect(result.state.injuries[0]!.severity).toBe("severe");

    // Team A had 5 subs remaining and a bench — the injured starter should have been replaced,
    // not removed. The incoming player occupies the SAME slot/id as the outgoing one did not —
    // a substitution always mints a new engine id — so the old id is gone from the pitch.
    expect(result.state.subsRemainingA).toBe(4);
    expect(result.state.players.some(p => p.id === injuredPlayer.id)).toBe(false);
    expect(result.state.players.filter(p => p.team === "A")).toHaveLength(11);
    const sub = result.state.substitutions.find(s => s.playerOutId === injuredPlayer.id);
    expect(sub).toBeDefined();
  });

  test("plays on with 10 when no substitutions remain and the bench is empty", () => {
    const state = buildFreshState();
    const injuredPlayer = state.players[0]!;
    // No bench, no subs left for Team A — the only path is "remove outright".
    const noSubsState: GameState = { ...state, subsRemainingA: 0, benchA: [] };

    const result = forceInjurySubstitution(noSubsState, injuredPlayer, 12, "medium");

    expect(result.injuries).toHaveLength(1);
    expect(result.injuries[0]!.severity).toBe("medium");
    expect(result.players.some(p => p.id === injuredPlayer.id)).toBe(false);
    expect(result.players.filter(p => p.team === "A")).toHaveLength(10);
    // Ball holder must never dangle on a removed player.
    if (state.ballHolderId === injuredPlayer.id) {
      expect(result.players.some(p => p.id === result.ballHolderId)).toBe(true);
    }
  });

  test("forceInjurySubstitution reuses the best bench player for the injured player's role, tagged `reason: 'injury'`", () => {
    const state = buildFreshState();
    const injuredPlayer = state.players.find(p => p.team === "A")!;

    const reasons: Array<string | undefined> = [];
    const unsub = gameBus.on("playerSubstituted", (e) => reasons.push(e.reason));

    const result = forceInjurySubstitution(state, injuredPlayer, 30, "light");
    unsub();

    const record = result.substitutions.find(s => s.playerOutId === injuredPlayer.id);
    expect(record).toBeDefined();
    expect(reasons).toEqual(["injury"]);
    // The incoming player must actually be someone who was on Team A's bench before the sub.
    expect(state.benchA.some(b => b.id === record!.playerInId)).toBe(true);
    expect(result.benchA.some(b => b.id === record!.playerInId)).toBe(false);
    expect(result.subsRemainingA).toBe(state.subsRemainingA - 1);
  });
});
