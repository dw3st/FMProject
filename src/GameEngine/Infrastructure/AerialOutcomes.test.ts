import { describe, expect, test, spyOn, afterEach } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { createMatchState } from "@/GameEngine/Domain/gameState";
import {
  computeHeaderEffect, computeShooterEffect, gkClaimChance, resolveAerialDuel, resolveShot,
} from "@/GameEngine/Infrastructure/ActionOutcomes";
import { AERIAL_CONFIG as A } from "@/GameEngine/Configs/AerialConfig";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Squad } from "@/types/playerTypes";
import type { Formation, GamePlayer, ShotState } from "@/GameEngine/types";
import formation433Json from "@/Data/formations/4-3-3.json";

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  const s = JSON.parse(readFileSync(path, "utf8")) as Squad;
  return { ...s, players: s.players.map(p => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 100 } })) };
}
const f = formation433Json as Formation;
const state = createMatchState(loadSquad("33.json").players, f, loadSquad("34.json").players, f);
const st = state.players.find(p => p.team === "A" && p.role === "ST")!;
const cb = state.players.find(p => p.team === "B" && p.role === "CB")!;
const gk = state.players.find(p => p.team === "B" && p.role === "GK")!;

function aerial(p: GamePlayer, heading: number, jump = 0.1, strength = 0.5): GamePlayer {
  return { ...p, runtimeStats: { ...p.runtimeStats, withoutBall: { ...p.runtimeStats.withoutBall, heading, jump, strength } } };
}

let spy: ReturnType<typeof spyOn> | null = null;
afterEach(() => { spy?.mockRestore(); spy = null; });

describe("resolveAerialDuel", () => {
  const pt = { x: 100, y: 37 };
  test("the better header at the same spot is favoured", () => {
    const r = resolveAerialDuel(aerial({ ...st, x: 100, y: 37 }, 0.9), aerial({ ...cb, x: 100, y: 37 }, 0.2), pt, () => 0.99);
    expect(r.probA).toBeGreaterThan(0.6);
    expect(r.winnerId).toBe(cb.id); // roll 0.99 ≥ probA → B
  });
  test("equal players at the same spot: 50/50", () => {
    const r = resolveAerialDuel(aerial({ ...st, x: 100, y: 37 }, 0.5), aerial({ ...cb, x: 100, y: 37 }, 0.5), pt, () => 0);
    expect(r.probA).toBeCloseTo(0.5, 2);
    expect(r.winnerId).toBe(st.id);
  });
  test("being closer to the landing point helps", () => {
    const close = resolveAerialDuel(aerial({ ...st, x: 100, y: 37 }, 0.5), aerial({ ...cb, x: 102.5, y: 37 }, 0.5), pt, () => 0);
    expect(close.probA).toBeGreaterThan(0.5);
  });
});

describe("gkClaimChance", () => {
  test("a crowd lowers it and it stays a probability", () => {
    const alone = gkClaimChance(gk, 0);
    const crowded = gkClaimChance(gk, 3);
    expect(crowded).toBeLessThan(alone);
    expect(alone).toBeLessThanOrEqual(1);
    expect(gkClaimChance(gk, 50)).toBeGreaterThanOrEqual(0);
  });
});

describe("headers", () => {
  test("header effect follows heading, not finishing", () => {
    const good = computeHeaderEffect(aerial(st, 1));
    const bad = computeHeaderEffect(aerial(st, 0));
    expect(good).toBeCloseTo(A.HEADER_EFFECT_MAX, 6);
    expect(bad).toBeCloseTo(A.HEADER_EFFECT_MIN, 6);
  });
  test("resolveShot uses the header effect for a header", () => {
    spy = spyOn(Math, "random").mockReturnValue(0.999);
    const shooter = aerial({ ...st, x: 105, y: 37 }, 1);
    const shot: ShotState = { shooterId: shooter.id, fromX: 105, fromY: 37, toX: 115, toY: 37, t: 1, xg: 0.3 };
    const foot = resolveShot(shooter, null, shot);
    const head = resolveShot(shooter, null, { ...shot, header: true });
    expect(foot.goalChance).toBeCloseTo(0.3 * computeShooterEffect(shooter), 6);
    expect(head.goalChance).toBeCloseTo(0.3 * A.HEADER_EFFECT_MAX, 6);
  });
});
