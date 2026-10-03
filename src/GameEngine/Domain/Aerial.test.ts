import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { createMatchState } from "@/GameEngine/Domain/gameState";
import {
  aerialDuelScore, crossTargetPoints, evaluateCrossTargets, evaluateLongBall, isCrossPosition, isInSmallBox,
} from "@/GameEngine/Domain/Aerial";
import { AERIAL_CONFIG as A } from "@/GameEngine/Configs/AerialConfig";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Squad } from "@/types/playerTypes";
import type { Formation, GamePlayer, GameState } from "@/GameEngine/types";
import formation433Json from "@/Data/formations/4-3-3.json";
import { PITCH_LENGTH, GOAL_Y_MIN, GOAL_Y_MAX } from "@/GameEngine/Domain/pitch";

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  const s = JSON.parse(readFileSync(path, "utf8")) as Squad;
  return { ...s, players: s.players.map(p => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 100 } })) };
}

function baseState(): GameState {
  const f = formation433Json as Formation;
  return { ...createMatchState(loadSquad("33.json").players, f, loadSquad("34.json").players, f), setPiece: null };
}

/** Moves every player of `team` far away (own half corner) except the ids in `keep`. */
function clearTeam(s: GameState, team: "A" | "B", keep: number[] = []): GameState {
  return {
    ...s,
    players: s.players.map(p => (p.team === team && p.role !== "GK" && !keep.includes(p.id) ? { ...p, x: 5, y: 2 } : p)),
  };
}

function place(s: GameState, id: number, x: number, y: number): GameState {
  return { ...s, players: s.players.map(p => (p.id === id ? { ...p, x, y } : p)) };
}

function withHeading(p: GamePlayer, heading: number): GamePlayer {
  return { ...p, runtimeStats: { ...p.runtimeStats, withoutBall: { ...p.runtimeStats.withoutBall, heading } } };
}

const find = (s: GameState, team: "A" | "B", role: string, nth = 0) => s.players.filter(p => p.team === team && p.role === role)[nth]!;

describe("isCrossPosition", () => {
  const s = baseState();
  const lw = find(s, "A", "LW");
  test("wide in the final third is a crossing position", () => {
    expect(isCrossPosition({ ...lw, x: PITCH_LENGTH - 20, y: 8 })).toBe(true);
  });
  test("central in the final third is not", () => {
    expect(isCrossPosition({ ...lw, x: PITCH_LENGTH - 20, y: 37 })).toBe(false);
  });
  test("wide in the own half is not", () => {
    expect(isCrossPosition({ ...lw, x: 40, y: 8 })).toBe(false);
  });
  test("inside the penalty area only a byline cut-back wide of the six-yard box counts", () => {
    expect(isCrossPosition({ ...lw, x: PITCH_LENGTH - 12, y: 20 })).toBe(false);
    expect(isCrossPosition({ ...lw, x: PITCH_LENGTH - 2, y: 20 })).toBe(true);
    expect(isCrossPosition({ ...lw, x: PITCH_LENGTH - 2, y: GOAL_Y_MIN - 4 })).toBe(false);
  });
  test("a goalkeeper never crosses", () => {
    const gk = find(s, "A", "GK");
    expect(isCrossPosition({ ...gk, x: PITCH_LENGTH - 20, y: 8 })).toBe(false);
  });
});

