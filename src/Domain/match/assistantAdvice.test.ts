import { describe, expect, test } from "bun:test";
import { assistantAdvice } from "@/Domain/match/assistantAdvice";
import type { GameState } from "@/GameEngine/types";

const pl = (id: number, team: "A" | "B", role: string, energy = 90, name = `P${id}`) => ({ id, team, role, energy, name });
const state = (over: Partial<Record<string, unknown>> = {}) => ({
  matchPhase: "secondHalf", score: { A: 0, B: 0 }, subsRemainingA: 3, subsRemainingB: 3,
  benchA: [pl(50, "A", "CM")], benchB: [], pendingSubsA: [], pendingSubsB: [], cards: [], manMarks: {},
  players: [pl(1, "A", "GK", 40), pl(2, "A", "CB", 60, "Tired CB"), pl(3, "A", "ST", 80), pl(11, "B", "ST"), pl(12, "B", "CM")],
  ...over,
}) as unknown as GameState;
const none = () => ({ shots: 0, goals: 0 });

describe("assistant advice", () => {
  test("nothing before kick-off or at half time", () => {
    expect(assistantAdvice(state({ matchPhase: "halfTime" }), "A", 60, "balanced", none)).toEqual([]);
  });
  test("chasing late asks for attack, protecting a one-goal lead asks for defence", () => {
    expect(assistantAdvice(state({ score: { A: 0, B: 1 } }), "A", 75, "balanced", none).map((t) => t.kind)).toContain("attack");
    expect(assistantAdvice(state({ score: { A: 0, B: 1 } }), "A", 75, "attacking", none).map((t) => t.kind)).not.toContain("attack");
    expect(assistantAdvice(state({ score: { A: 1, B: 0 } }), "A", 85, "balanced", none).map((t) => t.kind)).toContain("protect");
  });
  test("the most tired outfield starter, never the keeper, only with subs left", () => {
    const tips = assistantAdvice(state(), "A", 65, "balanced", none);
    expect(tips.find((t) => t.kind === "tired")).toMatchObject({ playerId: 2, energy: 60 });
    expect(assistantAdvice(state({ subsRemainingA: 0 }), "A", 65, "balanced", none).some((t) => t.kind === "tired")).toBe(false);
  });
  test("booked defender and the dangerous opponent to man-mark", () => {
    const tips = assistantAdvice(state({ cards: [{ team: "A", playerId: 2, card: "yellow" }] }), "A", 70, "balanced",
      (id) => (id === 11 ? { shots: 2, goals: 1 } : { shots: 0, goals: 0 }));
    expect(tips.map((t) => t.kind)).toEqual(["tired", "booked", "mark"]);
    expect(tips[2]).toMatchObject({ playerId: 11 });
  });
});
