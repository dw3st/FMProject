import { afterEach, describe, expect, test } from "bun:test";
import { ballMeetsKeeper, shotInterceptPoint } from "@/GameEngine/Domain/Keeper";
import { createMatchState, tickState } from "@/GameEngine/Domain/gameState";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Squad } from "@/types/playerTypes";
import type { Formation, GameState } from "@/GameEngine/types";
import formation433Json from "@/Data/formations/4-3-3.json";

const F433 = formation433Json as Formation;
const load = (file: string): Squad => {
  const squad = JSON.parse(readFileSync(fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url)), "utf8")) as Squad;
  return { ...squad, players: squad.players.map((p) => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 90 } })) };
};
const HOME = load("33.json");
const AWAY = load("34.json");

/** Team A shoots at x = 115 from (95, 37); the keeper of B stands where the test says. */
function shooting(gkX: number, gkY: number): { s: GameState; gkId: number; shooterId: number } {
  const base = { ...createMatchState(HOME.players, F433, AWAY.players, F433), matchPhase: "firstHalf" as const, presentationCountdown: 0 };
  const shooter = base.players.find((p) => p.team === "A" && p.role === "ST")!;
  const gk = base.players.find((p) => p.team === "B" && p.role === "GK")!;
  const dir = shooter.attackDir;
  const goalX = dir === 1 ? 115 : 0;
  const fromX = goalX - dir * 20;
  const players = base.players.map((p) => p.id === gk.id ? { ...p, x: goalX - dir * gkX, y: gkY } : p.id === shooter.id ? { ...p, x: fromX, y: 37 } : p);
  return {
    s: { ...base, players, ballHolderId: shooter.id, shot: { shooterId: shooter.id, fromX, fromY: 37, toX: goalX, toY: 36, t: 0, xg: 0.5 } },
    gkId: gk.id, shooterId: shooter.id,
  };
}
const realRandom = Math.random;
afterEach(() => { Math.random = realRandom; });

function run(state: GameState): { end: GameState; flightTicks: number; goal: boolean } {
  let s = state;
  let flightTicks = 0;
  let goal = false;
  while (s.shot && flightTicks < 20) {
    const r = tickState(s, 0.2);
    s = r.state;
    flightTicks++;
    if (r.goalScored) goal = true;
  }
  return { end: s, flightTicks, goal };
}

describe("keeper and the shot", () => {
  test("pure: he goes to the path, not to the line; the reach is around the path", () => {
    const shot = { fromX: 95, fromY: 37, toX: 115, toY: 37, t: 0 };
    expect(shotInterceptPoint({ x: 105, y: 40 }, shot)).toEqual({ x: 105, y: 37 });
    expect(ballMeetsKeeper({ x: 105, y: 38 }, shot, 0, 1)).toBe(true);
    expect(ballMeetsKeeper({ x: 105, y: 45 }, shot, 0, 1)).toBe(false);
    expect(ballMeetsKeeper({ x: 112, y: 37 }, shot, 0, 0.2)).toBe(false);
  });

  test("an advanced keeper who saves stops the ball where he is, before the line", () => {
    Math.random = () => 0.999;
    const { s, gkId } = shooting(10, 37);
    const { end, goal } = run(s);
    expect(goal).toBe(false);
    expect(end.shot).toBeNull();
    expect(end.ballHolderId).toBe(gkId);
    const lastFlight = tickState(s, 0.2).state;
    expect(lastFlight.shot === null || lastFlight.shot.t < 1).toBe(true);
  });

  test("a shot he does not stop flies on past him and is a goal, with no second roll", () => {
    Math.random = () => 0;
    const { s } = shooting(10, 37);
    const first = run(s);
    expect(first.goal).toBe(true);
  });

  test("on target and out of his reach: goal, even with a roll that would be a save", () => {
    Math.random = () => 0.999;
    const { s } = shooting(10, 70);
    expect(run(s).goal).toBe(true);
  });

  test("off target: no save, no goal", () => {
    Math.random = () => 0;
    const { s } = shooting(1, 37);
    const off = { ...s, shot: { ...s.shot!, toY: 50 } };
    expect(run(off).goal).toBe(false);
  });
});
