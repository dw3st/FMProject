import { describe, expect, test } from "bun:test";
import { easePace, MODE_A_PACE, modeAPaceFactor } from "@/Domain/match/livePace";

describe("mode A variable pace", () => {
  test("slow near the goal the side on the ball attacks, quick far from it", () => {
    expect(modeAPaceFactor({ ballX: 100, attackDir: 1, shot: false, dangerousSetPiece: false })).toBe(MODE_A_PACE.SLOW);
    expect(modeAPaceFactor({ ballX: 15, attackDir: -1, shot: false, dangerousSetPiece: false })).toBe(MODE_A_PACE.SLOW);
    expect(modeAPaceFactor({ ballX: 20, attackDir: 1, shot: false, dangerousSetPiece: false })).toBe(MODE_A_PACE.FAST);
    const mid = modeAPaceFactor({ ballX: 70, attackDir: 1, shot: false, dangerousSetPiece: false });
    expect(mid).toBeGreaterThan(MODE_A_PACE.SLOW);
    expect(mid).toBeLessThan(MODE_A_PACE.FAST);
  });
  test("a shot or a dangerous set piece is always slow", () => {
    expect(modeAPaceFactor({ ballX: 20, attackDir: 1, shot: true, dangerousSetPiece: false })).toBe(MODE_A_PACE.SLOW);
    expect(modeAPaceFactor({ ballX: 20, attackDir: 1, shot: false, dangerousSetPiece: true })).toBe(MODE_A_PACE.SLOW);
  });
  test("the pace eases toward the target, never past it", () => {
    const a = easePace(1.9, 0.42, 0.1);
    expect(a).toBeLessThan(1.9);
    expect(a).toBeGreaterThan(0.42);
    expect(easePace(1.9, 0.42, 100)).toBeCloseTo(0.42, 5);
    expect(easePace(1, 2, 0)).toBe(1);
  });
});
