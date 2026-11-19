import { describe, expect, test } from "bun:test";
import {
  robustMean, stepBackLine, blendLineX, shotBlocker, firstPresserOf, standOffPoint, shortSupportOf, shortSupportAnchor,
  anticipationLookahead, anticipationInterceptMult, passLengthFactor,
} from "@/GameEngine/Domain/Movement";
import { MOVEMENT, YDS_PER_MPH, passLengthBand, fmDistanceBand } from "@/GameEngine/Configs/MovementConfig";
import type { GamePlayer } from "@/GameEngine/types";

const p = (id: number, team: "A" | "B", role: string, x: number, y: number, extra: Partial<GamePlayer> = {}) =>
  ({ id, team, role, x, y, attackDir: team === "A" ? 1 : -1, recoveryTime: 0, ...extra }) as unknown as GamePlayer;

describe("FM bands", () => {
  test("pass length classes (yards in, metres FM)", () => {
    expect(passLengthBand(9)).toBe("short");    // 8.2 m
    expect(passLengthBand(20)).toBe("medium");
    expect(passLengthBand(34)).toBe("long");    // 31.1 m
    expect(fmDistanceBand(3)).toBe(0);
    expect(fmDistanceBand(50)).toBe(8);
    expect(passLengthFactor(5)).toBe(0);
    expect(passLengthFactor(40)).toBe(1);
  });
});

describe("back line", () => {
  test("robust mean clamps an outlier to ±6 m of the median", () => {
    const clampYd = MOVEMENT.LINE_CLAMP_M * 1.0936;
    const m = robustMean([80, 81, 82, 100]);
    expect(m).toBeCloseTo((80 + 81 + 82 + (81.5 + clampYd)) / 4, 5);
  });

  test("holds under the move threshold, moves above it, holds again below the hold threshold", () => {
    const moveGap = MOVEMENT.LINE_MOVE_MPH * YDS_PER_MPH * MOVEMENT.LINE_REACTION_S;
    let s = stepBackLine(undefined, 80, -1, 0.2);
    expect(s).toEqual({ x: 80, mode: "hold" });
    s = stepBackLine(s, 80 + moveGap * 0.8, -1, 0.2);
    expect(s.mode).toBe("hold");
    expect(s.x).toBe(80);
    // Team attacking −x: a wanted x larger than the line is toward its own goal → drop.
    s = stepBackLine(s, 80 + moveGap * 1.5, -1, 0.2);
    expect(s.mode).toBe("drop");
    expect(s.x).toBeGreaterThan(80);
    expect(s.x - 80).toBeLessThanOrEqual(MOVEMENT.LINE_MAX_MPH * YDS_PER_MPH * 0.2 + 1e-9);
    // Hysteresis: between the two thresholds it keeps moving.
    const mid = s.x + MOVEMENT.LINE_HOLD_MPH * YDS_PER_MPH * 1.5;
    expect(stepBackLine(s, mid, -1, 0.2).mode).toBe("drop");
    expect(stepBackLine(s, s.x + 0.1, -1, 0.2).mode).toBe("hold");
  });

  test("blend weights sum to 1", () => {
    expect(blendLineX(80, 80, 80)).toBeCloseTo(80, 9);
  });
});

describe("shot block", () => {
  test("a defender on the line in front of the shooter blocks; one behind or wide does not", () => {
    const shooter = p(1, "A", "ST", 90, 37);
    const onLine = p(2, "B", "CB", 93, 37.4);
    expect(shotBlocker(shooter, 115, 37, [shooter, onLine])?.player.id).toBe(2);
    expect(shotBlocker(shooter, 115, 37, [shooter, p(3, "B", "CB", 88, 37)])).toBeNull();
    expect(shotBlocker(shooter, 115, 37, [shooter, p(4, "B", "CB", 93, 41)])).toBeNull();
    expect(shotBlocker(shooter, 115, 37, [shooter, p(5, "B", "GK", 93, 37)])).toBeNull();
  });
});

describe("second presser", () => {
  test("a closer teammate on the holder makes me the second presser; stand-off is 5 yd goal-side", () => {
    const holder = p(1, "A", "CM", 60, 30);
    const first = p(2, "B", "CM", 62, 31);
    const me = p(3, "B", "CDM", 66, 36);
    expect(firstPresserOf(me, holder, [holder, first, me])?.id).toBe(2);
    expect(firstPresserOf(first, holder, [holder, first, me])).toBeNull();
    const pt = standOffPoint(me, holder);
    // Team B defends the goal at x = 115.
    expect(pt.x).toBeGreaterThan(holder.x);
    expect(Math.hypot(pt.x - holder.x, pt.y - holder.y)).toBeGreaterThan(MOVEMENT.STAND_OFF_YD - 0.5);
  });
});

describe("support comes short", () => {
  test("the nearest defender / midfielder, anchored short and never ahead of the holder", () => {
    const holder = p(1, "A", "CM", 60, 30);
    const cdm = p(2, "A", "CDM", 50, 40);
    const st = p(3, "A", "ST", 62, 33);
    const main = (q: GamePlayer) => (q.role === "ST" ? "Forward" : "Midfielder");
    expect(shortSupportOf(holder, [holder, cdm, st], main)?.id).toBe(2);
    const a = shortSupportAnchor(cdm, holder);
    expect(a.x).toBeLessThanOrEqual(holder.x);
    expect(Math.hypot(a.x - holder.x, a.y - holder.y)).toBeCloseTo(MOVEMENT.SUPPORT_SHORT_YD, 5);
  });
});

describe("anticipation", () => {
  test("lookahead and interception gain grow with anticipation", () => {
    const low = p(1, "A", "CB", 0, 0, { mental: { decisions: 0.3, composure: 0.3, flair: 0.3, anticipation: 0.1, consistency: 0.5, mood: 0 } });
    const high = p(2, "A", "CB", 0, 0, { mental: { decisions: 0.3, composure: 0.3, flair: 0.3, anticipation: 0.8, consistency: 0.5, mood: 0 } });
    expect(anticipationLookahead(high)).toBeGreaterThan(anticipationLookahead(low));
    expect(anticipationInterceptMult(high)).toBeGreaterThan(1);
    expect(anticipationInterceptMult(low)).toBeLessThan(1);
  });
});
