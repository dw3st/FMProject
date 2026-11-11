import { describe, expect, test } from "bun:test";
import { actionChain, backpedals, actionDuration, addAction, liveActions, newMotion, PLAYER_SPRITE, poseOf, spriteLook, stepMotion, THROW_IN_HOLD, colorLuma, groundRingColor } from "@/GraficsEngine/playerSprite";

const run = (speed: number, seconds: number, dt = 1 / 60) => {
  let m = newMotion(0, 0);
  for (let t = 0; t < seconds; t += dt) m = stepMotion(m, { x: m.x + speed * dt, y: 0 }, dt, null);
  return m;
};

describe("player sprite", () => {
  test("gait by speed with hysteresis; a run turns toward where he goes", () => {
    expect(run(0, 1).gait).toBe("idle");
    expect(run(1.5, 1).gait).toBe("walk");
    const r = run(6, 1);
    expect(r.gait).toBe("run");
    expect(Math.abs(r.angle)).toBeLessThan(0.05); // facing +x
    // Slowing to between the two thresholds keeps running (no flicker).
    let m = r;
    for (let i = 0; i < 60; i++) m = stepMotion(m, { x: m.x + 2.6 / 60, y: 0 }, 1 / 60, null);
    expect(m.gait).toBe("run");
  });

  test("the stride follows the distance and stops when paused; a jump is a teleport", () => {
    const m = run(6, 0.5);
    expect(m.phase).toBeGreaterThan(0);
    expect(stepMotion(m, { x: m.x + 0.1, y: 0 }, 0, null).phase).toBe(m.phase);
    const j = stepMotion(m, { x: m.x + PLAYER_SPRITE.JUMP_YDS + 1, y: 0 }, 1 / 60, null);
    expect(j.gait).toBe("idle");
    expect(j.vx).toBe(0);
  });

  test("poses: idle, keeper ready, run cycle frames, action chains in order", () => {
    expect(poseOf(newMotion(0, 0), null, 0, false).base).toBe("player-idle");
    expect(poseOf(newMotion(0, 0), null, 0, true)).toEqual({ atlas: "keeper", base: "keeper-ready" });
    expect(poseOf(run(6, 0.3), null, 0, false).base).toMatch(/^player-run-0[1-8]$/);
    const kick = addAction([], { playerId: 1, kind: "kick", side: 1 }, 10)[0]!;
    expect(poseOf(newMotion(0, 0), kick, 10.05, false).base).toBe("player-kick-wind");
    expect(poseOf(newMotion(0, 0), kick, 10.2, false).base).toBe("player-kick");
    expect(poseOf(newMotion(0, 0), kick, 10.4, false).base).toBe("player-kick-follow");
    const dive = addAction([], { playerId: 1, kind: "dive", side: 1 }, 0)[0]!;
    expect(poseOf(newMotion(0, 0), dive, 0.3, true, "right")).toEqual({ atlas: "keeper", base: "keeper-dive-right" });
  });

  test("actions end after their chain; a new one replaces the player's", () => {
    let list = addAction([], { playerId: 1, kind: "pass", side: 1 }, 0);
    list = addAction(list, { playerId: 1, kind: "kick", side: 1 }, 0.1);
    expect(list.length).toBe(1);
    expect(liveActions(list, 0.1 + actionDuration("kick") + 0.01)).toEqual([]);
  });

  test("the look is stable per player", () => {
    expect(spriteLook("es_1")).toEqual(spriteLook("es_1"));
  });
});

describe("set pieces and keeper extras (art phase 5)", () => {
  const atlas = (n: string) => JSON.parse(require("node:fs").readFileSync(require("node:path").join(import.meta.dir, "..", "example_data", "assets", n), "utf8")) as { frames: Record<string, unknown> };
  const frames = { ...atlas("player/player-atlas.json").frames, ...atlas("keeper/keeper-atlas.json").frames };
  test("new chains use existing frames", () => {
    for (const k of ["punch", "throwGo", "kneeSlide"] as const) for (const [base] of actionChain(k)) expect(`${base}-shirt.png` in frames).toBe(true);
    expect(`${THROW_IN_HOLD}-shirt.png` in frames).toBe(true);
  });
  test("a held pose wins over the gait; a walking keeper side-steps", () => {
    const walk = { ...newMotion(0, 0), gait: "walk" as const, phase: 0.2 };
    expect(poseOf(walk, null, 0, false, "left", THROW_IN_HOLD).base).toBe(THROW_IN_HOLD);
    expect(poseOf(walk, null, 0, true).base).toBe("keeper-side-02");
  });
});

describe("keeper backpedal", () => {
  const run = (backpedal: boolean, speedX: number, look: { x: number; y: number }) => {
    let m = newMotion(50, 37, 0);
    for (let i = 0; i < 120; i++) m = stepMotion(m, { x: m.x + speedX / 60, y: 37 }, 1 / 60, look, backpedal);
    return Math.cos(m.angle);
  };
  test("moving away from the ball he keeps facing it; a field player turns his back", () => {
    const ball = { x: 90, y: 37 };
    expect(run(true, -5, ball)).toBeGreaterThan(0.9);
    expect(run(false, -5, ball)).toBeLessThan(-0.9);
  });
  test("moving toward the ball he faces where he goes", () => {
    expect(run(true, 5, { x: 200, y: 37 })).toBeGreaterThan(0.9);
    expect(run(true, -5, { x: 0, y: 37 })).toBeLessThan(-0.9);
  });
});

describe("defender backpedal", () => {
  test("a defender near the ball faces it, far away he turns and runs; attackers never", () => {
    expect(backpedals(true, false, 60)).toBe(true);
    expect(backpedals(false, true, 10)).toBe(true);
    expect(backpedals(false, true, PLAYER_SPRITE.BACKPEDAL_YDS + 1)).toBe(false);
    expect(backpedals(false, false, 5)).toBe(false);
  });
});

describe("ground ring colour (10.2)", () => {
  test("a visible kit keeps its colour; a dark kit takes the second colour, else the fallback", () => {
    expect(groundRingColor(0xc8102e, 0x000000, 0.2, 0xd9dde3)).toBe(0xc8102e);
    expect(groundRingColor(0x111111, 0xc8102e, 0.2, 0xd9dde3)).toBe(0xc8102e);
    expect(groundRingColor(0x111111, 0x1e1e22, 0.2, 0xd9dde3)).toBe(0xd9dde3);
    expect(colorLuma(0xffffff)).toBeCloseTo(1, 5);
    expect(colorLuma(0x000000)).toBe(0);
  });
});
