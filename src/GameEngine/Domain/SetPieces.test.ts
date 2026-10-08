import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { createMatchState } from "@/GameEngine/Domain/gameState";
import {
  attackingBoxPositions, defendingBoxPositions, directFreeKickXG, evaluateBoxSetPiece, isDirectFreeKick,
  pickSetPieceTaker, setPieceTakerScore, wallBlockChance, wallSize, wallSpots,
} from "@/GameEngine/Domain/SetPieces";
import { SET_PIECE_CONFIG as SP } from "@/GameEngine/Configs/SetPieceConfig";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Squad } from "@/types/playerTypes";
import type { Formation, GamePlayer, GameState } from "@/GameEngine/types";
import formation433Json from "@/Data/formations/4-3-3.json";
import { PITCH_LENGTH, PITCH_WIDTH, GOAL_Y_MIN, GOAL_Y_MAX } from "@/GameEngine/Domain/pitch";
import { aerialAbility } from "@/GameEngine/Domain/Aerial";

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  const s = JSON.parse(readFileSync(path, "utf8")) as Squad;
  return { ...s, players: s.players.map(p => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 100 } })) };
}

function baseState(): GameState {
  const f = formation433Json as Formation;
  return { ...createMatchState(loadSquad("33.json").players, f, loadSquad("34.json").players, f), setPiece: null };
}

const team = (s: GameState, t: "A" | "B") => s.players.filter(p => p.team === t);
const noJitter = () => 0.5;

describe("direct free kick", () => {
  test("central within 30 yards is direct; wide or far is not", () => {
    expect(isDirectFreeKick({ x: PITCH_LENGTH - 22, y: 37 }, 1)).toBe(true);
    expect(isDirectFreeKick({ x: PITCH_LENGTH - 35, y: 37 }, 1)).toBe(false);
    expect(isDirectFreeKick({ x: PITCH_LENGTH - 10, y: 5 }, 1)).toBe(false);
    expect(isDirectFreeKick({ x: 22, y: 37 }, -1)).toBe(true);
    expect(isDirectFreeKick({ x: 22, y: 37 }, 1)).toBe(false);
  });

  test("never direct from inside the penalty area", () => {
    expect(isDirectFreeKick({ x: PITCH_LENGTH - 14, y: 37 }, 1)).toBe(false);
  });

  test("xG falls with distance and angle", () => {
    const near = directFreeKickXG(19, 0.4);
    const far = directFreeKickXG(29, 0.4);
    const wide = directFreeKickXG(19, 0.25);
    expect(near).toBeGreaterThan(far);
    expect(near).toBeGreaterThan(wide);
    expect(near).toBeLessThanOrEqual(SP.FK_XG_BASE);
  });

  test("wall: 2–5 men, more when closer and central", () => {
    for (const [d, a] of [[19, 0.42], [29, 0.24], [25, 0.3]] as const) {
      const n = wallSize(d, a);
      expect(n).toBeGreaterThanOrEqual(SP.WALL_MIN);
      expect(n).toBeLessThanOrEqual(SP.WALL_MAX);
    }
    expect(wallSize(19, 0.45)).toBeGreaterThan(wallSize(29, 0.25));
    expect(wallBlockChance(4)).toBeCloseTo(4 * SP.WALL_BLOCK_FACTOR);
  });

  test("wall spots sit WALL_DISTANCE yards from the ball toward goal, spread across the line", () => {
    const ball = { x: PITCH_LENGTH - 24, y: 30 };
    const spots = wallSpots(ball, PITCH_LENGTH, 4);
    expect(spots).toHaveLength(4);
    const cx = spots.reduce((s, p) => s + p.x, 0) / 4;
    const cy = spots.reduce((s, p) => s + p.y, 0) / 4;
    expect(Math.hypot(cx - ball.x, cy - ball.y)).toBeCloseTo(SP.WALL_DISTANCE, 1);
    expect(cx).toBeGreaterThan(ball.x);
  });
});

