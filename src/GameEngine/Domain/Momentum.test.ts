import { describe, expect, test } from "bun:test";
import { momentumBar, momentumPointsAt, momentumZone } from "@/GameEngine/Domain/Momentum";
import { MOMENTUM, MOMENTUM_TABLE } from "@/GameEngine/Configs/MomentumConfig";
import { PITCH_LENGTH } from "@/GameEngine/Domain/pitch";

describe("FM momentum", () => {
  test("zones are taken from the attacking side; the own half earns nothing", () => {
    expect(momentumZone(110, 37, 1)).toEqual({ sixth: 5, third: 1 });
    expect(momentumZone(PITCH_LENGTH - 110, 37, -1)).toEqual({ sixth: 5, third: 1 });
    expect(momentumPointsAt("goal", 20, 37, 1)).toBe(0);
    expect(momentumPointsAt("goal", 110, 37, 1)).toBe(50);
    expect(momentumPointsAt("touch", 70, 37, 1)).toBe(MOMENTUM_TABLE.touch[0][1]);
  });

  test("left and right from the attacker's view", () => {
    // Attacking +x, y = 0 is his left: pass completed in the 5th sixth, left 2 / right 3.
    expect(momentumPointsAt("pass", 85, 5, 1)).toBe(2);
    expect(momentumPointsAt("pass", 85, 70, 1)).toBe(3);
    expect(momentumPointsAt("pass", PITCH_LENGTH - 85, 70, -1)).toBe(2);
  });

  test("the bar leans to the side with the recent points and fades by the half-life", () => {
    const minutes = [{ A: 60, B: 0 }];
    for (let m = 1; m <= 10; m++) minutes.push({ A: 0, B: 0 });
    expect(momentumBar(minutes, 0)).toBeGreaterThan(0.5);
    expect(momentumBar(minutes, MOMENTUM.HALF_LIFE_MIN)).toBeCloseTo(30 / (30 + MOMENTUM.CALM), 6);
    minutes[10] = { A: 0, B: 80 };
    expect(momentumBar(minutes, 10)).toBeLessThan(0);
  });
});
