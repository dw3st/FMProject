import { describe, expect, test } from "bun:test";
import { GOAL_Y_MAX, GOAL_Y_MIN, PITCH_LENGTH } from "@/GameEngine/Domain/pitch";
import { STANDING_GOAL, goalWarpY, meshLines, standingGoalShape } from "@/GraficsEngine/standingGoal";

const C = (GOAL_Y_MIN + GOAL_Y_MAX) / 2, HALF = (GOAL_Y_MAX - GOAL_Y_MIN) / 2;

describe("goalWarpY", () => {
  test("on the goal line the real post is drawn on the drawn post", () => {
    expect(goalWarpY(0, GOAL_Y_MIN)).toBeCloseTo(C - HALF * STANDING_GOAL.MOUTH, 6);
    expect(goalWarpY(PITCH_LENGTH, GOAL_Y_MAX)).toBeCloseTo(C + HALF * STANDING_GOAL.MOUTH, 6);
    expect(goalWarpY(0, C)).toBe(C);
  });

  test("a shot inside the post stays inside the drawn post, one just wide stays outside", () => {
    const post = C + HALF * STANDING_GOAL.MOUTH;
    expect(goalWarpY(0, GOAL_Y_MAX - 0.2)).toBeLessThan(post);
    expect(goalWarpY(0, GOAL_Y_MAX + 0.2)).toBeGreaterThan(post);
    // Behind the line (the ball in the net) it is as on the line.
    expect(goalWarpY(-2, GOAL_Y_MAX)).toBeCloseTo(post, 6);
    expect(goalWarpY(PITCH_LENGTH + 2, GOAL_Y_MAX)).toBeCloseTo(post, 6);
  });

  test("nothing moves away from the goal: far up the pitch or wide of it", () => {
    expect(goalWarpY(STANDING_GOAL.REACH_YDS, GOAL_Y_MAX)).toBe(GOAL_Y_MAX);
    expect(goalWarpY(57, 40)).toBe(40);
    expect(goalWarpY(0, C + STANDING_GOAL.OUTER_YDS)).toBe(C + STANDING_GOAL.OUTER_YDS);
    expect(goalWarpY(0, 5)).toBe(5);
  });

  test("continuous and increasing across the pitch, symmetric about the middle and the same at both ends", () => {
    for (const x of [0, 2, 5, 8.9]) {
      let prev = goalWarpY(x, 20);
      for (let y = 20.05; y <= 54; y += 0.05) {
        const w = goalWarpY(x, y);
        expect(w).toBeGreaterThan(prev);
        expect(w - prev).toBeLessThan(0.05 * STANDING_GOAL.MOUTH + 1e-9);
        prev = w;
      }
      expect(goalWarpY(x, C + 3) - C).toBeCloseTo(C - goalWarpY(x, C - 3), 6);
      expect(goalWarpY(PITCH_LENGTH - x, C + 3)).toBeCloseTo(goalWarpY(x, C + 3), 6);
    }
  });

  test("the stretch fades in towards the line", () => {
    const at = (x: number) => goalWarpY(x, GOAL_Y_MAX) - GOAL_Y_MAX;
    expect(at(6)).toBeGreaterThan(0);
    expect(at(3)).toBeGreaterThan(at(6));
    expect(at(0)).toBeGreaterThan(at(3));
  });
});

describe("standingGoalShape", () => {
  test("the mouth is the wide one, the posts rise by the height and lean back, the net falls away from the pitch", () => {
    const left = standingGoalShape(100, 300, -1, 10, 60);
    expect(left.nearFoot.y - left.farFoot.y).toBeCloseTo((GOAL_Y_MAX - GOAL_Y_MIN) * STANDING_GOAL.MOUTH * 10, 6);
    expect(left.farFoot.x).toBe(100);
    expect(left.farTop.y).toBeCloseTo(left.farFoot.y - 60, 6);
    expect(left.farTop.x).toBeLessThan(100);
    expect(left.farBack.x).toBeCloseTo(100 - STANDING_GOAL.DEPTH_YDS * 10, 6);
    expect(left.farBackTop.y).toBeCloseTo(left.farBack.y - 60 * STANDING_GOAL.ROOF, 6);
    const right = standingGoalShape(900, 300, 1, 10, 60);
    expect(right.nearBack.x).toBeGreaterThan(900);
    expect(right.nearTop.x).toBeGreaterThan(900);
    // The two ends mirror each other.
    expect(right.nearTop.x - 900).toBeCloseTo(100 - left.nearTop.x, 6);
  });
});

describe("meshLines", () => {
  test("inner lines only, both ways", () => {
    const l = meshLines({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 0, y: 2 }, 4, 2);
    expect(l).toHaveLength(3 + 1);
    expect(l[0]).toEqual([{ x: 1, y: 0 }, { x: 1, y: 2 }]);
    expect(l[3]).toEqual([{ x: 0, y: 1 }, { x: 4, y: 1 }]);
  });
});