describe("cross targets", () => {
  test("near post is on the crosser's side, far post on the other", () => {
    const s = baseState();
    const lw = { ...find(s, "A", "LW"), x: PITCH_LENGTH - 15, y: 6 };
    const [near, spot, far] = crossTargetPoints(lw);
    expect(near!.kind).toBe("near_post");
    expect(near!.y).toBe(GOAL_Y_MIN);
    expect(spot!.x).toBe(PITCH_LENGTH - A.PENALTY_SPOT_DEPTH);
    expect(far!.y).toBeGreaterThan(GOAL_Y_MAX);
  });

  test("no attacker in any zone → every target scores 0", () => {
    let s = baseState();
    const lw = find(s, "A", "LW");
    s = clearTeam(s, "A", [lw.id]);
    s = place(s, lw.id, PITCH_LENGTH - 15, 6);
    const targets = evaluateCrossTargets(s.players.find(p => p.id === lw.id)!, s.players);
    expect(targets).toHaveLength(3);
    for (const t of targets) expect(t.raw).toBe(0);
  });

  test("an attacker at the penalty spot makes it the best target; defenders around it lower it", () => {
    let s = baseState();
    const lw = find(s, "A", "LW");
    const st = find(s, "A", "ST");
    s = clearTeam(s, "A", [lw.id, st.id]);
    s = clearTeam(s, "B");
    s = place(s, lw.id, PITCH_LENGTH - 15, 6);
    s = place(s, st.id, PITCH_LENGTH - 12, 37);
    const holder = s.players.find(p => p.id === lw.id)!;
    const free = evaluateCrossTargets(holder, s.players);
    expect(free[0]!.kind).toBe("penalty_spot");
    expect(free[0]!.bestAttackerId).toBe(st.id);
    expect(free[0]!.raw).toBeGreaterThan(0);

    const cb1 = find(s, "B", "CB", 0);
    const cb2 = find(s, "B", "CB", 1);
    let marked = place(s, cb1.id, PITCH_LENGTH - 11, 36);
    marked = place(marked, cb2.id, PITCH_LENGTH - 12, 38.5);
    const spot = evaluateCrossTargets(holder, marked.players).find(t => t.kind === "penalty_spot")!;
    expect(spot.raw).toBeLessThan(free[0]!.raw);
  });

  test("a better header in the zone raises the target", () => {
    let s = baseState();
    const lw = find(s, "A", "LW");
    const st = find(s, "A", "ST");
    s = clearTeam(clearTeam(s, "A", [lw.id, st.id]), "B");
    s = place(place(s, lw.id, PITCH_LENGTH - 15, 6), st.id, PITCH_LENGTH - 12, 37);
    const holder = s.players.find(p => p.id === lw.id)!;
    const low = { ...s, players: s.players.map(p => (p.id === st.id ? withHeading(p, 0.1) : p)) };
    const high = { ...s, players: s.players.map(p => (p.id === st.id ? withHeading(p, 0.9) : p)) };
    const rLow = evaluateCrossTargets(holder, low.players).find(t => t.kind === "penalty_spot")!.raw;
    const rHigh = evaluateCrossTargets(holder, high.players).find(t => t.kind === "penalty_spot")!.raw;
    expect(rHigh).toBeGreaterThan(rLow);
  });

  test("a target the keeper can reach is penalised", () => {
    let s = baseState();
    const lw = find(s, "A", "LW");
    const st = find(s, "A", "ST");
    s = clearTeam(clearTeam(s, "A", [lw.id, st.id]), "B");
    s = place(place(s, lw.id, PITCH_LENGTH - 25, 6), st.id, PITCH_LENGTH - A.NEAR_POST_DEPTH, GOAL_Y_MIN);
    const gk = find(s, "B", "GK");
    const holder = () => s.players.find(p => p.id === lw.id)!;
    s = place(s, gk.id, PITCH_LENGTH - 1, 55);
    const away = evaluateCrossTargets(holder(), s.players).find(t => t.kind === "near_post")!;
    s = place(s, gk.id, PITCH_LENGTH - 5, GOAL_Y_MIN + 1);
    const near = evaluateCrossTargets(holder(), s.players).find(t => t.kind === "near_post")!;
    expect(away.gkClaim).toBe(false);
    expect(near.gkClaim).toBe(true);
    expect(near.raw).toBeCloseTo(Math.max(0, away.raw - A.CROSS_GK_PENALTY), 6);
  });
});

