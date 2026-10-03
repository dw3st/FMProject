import { afterEach, describe, expect, test } from "bun:test";
import { attackingAnchor } from "@/GameEngine/Domain/AttackingPositioning";
import { applyTeamAttackConfig } from "@/GameEngine/Configs/AttackConfig";
import { ATTACK_CONFIG } from "@/GameEngine/Configs/AttackConfig";

const A = { team: "A" as const, attackDir: 1 as const };
const B = { team: "B" as const, attackDir: -1 as const };
const ownHalfBall = { x: 30, y: 37 };

afterEach(() => {
  applyTeamAttackConfig("A", "balanced");
  applyTeamAttackConfig("B", "balanced");
});

describe("attackingAnchor — team width", () => {
  test("normal width keeps the formation slot exactly", () => {
    applyTeamAttackConfig("A", "balanced", "balanced", { width: "normal" });
    expect(attackingAnchor({ x: 95, y: 8 }, A, ownHalfBall)).toEqual({ x: 95, y: 8 });
    expect(attackingAnchor({ x: 36, y: 63 }, A, ownHalfBall)).toEqual({ x: 36, y: 63 });
  });

  test("narrow pulls slots toward the centre, wide pushes them out (centre slot unchanged)", () => {
    applyTeamAttackConfig("A", "balanced", "balanced", { width: "narrow" });
    const narrow = attackingAnchor({ x: 36, y: 11 }, A, ownHalfBall).y;
    expect(attackingAnchor({ x: 50, y: 37 }, A, ownHalfBall).y).toBe(37);
    applyTeamAttackConfig("A", "balanced", "balanced", { width: "wide" });
    const wide = attackingAnchor({ x: 36, y: 11 }, A, ownHalfBall).y;
    expect(narrow).toBeGreaterThan(11);
    expect(wide).toBeLessThan(11);
    expect(wide).toBeGreaterThanOrEqual(1);
  });
});

describe("attackingAnchor — box convergence", () => {
  test("forward slots close in on the goal as the ball reaches the final third", () => {
    const winger = { x: 95, y: 8 };
    expect(attackingAnchor(winger, A, { x: 60, y: 10 }).y).toBe(8);
    const mid = attackingAnchor(winger, A, { x: 85, y: 10 }).y;
    const deep = attackingAnchor(winger, A, { x: 100, y: 10 }).y;
    expect(mid).toBeGreaterThan(8);
    expect(deep).toBeCloseTo(8 + (37 - 8) * ATTACK_CONFIG.BOX_CONVERGENCE);
    expect(deep).toBeGreaterThan(mid);
  });

  test("deep slots never converge, and team B mirrors the attacking frame", () => {
    expect(attackingAnchor({ x: 36, y: 11 }, A, { x: 105, y: 37 }).y).toBe(11);
    // Team B attacks toward x = 0: its winger slot sits at x 20.
    expect(attackingAnchor({ x: 20, y: 66 }, B, { x: 15, y: 60 }).y).toBeLessThan(66);
    expect(attackingAnchor({ x: 20, y: 66 }, B, { x: 80, y: 60 }).y).toBe(66);
  });
});
