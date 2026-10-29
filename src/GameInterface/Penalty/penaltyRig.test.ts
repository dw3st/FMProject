import { describe, expect, test } from "bun:test";
import { ballAt, keeperAt, penaltyBackdropId, rigPlan, rigScene } from "@/GameInterface/Penalty/penaltyRig";
import { SCENE, goalToPx } from "@/GameInterface/Penalty/penaltyScene";
import type { KickOutcome } from "@/Domain/penalty/penaltyKick";

const outcome = (o: Partial<KickOutcome>): KickOutcome => ({ result: "goal", scored: true, ball: { x: 0.8, y: 0.3 }, dive: "low-left", chance: 0.7, ...o });
const keeper = { shirt: "#22aa44", trim: "#111111", shorts: "#111111", socks: "#22aa44", skin: "#c99a6e" };
const taker = { shirt: "#cc2222", trim: "#ffffff", shorts: "#ffffff", socks: "#cc2222", skin: "#a66f4f", hair: "#111111", number: "" };

describe("rigPlan", () => {
  test("dive side and result follow the outcome", () => {
    const p = rigPlan(outcome({ dive: "high-right", result: "saved", scored: false }), 0.42, 0.4);
    expect(p.side).toBe(1);
    expect(p.saved).toBe(true);
    expect(p.diveTo).toEqual(p.ballTo);
    expect(rigPlan(outcome({ dive: "low-mid" }), 0.42, 0.4).side).toBe(0);
    expect(rigPlan(outcome({ result: "miss", scored: false }), 0.42, 0.4).miss).toBe(true);
  });
});

describe("rig motion", () => {
  test("a goal: the ball reaches the target, the keeper dives the other way", () => {
    const p = rigPlan(outcome({}), 0.42, 0.4);
    const to = goalToPx({ x: 0.8, y: 0.3 });
    const K = keeperAt(p.kick + p.dur, p, 0);
    const b = ballAt(p.kick + p.dur - 1e-6, p, K);
    expect(Math.hypot(b.p.x - to.x, b.p.y - to.y)).toBeLessThan(2);
    expect(keeperAt(p.dive + 0.7, p, 0).root.x).toBeLessThan(SCENE.GX);
  });
  test("a save: the keeper holds the ball", () => {
    const p = rigPlan(outcome({ result: "saved", scored: false, dive: "low-right" }), 0.42, 0.4);
    const t = p.kick + p.dur;
    expect(ballAt(t, p, keeperAt(t, p, 0)).held).toBe(true);
  });
  test("the scene draws the figures, the net and the ball", () => {
    const svg = rigScene(0, 0, null, keeper, taker, "x");
    expect(svg).toContain("<path");
    expect(svg).toContain("xpb");
    const p = rigPlan(outcome({}), 0.42, 0.4);
    expect(rigScene(p.kick + 0.2, 1, p, keeper, taker, "x").length).toBeGreaterThan(1000);
  });
  test("backdrop ids", () => {
    expect(penaltyBackdropId("rain")).toBe("penalty-bg-rain");
  });
});
