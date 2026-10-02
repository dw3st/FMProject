import { describe, expect, test } from "bun:test";
import { TEST_SCENARIOS } from "@/GameEngine/Suport/TestCases";
import { decide } from "@/GameEngine/Domain/DecisionTree";

function holderDecision(id: string) {
  const s = TEST_SCENARIOS.find(t => t.id === id)!.createState();
  const h = s.players.find(p => p.id === s.ballHolderId)!;
  return decide(h, h, true, false, s.players, null, 0);
}

describe("carriers don't hug the lines (#37)", () => {
  test("next to the post on the goal line: no carry along the line", () => {
    const d = holderDecision("byline-near-post");
    expect(d.type === "carry" && Math.abs(d.dy) > 0.6).toBe(false);
  });

  test("on the touchline: the carry heads infield, not along the line", () => {
    const d = holderDecision("touchline-carrier");
    if (d.type === "carry") expect(d.dy).toBeGreaterThan(0.3);
  });
});
