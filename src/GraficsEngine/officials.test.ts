import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { assistantForLineX, assistantTarget, OFFICIALS, refereeTarget, stepToward } from "@/GraficsEngine/officials";
import { PITCH_LENGTH, PITCH_MID_X, PITCH_WIDTH } from "@/GameEngine/Domain/pitch";
import { computeOffsideLine } from "@/GameEngine/Domain/Offside";
import { createMatchState, getBallPos } from "@/GameEngine/Domain/gameState";
import { emptySeasonLog, type Squad } from "@/types/playerTypes";
import type { Formation, GameState } from "@/GameEngine/types";
import formation433Json from "@/Data/formations/4-3-3.json";

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../example_data/squads/premier_league/${file}`, import.meta.url));
  const s = JSON.parse(readFileSync(path, "utf8")) as Squad;
  return { ...s, players: s.players.map((p) => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 100 } })) };
}

function makeState(): GameState {
  const f = formation433Json as Formation;
  return createMatchState(loadSquad("33.json").players, f, loadSquad("34.json").players, f);
}

describe("referee", () => {
  test("stays at least MIN_BALL_DIST from the ball and inside the pitch", () => {
    for (const ball of [{ x: 2, y: 2 }, { x: 57.5, y: 37 }, { x: 113, y: 72 }, { x: 113, y: 2 }, { x: 2, y: 72 }]) {
      for (const dir of [1, -1] as const) {
        for (const setPiece of [false, true]) {
          const t = refereeTarget({ ball, attackDir: dir, players: [], setPiece });
          expect(Math.hypot(t.x - ball.x, t.y - ball.y)).toBeGreaterThanOrEqual(OFFICIALS.MIN_BALL_DIST - 1e-6);
          expect(t.x).toBeGreaterThanOrEqual(OFFICIALS.EDGE);
          expect(t.x).toBeLessThanOrEqual(PITCH_LENGTH - OFFICIALS.EDGE);
          expect(t.y).toBeGreaterThanOrEqual(OFFICIALS.EDGE);
          expect(t.y).toBeLessThanOrEqual(PITCH_WIDTH - OFFICIALS.EDGE);
        }
      }
    }
  });

  test("stands behind the play and towards the centre", () => {
    const t = refereeTarget({ ball: { x: 70, y: 20 }, attackDir: 1, players: [] });
    expect(t.x).toBeLessThan(70);
    expect(t.y).toBeGreaterThan(20);
  });

  test("steps at most REF_SPEED × dt and snaps above SNAP_DIST", () => {
    const p = stepToward({ x: 50, y: 37 }, { x: 60, y: 37 }, 0.1, OFFICIALS.REF_SPEED);
    expect(Math.hypot(p.x - 50, p.y - 37)).toBeLessThanOrEqual(OFFICIALS.REF_SPEED * 0.1 + 1e-9);
    expect(p.x).toBeGreaterThan(50);
    expect(stepToward({ x: 0, y: 0 }, { x: 80, y: 0 }, 0.016, OFFICIALS.REF_SPEED)).toEqual({ x: 80, y: 0 });
    expect(stepToward({ x: 50, y: 37 }, { x: 60, y: 37 }, 0, OFFICIALS.REF_SPEED)).toEqual({ x: 50, y: 37 });
  });

  test("does not stand on a player", () => {
    const t0 = refereeTarget({ ball: { x: 57.5, y: 37 }, attackDir: 1, players: [] });
    const t = refereeTarget({ ball: { x: 57.5, y: 37 }, attackDir: 1, players: [t0] });
    expect(Math.hypot(t.x - t0.x, t.y - t0.y)).toBeGreaterThanOrEqual(1.5);
  });
});

describe("assistants", () => {
  test("each covers its half, on the offside line, off the pitch", () => {
    const s = makeState();
    const ball = getBallPos(s);
    const top = assistantTarget({ players: s.players, ball }, "top");
    const bottom = assistantTarget({ players: s.players, ball }, "bottom");
    expect(top.x).toBeGreaterThanOrEqual(PITCH_MID_X);
    expect(top.y).toBeLessThan(0);
    expect(bottom.x).toBeLessThanOrEqual(PITCH_MID_X);
    expect(bottom.y).toBeGreaterThan(PITCH_WIDTH);
    const teamToRight = s.players.find((p) => p.attackDir === 1)!.team;
    expect(top.x).toBe(computeOffsideLine(1, s.players, teamToRight, ball.x)!);
  });

  test("after the side switch each assistant follows the team now attacking his half", () => {
    const s = makeState();
    const flipped = s.players.map((p) => ({ ...p, attackDir: (p.attackDir === 1 ? -1 : 1) as 1 | -1, x: PITCH_LENGTH - p.x }));
    const ball = { x: PITCH_MID_X, y: 37 };
    const nowRight = flipped.find((p) => p.attackDir === 1)!.team;
    expect(nowRight).not.toBe(s.players.find((p) => p.attackDir === 1)!.team);
    const top = assistantTarget({ players: flipped, ball }, "top");
    expect(top.x).toBe(computeOffsideLine(1, flipped, nowRight, ball.x)!);
  });

  test("assistantForLineX picks the half", () => {
    expect(assistantForLineX(80)).toBe("top");
    expect(assistantForLineX(30)).toBe("bottom");
  });
});