describe("cross depth", () => {
  test("a cross from close to the line is scaled down (the carrier has better options there)", () => {
    let s = baseState();
    const lw = find(s, "A", "LW");
    const st = find(s, "A", "ST");
    s = clearTeam(clearTeam(s, "A", [lw.id, st.id]), "B");
    s = place(s, st.id, PITCH_LENGTH - 12, 37);
    const deep = evaluateCrossTargets({ ...s.players.find(p => p.id === lw.id)!, x: PITCH_LENGTH - 25, y: 6 }, s.players)[0]!;
    const near = evaluateCrossTargets({ ...s.players.find(p => p.id === lw.id)!, x: PITCH_LENGTH - 10, y: 6 }, s.players)[0]!;
    expect(deep.raw).toBeGreaterThan(0);
    expect(near.raw).toBeCloseTo(deep.raw * A.CROSS_NEAR_LINE_MULT, 6);
  });
});

describe("aerial duel score and small box", () => {
  test("closer to the landing point and better heading score higher", () => {
    const s = baseState();
    const cb = find(s, "B", "CB");
    const pt = { x: 100, y: 37 };
    const near = aerialDuelScore({ ...cb, x: 100, y: 37.5 }, pt);
    const far = aerialDuelScore({ ...cb, x: 102.5, y: 37 }, pt);
    expect(near).toBeGreaterThan(far);
    expect(aerialDuelScore(withHeading({ ...cb, x: 100, y: 37 }, 0.9), pt))
      .toBeGreaterThan(aerialDuelScore(withHeading({ ...cb, x: 100, y: 37 }, 0.2), pt));
  });
  test("small box geometry", () => {
    expect(isInSmallBox(PITCH_LENGTH - 3, 37, PITCH_LENGTH)).toBe(true);
    expect(isInSmallBox(PITCH_LENGTH - 10, 37, PITCH_LENGTH)).toBe(false);
    expect(isInSmallBox(3, GOAL_Y_MIN - A.SMALL_BOX_WIDE - 1, 0)).toBe(false);
  });
});

describe("evaluateLongBall", () => {
  function setup(): { s: GameState; cb: GamePlayer; st: GamePlayer } {
    let s = baseState();
    const cb = find(s, "A", "CB");
    const st = find(s, "A", "ST");
    s = clearTeam(clearTeam(s, "A", [cb.id, st.id]), "B");
    s = place(place(s, cb.id, 20, 30), st.id, 65, 37);
    return { s, cb: s.players.find(p => p.id === cb.id)!, st: s.players.find(p => p.id === st.id)! };
  }
  test("a centre back finds the striker over the line", () => {
    const { s, cb, st } = setup();
    const lb = evaluateLongBall(cb, s.players, 1);
    expect(lb).not.toBeNull();
    expect(lb!.targetId).toBe(st.id);
    expect(lb!.x).toBeCloseTo(st.x + A.LONG_BALL_LEAD, 6);
    expect(lb!.raw).toBeGreaterThan(0);
  });
  test("a zero tactic weight disables it; a higher weight scores more", () => {
    const { s, cb } = setup();
    expect(evaluateLongBall(cb, s.players, 0)).toBeNull();
    expect(evaluateLongBall(cb, s.players, 1.5)!.raw).toBeGreaterThan(evaluateLongBall(cb, s.players, 1)!.raw);
  });
  test("a striker beyond the offside line is not a target", () => {
    const { s, cb, st } = setup();
    expect(evaluateLongBall(cb, s.players, 1, st.x - 1)).toBeNull();
    expect(evaluateLongBall(cb, s.players, 1, st.x + 1)!.targetId).toBe(st.id);
  });
  test("a holder deep in the opponent half does not play long balls", () => {
    const { s, cb } = setup();
    expect(evaluateLongBall({ ...cb, x: 90 }, s.players, 1)).toBeNull();
  });
});
