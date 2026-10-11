import { describe, expect, test } from "bun:test";
import { defensiveHole, outfieldNearBall, BALL_CLUSTER_CONFIG } from "@/GameEngine/Domain/BallCluster";
import type { GamePlayer } from "@/GameEngine/types";

const p = (id: number, team: "A" | "B", role: string, x: number, y: number, attackDir: 1 | -1 = team === "A" ? 1 : -1) =>
  ({ id, team, role, x, y, attackDir }) as unknown as GamePlayer;

describe("outfieldNearBall", () => {
  test("counts only outfield players of the team within the radius", () => {
    const players = [
      p(1, "B", "CB", 50, 37), p(2, "B", "CM", 55, 40), p(3, "B", "ST", 70, 37),
      p(4, "B", "GK", 52, 37), p(5, "A", "CM", 50, 38),
    ];
    expect(outfieldNearBall(players, "B", { x: 50, y: 37 }).map(q => q.id)).toEqual([1, 2]);
    expect(outfieldNearBall(players, "A", { x: 50, y: 37 }).map(q => q.id)).toEqual([5]);
  });
});

describe("defensiveHole", () => {
  test("only the cells goal-side of the ball count, measured to the nearest outfield defender", () => {
    // Team B defends the goal at x = 115 (attacks −x). Ball at x = 100: the last two columns count.
    const players = [p(1, "B", "CB", 110, 37), p(2, "B", "GK", 113, 37)];
    const hole = defensiveHole(players, "B", { x: 100, y: 37 });
    expect(hole.cells).toBe(2 * BALL_CLUSTER_CONFIG.GRID_Y);
    // The far corner cells are ~33 yards from the CB; the keeper does not count.
    expect(hole.maxGap).toBeGreaterThan(30);
    expect(hole.openCells).toBeGreaterThan(0);
  });

  test("a defender bunched on the ball leaves a bigger hole than one in the shape", () => {
    const shape = [p(1, "A", "CB", 20, 20), p(2, "A", "CB", 20, 54), p(3, "A", "CM", 40, 37)];
    const bunched = [p(1, "A", "CB", 20, 20), p(2, "A", "CB", 20, 54), p(3, "A", "CM", 58, 37)];
    const ball = { x: 60, y: 37 };
    expect(defensiveHole(bunched, "A", ball).openCells).toBeGreaterThan(defensiveHole(shape, "A", ball).openCells);
  });
});

describe("ball cluster statistics", () => {
  test("the ballCluster event feeds the defending team's counters", async () => {
    const { initStats, getTeamStats } = await import("@/GameEngine/Domain/Statistics");
    const { gameBus } = await import("@/GameEngine/Infrastructure/EventBus");
    initStats([{ id: 1, team: "A" }, { id: 2, team: "B" }]);
    gameBus.emit("ballCluster", { defendingTeam: "B", defendersNear: 3, attackersNear: 1 });
    gameBus.emit("ballCluster", { defendingTeam: "B", defendersNear: 1, attackersNear: 1 });
    const b = getTeamStats("B");
    expect(b.ballNearTicks).toBe(2);
    expect(b.ballNearSum).toBe(4);
    expect(b.ballCrowdTicks).toBe(1);
    expect(getTeamStats("A").ballNearTicks).toBe(0);
  });
});
