import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import {
  createMatchState, applyTeamInstructions, applyPlayerInstruction, setManMarks, setManMarksBySlot,
  performSubstitution, changeFormation, forceInjurySubstitution,
} from "@/GameEngine/Domain/gameState";
import { assignMarkTargets } from "@/GameEngine/Domain/DefensivePositioning";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { roleEngine } from "@/GameEngine/Domain/roleEngineData";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Squad } from "@/types/playerTypes";
import type { Formation, GameState } from "@/GameEngine/types";
import type { SlotInstruction } from "@/types/tacticsTypes";
import formation433Json from "@/Data/formations/4-3-3.json";
import formation4231Json from "@/Data/formations/4-2-3-1.json";

const F433 = formation433Json as Formation;
const F4231 = formation4231Json as Formation;

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

const LB_SLOT = F433.attacking.findIndex(s => s.role === "LB");
const RB_SLOT = F433.attacking.findIndex(s => s.role === "RB");
const ST_SLOT = F433.attacking.findIndex(s => s.role === "ST");
const CM_SLOT = F433.attacking.findIndex(s => s.role === "CM");

function instructions(entries: [number, SlotInstruction][]): (SlotInstruction | null)[] {
  const list: (SlotInstruction | null)[] = Array(11).fill(null);
  for (const [slot, instr] of entries) list[slot] = instr;
  return list;
}

describe("applying instructions", () => {
  test("default instructions leave every player identical", () => {
    const s = freshState();
    const after = applyTeamInstructions(s, "A", instructions([[LB_SLOT, { press: "normal" }]]));
    const lb = (st: GameState) => st.players.find(p => p.team === "A" && p.slotIndex === LB_SLOT)!;
    expect(lb(after).engine).toBeUndefined();
    expect(lb(after).bounds).toEqual(lb(s).bounds);
    expect(lb(after).basePosition).toEqual(lb(s).basePosition);
  });

  test("a variant resolves the tuning, the anchor and the bounds (team B mirrored)", () => {
    const s = applyTeamInstructions(freshState(), "B", instructions([[LB_SLOT, { variant: "fb_overlap" }]]));
    const lb = s.players.find(p => p.team === "B" && p.slotIndex === LB_SLOT)!;
    expect(lb.instruction).toEqual({ variant: "fb_overlap" });
    expect(lb.engine!.bounds.maxX).toBe(85);
    // Team B attacks toward x 0: mirrored bounds and anchor 12 yds further toward x 0.
    expect(lb.bounds.minX).toBe(115 - 85);
    expect(lb.basePosition.x).toBe(115 - (F433.attacking[LB_SLOT]!.x + 12));
  });

  test("live change keeps energy and attributes", () => {
    const s0 = freshState();
    const s = { ...s0, players: s0.players.map(p => (p.team === "A" && p.slotIndex === ST_SLOT ? { ...p, energy: 55 } : p)) };
    const after = applyPlayerInstruction(s, "A", ST_SLOT, { variant: "st_target", press: "more" });
    const before = s.players.find(p => p.team === "A" && p.slotIndex === ST_SLOT)!;
    const st = after.players.find(p => p.team === "A" && p.slotIndex === ST_SLOT)!;
    expect(st.energy).toBe(55);
    expect(st.baseStats).toBe(before.baseStats);
    expect(st.engine!.offBallIntentWeights.offer_support).toBe(0.55);
    expect(st.engine!.defensiveIntentWeights.press_holder).toBeCloseTo(roleEngine("ST").defensiveIntentWeights.press_holder * 1.4);
    expect(after.slotInstructions!.A![ST_SLOT]).toEqual({ variant: "st_target", press: "more" });
  });

  test("a substitute inherits the slot's instruction", () => {
    const s = applyTeamInstructions(freshState(), "A", instructions([[ST_SLOT, { variant: "st_target" }]]));
    const st = s.players.find(p => p.team === "A" && p.slotIndex === ST_SLOT)!;
    const after = performSubstitution(s, "A", st.id, s.benchA[0]!.id);
    const incoming = after.players.find(p => p.team === "A" && p.slotIndex === ST_SLOT)!;
    expect(incoming.id).toBe(s.benchA[0]!.id);
    expect(incoming.instruction).toEqual({ variant: "st_target" });
    expect(incoming.engine).toBe(st.engine);
  });

  test("a formation change drops a variant the new role does not accept", () => {
    // 4-3-3 slot 7 is a CM; in 4-2-3-1 that slot is not a CM.
    const cmSlot = F433.attacking.findIndex((sl, i) => sl.role === "CM" && F4231.attacking[i]!.role !== "CM");
    const s = applyTeamInstructions(freshState(), "A", instructions([[cmSlot, { variant: "cm_box", press: "more" }]]));
    const after = changeFormation(s, "A", F4231);
    const p = after.players.find(pl => pl.team === "A" && pl.slotIndex === cmSlot)!;
    expect(p.instruction).toEqual({ press: "more" });
  });
});

