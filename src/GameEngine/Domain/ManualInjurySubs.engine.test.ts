import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { createMatchState, forceInjurySubstitution, fillInjuryVacancy } from "@/GameEngine/Domain/gameState";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Squad } from "@/types/playerTypes";
import type { Formation, GameState } from "@/GameEngine/types";
import formation433Json from "@/Data/formations/4-3-3.json";

/** #140: in the live match the human team picks the replacement of an injured player. */

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Squad;
}

function freshSquad(squad: Squad): Squad {
  return { ...squad, players: squad.players.map(p => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 100 } })) };
}

function buildState(manual: boolean): GameState {
  const f = formation433Json as Formation;
  const base = createMatchState(freshSquad(loadSquad("33.json")).players, f, freshSquad(loadSquad("34.json")).players, f);
  return {
    ...base,
    matchPhase: "firstHalf",
    presentationCountdown: 0,
    setPiece: null,
    ...(manual ? { manualInjurySubs: { A: true as const } } : {}),
  } as GameState;
}

const teamA = (s: GameState) => s.players.filter(p => p.team === "A");
const outfieldA = (s: GameState) => teamA(s).find(p => p.role !== "GK")!;

describe("manual injury substitutions (#140)", () => {
  test("without the option the injured player is replaced automatically (as before)", () => {
    const state = buildState(false);
    const player = outfieldA(state);
    const needs: unknown[] = [];
    const off = gameBus.on("injuryNeedsSub", (e) => needs.push(e));
    const after = forceInjurySubstitution(state, player, 10, "medium");
    off();
    expect(needs).toHaveLength(0);
    expect(after.subsRemainingA).toBe(4);
    expect(teamA(after)).toHaveLength(11);
    expect(after.injuryVacancies?.A ?? []).toHaveLength(0);
  });

  test("with the option the player leaves without a sub, the slot waits and the event fires", () => {
    const state = buildState(true);
    const player = outfieldA(state);
    const needs: Array<{ team: string; injuredId: number; slotIndex: number; suggestedInId: number | null }> = [];
    const off = gameBus.on("injuryNeedsSub", (e) => needs.push(e));
    const after = forceInjurySubstitution(state, player, 10, "medium");
    off();
    expect(after.subsRemainingA).toBe(5);
    expect(after.substitutions).toHaveLength(0);
    expect(teamA(after)).toHaveLength(10);
    expect(after.injuries).toHaveLength(1);
    expect(needs).toHaveLength(1);
    expect(needs[0]!.injuredId).toBe(player.id);
    expect(needs[0]!.slotIndex).toBe(player.slotIndex);
    expect(needs[0]!.suggestedInId).not.toBeNull();
    expect(after.injuryVacancies?.A).toHaveLength(1);

    // The manager fills the slot with the suggested bench player.
    const inId = needs[0]!.suggestedInId!;
    const filled = fillInjuryVacancy(after, "A", player.id, inId);
    expect(teamA(filled)).toHaveLength(11);
    expect(filled.subsRemainingA).toBe(4);
    expect(filled.injuryVacancies?.A).toHaveLength(0);
    const incoming = filled.players.find(p => p.id === inId)!;
    expect(incoming.slotIndex).toBe(player.slotIndex);
    expect(filled.benchA.some(p => p.id === inId)).toBe(false);
    expect(filled.substitutions[0]!.playerOutId).toBe(player.id);
  });

  test("the AI side (B) stays automatic even with the option on A", () => {
    const state = buildState(true);
    const playerB = state.players.find(p => p.team === "B" && p.role !== "GK")!;
    const after = forceInjurySubstitution(state, playerB, 10, "light");
    expect(after.subsRemainingB).toBe(4);
    expect(after.players.filter(p => p.team === "B")).toHaveLength(11);
  });

  test("no subs left: plays on with 10 and no vacancy (as before)", () => {
    const state = { ...buildState(true), subsRemainingA: 0 };
    const player = outfieldA(state);
    const needs: unknown[] = [];
    const off = gameBus.on("injuryNeedsSub", (e) => needs.push(e));
    const after = forceInjurySubstitution(state, player, 80, "light");
    off();
    expect(needs).toHaveLength(0);
    expect(teamA(after)).toHaveLength(10);
    expect(after.injuryVacancies?.A ?? []).toHaveLength(0);
  });

  test("never more open vacancies than substitutions left", () => {
    let state: GameState = { ...buildState(true), subsRemainingA: 2 };
    const needs: unknown[] = [];
    const off = gameBus.on("injuryNeedsSub", (e) => needs.push(e));
    for (const p of teamA(state).filter(q => q.role !== "GK").slice(0, 4)) {
      state = forceInjurySubstitution(state, p, 20, "light");
    }
    off();
    expect(needs).toHaveLength(2);
    expect(state.injuryVacancies?.A).toHaveLength(2);
    expect(teamA(state)).toHaveLength(7);
  });

  test("an injured keeper never leaves the team without a keeper; the reserve keeper goes in goal", () => {
    const state = buildState(true);
    const gk = teamA(state).find(p => p.role === "GK")!;
    const after = forceInjurySubstitution(state, gk, 30, "severe");
    const emergency = teamA(after).find(p => p.role === "GK");
    expect(emergency).toBeDefined();
    expect(emergency!.id).not.toBe(gk.id);
    const vacancy = after.injuryVacancies!.A![0]!;
    expect(vacancy.promotedId).toBe(emergency!.id);

    const reserveGk = after.benchA.find(p => p.role === "GK");
    expect(reserveGk).toBeDefined(); // Man United carries a reserve keeper
    if (!reserveGk) return;
    expect(vacancy.suggestedInId).toBe(reserveGk.id);
    const filled = fillInjuryVacancy(after, "A", gk.id, reserveGk.id);
    const inGoal = teamA(filled).filter(p => p.role === "GK");
    expect(inGoal.map(p => p.id)).toEqual([reserveGk.id]);
    expect(filled.players.find(p => p.id === reserveGk.id)!.slotIndex).toBe(0);
    // The emergency keeper is back in his own slot.
    expect(filled.players.find(p => p.id === emergency!.id)!.slotIndex).toBe(vacancy.slotIndex);
    expect(teamA(filled)).toHaveLength(11);
    expect(new Set(teamA(filled).map(p => p.slotIndex)).size).toBe(11);
  });

  test("filling is refused without a vacancy or a sub left", () => {
    const state = buildState(true);
    const player = outfieldA(state);
    const after = forceInjurySubstitution(state, player, 10, "medium");
    const inId = after.injuryVacancies!.A![0]!.suggestedInId!;
    expect(fillInjuryVacancy(after, "A", 99999, inId)).toBe(after);
    const noSubs = { ...after, subsRemainingA: 0 };
    expect(fillInjuryVacancy(noSubs, "A", player.id, inId)).toBe(noSubs);
  });
});
