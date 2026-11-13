import { describe, expect, test } from "bun:test";
import { actionChain, finishKind, backpedals, actionDuration, addAction, liveActions, newMotion, PLAYER_SPRITE, poseOf, spriteLook, stepMotion, THROW_IN_HOLD, colorLuma, groundRingColor } from "@/GraficsEngine/playerSprite";

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
    expect(poseOf(run(4, 0.3), null, 0, false).base).toMatch(/^player-run-0[1-8]$/);
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
  const frames = { ...atlas("player/player-atlas-4.json").frames, ...atlas("keeper/keeper-atlas-4.json").frames };
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
    // The second colour is the other side's shirt: grey instead.
    expect(groundRingColor(0x111111, 0xc8102e, 0.2, 0xd9dde3, 0xd22630)).toBe(0xd9dde3);
    expect(groundRingColor(0x111111, 0xc8102e, 0.2, 0xd9dde3, 0x1f4fd0)).toBe(0xc8102e);
    expect(groundRingColor(0xc8102e, 0x000000, 0.2, 0xd9dde3, 0xd22630)).toBe(0xc8102e);
    expect(colorLuma(0xffffff)).toBeCloseTo(1, 5);
    expect(colorLuma(0x000000)).toBe(0);
  });
});

describe("richer moves of the top-down figures", () => {
  const read = (n: string) => JSON.parse(require("node:fs").readFileSync(require("node:path").join(import.meta.dir, "..", "example_data", "assets", n), "utf8")) as { frames: Record<string, unknown> };
  const frames = { ...read("player/player-atlas-4.json").frames, ...read("keeper/keeper-atlas-4.json").frames };
  const real = read("player/player-real-atlas-4.json").frames;
  const KINDS = ["kick", "pass", "throw", "header", "tackle", "tackleStand", "fall", "appeal", "receive", "injured", "celebrate", "dive", "catch",
    "punch", "throwGo", "kneeSlide", "volley", "bicycle", "backheel", "roulette", "stepover", "chest", "armsUp", "smother", "tipOver", "collect", "goalKick"] as const;

  test("every step of every chain is a frame of the atlases, both sides", () => {
    for (const k of KINDS) for (const side of ["left", "right"] as const) for (const [base] of actionChain(k, side)) {
      expect(`${base}-shirt.png` in frames).toBe(true);
      if (base.startsWith("player-")) expect(`${base.replace("player-", "player-real-")}-shirt.png` in real).toBe(true);
    }
  });

  test("a sprint has its own stride, with hysteresis; a defender close to the ball jockeys at a walk", () => {
    const S = PLAYER_SPRITE;
    expect(poseOf(run(S.SPRINT_UP + 1, 2), null, 0, false).base).toMatch(/^player-sprint-0\d$/);
    expect(poseOf(run(S.RUN_UP + 0.5, 2), null, 0, false).base).toMatch(/^player-run-0\d$/);
    let m = run(S.SPRINT_UP + 1, 2);
    for (let i = 0; i < 120; i++) m = stepMotion(m, { x: m.x + (S.SPRINT_DOWN + 0.3) / 60, y: 0 }, 1 / 60, null);
    expect(m.sprint).toBe(true);
    for (let i = 0; i < 120; i++) m = stepMotion(m, { x: m.x + (S.SPRINT_DOWN - 0.5) / 60, y: 0 }, 1 / 60, null);
    expect(m.sprint).toBeUndefined();
    const walk = { ...newMotion(0, 0), gait: "walk" as const, phase: 0.4 };
    expect(poseOf(walk, null, 0, false, "left", undefined, true).base).toBe("player-jockey-04");
    expect(poseOf(walk, null, 0, false).base).toBe("player-walk-04");
    expect(poseOf(walk, null, 0, true, "left", undefined, true).base).toBe("keeper-side-04");
    for (let k = 1; k <= 8; k++) for (const g of ["sprint", "jockey"]) expect(`player-${g}-0${k}-shirt.png` in frames).toBe(true);
  });

  test("finishes: mostly the plain kick and header, by the shares; the bicycle is drawn turned", () => {
    const S = PLAYER_SPRITE;
    expect(finishKind(false, 0)).toBe("volley");
    expect(finishKind(false, S.VOLLEY_SHARE + 0.001)).toBe("backheel");
    expect(finishKind(false, S.VOLLEY_SHARE + S.BACKHEEL_SHARE)).toBe("kick");
    expect(finishKind(true, 0)).toBe("bicycle");
    expect(finishKind(true, S.BICYCLE_SHARE)).toBe("header");
    const act = (kind: "bicycle" | "volley") => ({ playerId: 1, kind, startedAt: 0, side: 1 as const });
    expect(poseOf(newMotion(0, 0), act("bicycle"), 0.2, false).turned).toBe(true);
    expect(poseOf(newMotion(0, 0), act("volley"), 0.2, false).turned).toBeUndefined();
  });

  test("a step-over goes one way then the other, by the action's side", () => {
    const step = (side: 1 | -1, t: number) => poseOf(newMotion(0, 0), { playerId: 1, kind: "stepover", startedAt: 0, side }, t, false).base;
    expect(step(1, 0.05)).toBe("player-feint-right");
    expect(step(1, 0.25)).toBe("player-feint-left");
    expect(step(-1, 0.05)).toBe("player-feint-left");
  });
});