describe("man-marking", () => {
  test("fixed pairs come first in the mark assignment", () => {
    const s0 = freshState();
    const star = s0.players.find(p => p.team === "B" && p.role === "LW")!;
    const s = setManMarks(s0, "A", [{ markerSlot: CM_SLOT, targetId: star.id }]);
    const marker = s.players.find(p => p.team === "A" && p.slotIndex === CM_SLOT)!;
    expect(marker.manMarkTargetId).toBe(star.id);
    const marks = assignMarkTargets(s.players, "A");
    expect(marks.get(marker.id)).toBe(star.id);
    // the marker shadows him; at most one zonal defender also picks him up (double coverage)
    expect([...marks.entries()].filter(([, t]) => t === star.id).length).toBeLessThanOrEqual(2);
  });

  test("at most two pairs, never the goalkeeper", () => {
    const s0 = freshState();
    const opps = s0.players.filter(p => p.team === "B");
    const gkB = opps.find(p => p.role === "GK")!;
    const outfield = opps.filter(p => p.role !== "GK");
    const s = setManMarks(s0, "A", [
      { markerSlot: 0, targetId: outfield[0]!.id },          // slot 0 = GK marker → skipped
      { markerSlot: CM_SLOT, targetId: gkB.id },              // GK target → skipped
      { markerSlot: LB_SLOT, targetId: outfield[1]!.id },
      { markerSlot: RB_SLOT, targetId: outfield[2]!.id },
      { markerSlot: ST_SLOT, targetId: outfield[3]!.id },     // third pair → skipped
    ]);
    expect(s.manMarks!.A).toHaveLength(2);
  });

  test("the pair follows the marker's slot and drops when the target leaves", () => {
    const s0 = freshState();
    const star = s0.players.find(p => p.team === "B" && p.role === "ST")!;
    let s = setManMarksBySlot(s0, "A", [{ slot: CM_SLOT, targetRosterId: star.rosterId }]);
    const marker = s.players.find(p => p.team === "A" && p.slotIndex === CM_SLOT)!;
    s = performSubstitution(s, "A", marker.id, s.benchA[0]!.id);
    expect(s.manMarks!.A![0]!.markerId).toBe(s0.benchA[0]!.id);
    s = performSubstitution(s, "B", star.id, s.benchB[0]!.id);
    expect(s.manMarks!.A).toHaveLength(0);
    expect(s.players.some(p => p.manMarkTargetId !== undefined)).toBe(false);
  });

  test("a marker stays tight on his target while defending (headless match)", () => {
    let sum = 0;
    let n = 0;
    let shotsMarked = 0;
    // Two matches, explicit balanced tactics (the config stores are process-global).
    const run = () => simulateMatch(HOME, AWAY, F433, F433, undefined, undefined, {
      tactics: { A: { style: "balanced", manMarks: [{ slot: CM_SLOT, targetSlot: ST_SLOT }] }, B: { style: "balanced" } },
      onTick: st => {
        if (st.matchPhase !== "firstHalf" && st.matchPhase !== "secondHalf") return;
        const holder = st.players.find(p => p.id === st.ballHolderId);
        // Settled defending only: right after a turnover the marker is still wherever he attacked.
        if (!holder || holder.team !== "B" || st.possessionTime < 3) return;
        const pair = st.manMarks?.A?.[0];
        if (!pair) return;
        const m = st.players.find(p => p.id === pair.markerId);
        const t = st.players.find(p => p.id === pair.targetId);
        if (!m || !t) return;
        sum += Math.hypot(m.x - t.x, m.y - t.y);
        n++;
      },
    });
    run();
    const result = run();
    for (const [, ps] of result.playerStats) shotsMarked += ps.markedTargetShots;
    expect(n).toBeGreaterThan(100);
    expect(sum / n).toBeLessThanOrEqual(6);
    expect(result.teamStats.B.manMarked).toBeGreaterThan(30);
    expect(shotsMarked).toBe(result.teamStats.B.markedTargetShots);
  });
});

describe("emergency goalkeeper", () => {
  test("the promoted keeper drops his slot instruction and man-marking; bounds follow the attack direction", () => {
    let s = applyTeamInstructions(freshState(), "A", Array(11).fill(null).map((_, i) => (i === 0 ? null : { press: "more" as const })));
    const outfield = s.players.filter(p => p.team === "A" && p.role !== "GK");
    const deepest = outfield.reduce((b, p) => (p.x < b.x ? p : b));
    const target = s.players.find(p => p.team === "B" && p.role === "ST")!;
    s = setManMarks(s, "A", [{ markerSlot: deepest.slotIndex, targetId: target.id }]);
    s = { ...s, subsRemainingA: 0 };
    const gk = s.players.find(p => p.team === "A" && p.role === "GK")!;
    const after = forceInjurySubstitution(s, gk, 10, "severe");
    const promoted = after.players.find(p => p.id === deepest.id)!;
    expect(promoted.role).toBe("GK");
    expect(promoted.engine).toBeUndefined();
    expect(promoted.instruction).toBeUndefined();
    expect(promoted.manMarkTargetId).toBeUndefined();
    expect(after.manMarks?.A ?? []).toHaveLength(0);
    expect(promoted.bounds.maxX).toBeLessThan(40); // attackDir 1: own goal at x 0
  });
});

describe("variants change behaviour", () => {
  test("inverted full-backs end up narrower in possession", () => {
    const avgWidth = (instr?: (SlotInstruction | null)[]) => {
      let sum = 0;
      let n = 0;
      simulateMatch(HOME, AWAY, F433, F433, undefined, undefined, {
        tactics: { A: { style: "balanced", ...(instr ? { slotInstructions: instr } : {}) }, B: { style: "balanced" } },
        onTick: st => {
          if (st.matchPhase !== "firstHalf" && st.matchPhase !== "secondHalf") return;
          const holder = st.players.find(p => p.id === st.ballHolderId);
          if (!holder || holder.team !== "A") return;
          for (const p of st.players) {
            if (p.team === "A" && (p.slotIndex === LB_SLOT || p.slotIndex === RB_SLOT) && p.id !== holder.id) {
              sum += Math.abs(p.y - 37);
              n++;
            }
          }
        },
      });
      return sum / n;
    };
    const base = avgWidth();
    const inverted = avgWidth(instructions([[LB_SLOT, { variant: "fb_inverted" }], [RB_SLOT, { variant: "fb_inverted" }]]));
    expect(inverted).toBeLessThan(base - 4);
  });
});
