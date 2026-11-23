import { afterEach, describe, expect, test } from "bun:test";
import { CONFIDENCE, DECISION_FLAGS, setDecisionFlags } from "@/GameEngine/Configs/DecisionConfig";
import { applyConfidence, effectiveMood, goalConfidenceChanges, nextConfidence, withGoalConfidence } from "@/GameEngine/Domain/Confidence";
import type { GamePlayer } from "@/GameEngine/types";

function player(id: number, team: "A" | "B", role = "CM", mood = 0): GamePlayer {
  return { id, team, role, name: `P${id}`, mental: { decisions: 0.4, composure: 0.4, flair: 0.4, anticipation: 0.4, consistency: 0.5, mood } } as unknown as GamePlayer;
}

afterEach(() => setDecisionFlags());

describe("in-match confidence", () => {
  test("effective mood: absent confidence = the kickoff mood, else mood + confidence clamped", () => {
    expect(effectiveMood({ mood: 0.2 })).toBe(0.2);
    expect(effectiveMood({ mood: 0.2, confidence: 0.3 })).toBeCloseTo(0.5);
    expect(effectiveMood({ mood: 0.9, confidence: 0.4 })).toBe(1);
  });

  test("confidence is capped", () => {
    expect(nextConfidence(0.35, 0.3)).toBe(CONFIDENCE.CAP);
    expect(nextConfidence(undefined, -1)).toBe(-CONFIDENCE.CAP);
  });

  test("a goal: scorer, assister, teammates up; the other side and its keeper down", () => {
    const ps = [player(1, "A", "ST"), player(2, "A"), player(3, "A"), player(4, "B", "GK"), player(5, "B", "CB")];
    const changes = goalConfidenceChanges(ps, "A", 1, 2);
    const sum = (id: number) => changes.filter(c => c.playerId === id).reduce((a, c) => a + c.delta, 0);
    expect(sum(1)).toBe(CONFIDENCE.GOAL);
    expect(sum(2)).toBe(CONFIDENCE.ASSIST);
    expect(sum(3)).toBe(CONFIDENCE.TEAM_GOAL);
    expect(sum(4)).toBeCloseTo(CONFIDENCE.TEAM_CONCEDED + CONFIDENCE.KEEPER_CONCEDED);
    expect(sum(5)).toBe(CONFIDENCE.TEAM_CONCEDED);
    const out = withGoalConfidence(ps, "A", 1, 2);
    expect(out[0]!.mental!.confidence).toBe(CONFIDENCE.GOAL);
    expect(out[3]!.mental!.confidence!).toBeLessThan(0);
  });

  test("flag off: nothing is written (same array)", () => {
    setDecisionFlags({ CONFIDENCE: false });
    expect(DECISION_FLAGS.CONFIDENCE).toBe(false);
    const ps = [player(1, "A", "ST"), player(2, "B", "GK")];
    expect(withGoalConfidence(ps, "A", 1)).toBe(ps);
    expect(applyConfidence(ps, [{ playerId: 1, delta: 0.3, reason: "goal" }])).toBe(ps);
  });

  test("a player without a mental profile is skipped", () => {
    const bare = { id: 9, team: "A", role: "ST", name: "X" } as unknown as GamePlayer;
    const out = applyConfidence([bare], [{ playerId: 9, delta: 0.3, reason: "goal" }]);
    expect(out[0]!.mental).toBeUndefined();
  });
});