describe("set-piece takers", () => {
  const s = baseState();
  const A = team(s, "A");

  test("automatic: best delivery for corners, best finishing for free kicks / penalties", () => {
    const corner = pickSetPieceTaker("corners", A)!;
    const fk = pickSetPieceTaker("freeKicks", A)!;
    expect(corner.role).not.toBe("GK");
    for (const p of A.filter(p => p.role !== "GK")) {
      expect(setPieceTakerScore("corners", corner)).toBeGreaterThanOrEqual(setPieceTakerScore("corners", p));
      expect(setPieceTakerScore("freeKicks", fk)).toBeGreaterThanOrEqual(setPieceTakerScore("freeKicks", p));
    }
  });

  test("chosen taker wins when on the pitch; unknown id falls back to automatic", () => {
    const chosen = A.find(p => p.role === "CB")!;
    expect(pickSetPieceTaker("corners", A, [chosen.rosterId])!.id).toBe(chosen.id);
    expect(pickSetPieceTaker("corners", A, ["nobody"])!.id).toBe(pickSetPieceTaker("corners", A)!.id);
  });

  test("first of the up-to-3 preferred takers on the pitch wins; none on the pitch = automatic", () => {
    const cb = A.find(p => p.role === "CB")!;
    const st = A.find(p => p.role === "ST")!;
    expect(pickSetPieceTaker("penalties", A, [cb.rosterId, st.rosterId])!.id).toBe(cb.id);
    expect(pickSetPieceTaker("penalties", A, ["gone", st.rosterId, cb.rosterId])!.id).toBe(st.id);
    expect(pickSetPieceTaker("penalties", A, ["gone", "off", "benched"])!.id).toBe(pickSetPieceTaker("penalties", A)!.id);
    expect(pickSetPieceTaker("penalties", A, [])!.id).toBe(pickSetPieceTaker("penalties", A)!.id);
  });
});

describe("box set piece layout", () => {
  const s = baseState();
  const A = team(s, "A");
  const B = team(s, "B");
  const taker = pickSetPieceTaker("corners", A)!;
  const ball = { x: PITCH_LENGTH, y: 0 };

  test("the two best aerial defenders and the centre-forward go up; one on the edge; taker on the ball", () => {
    const lay = attackingBoxPositions(A, taker.id, ball, 1, "corner", noJitter);
    expect(lay.positions.get(taker.id)).toEqual(ball);
    expect(lay.boxAttackers).toHaveLength(SP.BOX_ATTACKERS);
    const defs = A.filter(p => ["CB", "LB", "RB", "LWB", "RWB"].includes(p.role) && p.id !== taker.id)
      .sort((a, b) => aerialAbility(b) - aerialAbility(a)).slice(0, 2);
    for (const d of defs) expect(lay.boxAttackers).toContain(d.id);
    const st = A.find(p => p.role === "ST")!;
    if (st.id !== taker.id) expect(lay.boxAttackers).toContain(st.id);
    for (const id of lay.boxAttackers) {
      const p = lay.positions.get(id)!;
      expect(PITCH_LENGTH - p.x).toBeLessThanOrEqual(16);
    }
    const edge = lay.positions.get(lay.edgeId!)!;
    expect(PITCH_LENGTH - edge.x).toBeCloseTo(SP.EDGE_DEPTH, 0);
    // The goalkeeper stays home.
    const gk = A.find(p => p.role === "GK")!;
    expect(lay.positions.get(gk.id)!.x).toBeLessThan(PITCH_LENGTH / 2);
  });

  test("defenders mark every box attacker goal-side and leave one outlet up the pitch", () => {
    const att = attackingBoxPositions(A, taker.id, ball, 1, "corner", noJitter);
    const def = defendingBoxPositions(B, att, ball, PITCH_LENGTH, "corner");
    for (const id of att.boxAttackers) {
      const a = att.positions.get(id)!;
      const markerId = def.markers.get(id)!;
      expect(markerId).toBeDefined();
      const m = def.positions.get(markerId)!;
      expect(Math.hypot(m.x - a.x, m.y - a.y)).toBeLessThan(2.5);
      expect(Math.abs(PITCH_LENGTH - m.x)).toBeLessThanOrEqual(Math.abs(PITCH_LENGTH - a.x) + 0.01);
    }
    const outlet = def.positions.get(def.outletId!)!;
    expect(PITCH_LENGTH - outlet.x).toBeGreaterThan(30);
    const gk = B.find(p => p.role === "GK")!;
    expect(PITCH_LENGTH - def.positions.get(gk.id)!.x).toBeLessThan(2);
  });

  test("every player of both teams gets a spot on the pitch", () => {
    const att = attackingBoxPositions(A, taker.id, ball, 1, "corner", noJitter);
    const def = defendingBoxPositions(B, att, ball, PITCH_LENGTH, "corner");
    for (const p of A) expect(att.positions.has(p.id)).toBe(true);
    for (const p of B) expect(def.positions.has(p.id)).toBe(true);
    for (const pos of [...att.positions.values(), ...def.positions.values()]) {
      expect(pos.x).toBeGreaterThanOrEqual(0);
      expect(pos.x).toBeLessThanOrEqual(PITCH_LENGTH);
      expect(pos.y).toBeGreaterThanOrEqual(0);
      expect(pos.y).toBeLessThanOrEqual(PITCH_WIDTH);
    }
  });

  test("crossed free kick: attackers line up level with the defensive line (onside)", () => {
    const fkBall = { x: PITCH_LENGTH - 34, y: 10 };
    const att = attackingBoxPositions(A, taker.id, fkBall, 1, "free_kick", noJitter);
    const def = defendingBoxPositions(B, att, fkBall, PITCH_LENGTH, "free_kick");
    const lineX = Math.max(...[...def.positions.entries()]
      .filter(([id]) => B.find(p => p.id === id)!.role !== "GK").map(([, p]) => p.x));
    for (const id of att.boxAttackers) expect(att.positions.get(id)!.x).toBeLessThanOrEqual(lineX + 0.01);
  });
});

