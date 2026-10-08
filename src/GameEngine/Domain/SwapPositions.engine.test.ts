import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { createMatchState, applyPlayerInstruction, setManMarks, swapPlayerPositions } from "@/GameEngine/Domain/gameState";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Squad } from "@/types/playerTypes";
import type { Formation, GamePlayer, GameState } from "@/GameEngine/types";
import formation433Json from "@/Data/formations/4-3-3.json";

const F433 = formation433Json as Formation;

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  const squad = JSON.parse(readFileSync(path, "utf8")) as Squad;
  return { ...squad, players: squad.players.map(p => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 90 } })) };
}

const HOME = loadSquad("33.json");
const AWAY = loadSquad("34.json");

function freshState(): GameState {
  return { ...createMatchState(HOME.players, F433, AWAY.players, F433), matchPhase: "firstHalf", presentationCountdown: 0 } as GameState;
}

const slotOf = (role: string) => F433.attacking.findIndex(s => s.role === role);
const at = (s: GameState, team: "A" | "B", slot: number): GamePlayer => s.players.find(p => p.team === team && p.slotIndex === slot)!;
const byId = (s: GameState, id: number): GamePlayer => s.players.find(p => p.id === id)!;

describe("swapPlayerPositions", () => {
  test("two starters swap slot, role, anchor and bounds; energy, place and subs stay", () => {
    const s0 = freshState();
    const lw = at(s0, "A", slotOf("LW"));
    const rw = at(s0, "A", slotOf("RW"));
    const tired = { ...s0, players: s0.players.map(p => (p.id === lw.id ? { ...p, energy: 61 } : p)) };
    const s = swapPlayerPositions(tired, "A", lw.id, rw.id);

    const lwAfter = byId(s, lw.id);
    const rwAfter = byId(s, rw.id);
    expect(lwAfter.slotIndex).toBe(rw.slotIndex);
    expect(lwAfter.role).toBe("RW");
    expect(lwAfter.basePosition).toEqual(rw.basePosition);
    expect(lwAfter.bounds).toEqual(rw.bounds);
    expect(rwAfter.slotIndex).toBe(lw.slotIndex);
    expect(rwAfter.role).toBe("LW");
    expect(rwAfter.basePosition).toEqual(lw.basePosition);
    expect(rwAfter.bounds).toEqual(lw.bounds);

    expect(lwAfter.energy).toBe(61);
    expect(lwAfter.x).toBe(lw.x);
    expect(lwAfter.y).toBe(lw.y);
    expect(s.subsRemainingA).toBe(s0.subsRemainingA);
    expect(s.substitutions).toEqual(s0.substitutions);
    expect(s.formationA).toBe(s0.formationA);
    expect(s.players.filter(p => p.team === "A").map(p => p.slotIndex).sort((a, b) => a - b))
      .toEqual(s0.players.filter(p => p.team === "A").map(p => p.slotIndex).sort((a, b) => a - b));
  });

  test("swapping back restores both players (stats rebuilt for the slot role)", () => {
    const s0 = freshState();
    const cb = at(s0, "A", slotOf("CB"));
    const st = at(s0, "A", slotOf("ST"));
    const swapped = swapPlayerPositions(s0, "A", cb.id, st.id);
    // Out of position the striker plays the centre-back slot with that role's derived stats.
    expect(byId(swapped, st.id).baseStats).not.toEqual(st.baseStats);
    const back = swapPlayerPositions(swapped, "A", cb.id, st.id);
    for (const original of [cb, st]) {
      const p = byId(back, original.id);
      expect(p.slotIndex).toBe(original.slotIndex);
      expect(p.role).toBe(original.role);
      expect(p.baseStats).toEqual(original.baseStats);
      expect(p.bounds).toEqual(original.bounds);
      expect(p.basePosition).toEqual(original.basePosition);
    }
  });

  test("the slot's instruction and man-marking stay with the slot", () => {
    const LB = slotOf("LB");
    const RB = slotOf("RB");
    let s = applyPlayerInstruction(freshState(), "A", LB, { variant: "fb_overlap" });
    const target = at(s, "B", slotOf("ST"));
    s = setManMarks(s, "A", [{ markerSlot: LB, targetId: target.id }]);
    const lb = at(s, "A", LB);
    const rb = at(s, "A", RB);
    const after = swapPlayerPositions(s, "A", lb.id, rb.id);
    const newLb = at(after, "A", LB);
    expect(newLb.id).toBe(rb.id);
    expect(newLb.instruction).toEqual({ variant: "fb_overlap" });
    expect(newLb.manMarkTargetId).toBe(target.id);
    expect(byId(after, lb.id).instruction).toBeUndefined();
    expect(byId(after, lb.id).manMarkTargetId).toBeUndefined();
    expect(after.manMarks?.A?.[0]?.markerId).toBe(rb.id);
  });

  test("goalkeepers, the same player and opponents are refused (state unchanged)", () => {
    const s = freshState();
    const gk = at(s, "A", slotOf("GK"));
    const cb = at(s, "A", slotOf("CB"));
    const opp = at(s, "B", slotOf("CB"));
    expect(swapPlayerPositions(s, "A", gk.id, cb.id)).toBe(s);
    expect(swapPlayerPositions(s, "A", cb.id, cb.id)).toBe(s);
    expect(swapPlayerPositions(s, "A", cb.id, opp.id)).toBe(s);
    expect(swapPlayerPositions(s, "A", cb.id, 99999)).toBe(s);
  });

  test("works for the mirrored team B", () => {
    const s0 = freshState();
    const lw = at(s0, "B", slotOf("LW"));
    const rw = at(s0, "B", slotOf("RW"));
    const s = swapPlayerPositions(s0, "B", lw.id, rw.id);
    expect(byId(s, lw.id).basePosition).toEqual(rw.basePosition);
    expect(byId(s, lw.id).bounds).toEqual(rw.bounds);
    expect(byId(s, lw.id).role).toBe("RW");
  });
});