function placeAll(s: GameState, maps: Map<number, { x: number; y: number }>[]): GameState {
  return {
    ...s,
    players: s.players.map(p => {
      for (const m of maps) { const pos = m.get(p.id); if (pos) return { ...p, x: pos.x, y: pos.y }; }
      return p;
    }),
  };
}

describe("evaluateBoxSetPiece", () => {
  const s0 = baseState();
  const A = team(s0, "A");
  const B = team(s0, "B");
  const taker = pickSetPieceTaker("corners", A)!;
  const ball = { x: PITCH_LENGTH, y: 0 };
  const att = attackingBoxPositions(A, taker.id, ball, 1, "corner", noJitter);
  const def = defendingBoxPositions(B, att, ball, PITCH_LENGTH, "corner");
  const s = placeAll(s0, [att.positions, def.positions]);
  const t = s.players.find(p => p.id === taker.id)!;

  test("offers near post, penalty spot, far post and short, sorted best first", () => {
    const opts = evaluateBoxSetPiece(t, s.players, "balanced");
    expect(opts.map(o => o.kind).sort()).toEqual(["far_post", "near_post", "penalty_spot", "short"]);
    for (let i = 1; i < opts.length; i++) expect(opts[i - 1]!.raw).toBeGreaterThanOrEqual(opts[i]!.raw);
    const near = opts.find(o => o.kind === "near_post")!;
    expect(near.y).toBe(GOAL_Y_MIN);
    const short = opts.find(o => o.kind === "short")!;
    expect(short.targetId).not.toBeNull();
  });

  test("possession build-up favours the short corner", () => {
    const bal = evaluateBoxSetPiece(t, s.players, "balanced").find(o => o.kind === "short")!.raw;
    const pos = evaluateBoxSetPiece(t, s.players, "possession").find(o => o.kind === "short")!.raw;
    const dir = evaluateBoxSetPiece(t, s.players, "direct").find(o => o.kind === "short")!.raw;
    expect(pos).toBeGreaterThan(bal);
    expect(dir).toBeLessThan(bal);
  });

  test("taller attackers in a zone raise its score", () => {
    const tall = (p: GamePlayer): GamePlayer => ({
      ...p,
      runtimeStats: { ...p.runtimeStats, withoutBall: { ...p.runtimeStats.withoutBall, heading: 1, jump: 1 } },
    });
    const base = evaluateBoxSetPiece(t, s.players, "balanced");
    const boosted = s.players.map(p => (att.boxAttackers.includes(p.id) ? tall(p) : p));
    const after = evaluateBoxSetPiece(t, boosted, "balanced");
    const best = (o: typeof base) => Math.max(...o.filter(x => x.kind !== "short").map(x => x.raw));
    expect(best(after)).toBeGreaterThan(best(base));
  });

  test("far post sits beyond the far post", () => {
    const far = evaluateBoxSetPiece(t, s.players, "balanced").find(o => o.kind === "far_post")!;
    expect(far.y).toBeGreaterThan(GOAL_Y_MAX);
  });
});
