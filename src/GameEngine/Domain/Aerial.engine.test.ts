import { describe, expect, test, spyOn, afterEach } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { createMatchState, tickState, startAerialBall, resolveAerialLanding } from "@/GameEngine/Domain/gameState";
import { gameBus, type GameEvents } from "@/GameEngine/Infrastructure/EventBus";
import { initStats, getPlayerStats } from "@/GameEngine/Domain/Statistics";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Squad } from "@/types/playerTypes";
import type { Formation, GameState, GamePlayer, PassState } from "@/GameEngine/types";
import formation433Json from "@/Data/formations/4-3-3.json";
import { PITCH_LENGTH } from "@/GameEngine/Domain/pitch";
import "@/GameEngine/Domain/Statistics";

/** Etapa 13 — crosses, long balls, aerial duels, keeper claims and headers in the engine (`aerial.md`). */

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  const s = JSON.parse(readFileSync(path, "utf8")) as Squad;
  return { ...s, players: s.players.map(p => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 100 } })) };
}

function baseState(): GameState {
  const f = formation433Json as Formation;
  const s: GameState = {
    ...createMatchState(loadSquad("33.json").players, f, loadSquad("34.json").players, f),
    matchPhase: "firstHalf",
    presentationCountdown: 0,
    setPiece: null,
  };
  // Everybody far from the box except the players a test places explicitly.
  return { ...s, players: s.players.map(p => (p.role === "GK" ? p : { ...p, x: 50, y: p.team === "A" ? 5 : 69 })) };
}

const find = (s: GameState, team: "A" | "B", role: string, nth = 0): GamePlayer =>
  s.players.filter(p => p.team === team && p.role === role)[nth]!;
const place = (s: GameState, id: number, x: number, y: number): GameState =>
  ({ ...s, players: s.players.map(p => (p.id === id ? { ...p, x, y, targetPosition: { x, y } } : p)) });
const seq = (...v: number[]) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]!; };

/** Team A crosser (LW) holding the ball wide, a cross already landing at `point`. */
function landing(point: { x: number; y: number }, kind: "cross" | "long_ball" = "cross"): { s: GameState; lw: GamePlayer } {
  let s = baseState();
  const lw = find(s, "A", "LW");
  s = place(s, lw.id, 100, 8);
  const pass: PassState = {
    fromId: lw.id, toId: null, toX: point.x, toY: point.y, kind, t: 0.99,
    distance: 30, receiverOffside: false, intendedRunnerId: null, aerialOffsideIds: [],
  };
  return { s: { ...s, ballHolderId: lw.id, pass }, lw };
}

function collect<K extends keyof GameEvents>(name: K): { events: GameEvents[K][]; off: () => void } {
  const events: GameEvents[K][] = [];
  const off = gameBus.on(name, e => events.push(e));
  return { events, off };
}

let spy: ReturnType<typeof spyOn> | null = null;
afterEach(() => { spy?.mockRestore(); spy = null; });

describe("high ball flight", () => {
  test("a cross is never intercepted mid-flight and resolves at the landing point", () => {
    let s = baseState();
    const lw = find(s, "A", "LW");
    const st = find(s, "A", "ST");
    const cb = find(s, "B", "CB");
    s = place(place(place(s, lw.id, 100, 8), st.id, 104, 37), cb.id, 102, 22); // CB right on the line
    s = { ...s, ballHolderId: lw.id };
    const started = collect("crossStarted");
    s = startAerialBall(s, "cross", { x: 104, y: 37 }, st.id, seq(1, 0, 0.99));
    started.off();
    expect(started.events).toHaveLength(1);
    expect(s.pass?.kind).toBe("cross");
    const interceptions = collect("interception");
    const resolved = collect("aerialResolved");
    for (let i = 0; i < 40 && s.pass?.kind === "cross"; i++) s = tickState(s, 0.2).state;
    interceptions.off();
    resolved.off();
    expect(interceptions.events).toHaveLength(0);
    expect(resolved.events).toHaveLength(1);
    expect(resolved.events[0]!.kind).toBe("cross");
  });

  test("an opponent at the passer's feet can block it at the kick", () => {
    let s = baseState();
    const lw = find(s, "A", "LW");
    const rb = find(s, "B", "RB");
    s = place(place(s, lw.id, 100, 8), rb.id, 101, 8);
    s = { ...s, ballHolderId: lw.id };
    const resolved = collect("aerialResolved");
    // error 0, block roll 0 (< BLOCK_CHANCE), no corner (0.99), spread 0.5
    s = startAerialBall(s, "cross", { x: 104, y: 37 }, null, seq(1, 0, 0, 0.99, 0.5));
    resolved.off();
    expect(s.pass).toBeNull();
    expect(resolved.events[0]!.outcome).toBe("blocked");
    expect(s.looseBall?.source).toBe("clearance");
  });
});

describe("landing resolution", () => {
  test("an unmarked attacker near goal heads at goal; the crosser is the assist candidate", () => {
    const { s: s0, lw } = landing({ x: 106, y: 37 });
    const st = find(s0, "A", "ST");
    const gk = find(s0, "B", "GK");
    let s = place(place(s0, st.id, 106.5, 37), gk.id, 114, 50); // keeper out of reach
    const headers = collect("header");
    const resolved = collect("aerialResolved");
    s = resolveAerialLanding(s, seq(0.5)).state;
    headers.off();
    resolved.off();
    expect(s.shot?.header).toBe(true);
    expect(s.shot?.shooterId).toBe(st.id);
    expect(s.lastPasserId).toBe(lw.id);
    expect(headers.events).toHaveLength(1);
    expect(resolved.events[0]).toMatchObject({ outcome: "header", completed: true, winnerId: st.id });
  });

  test("a contested ball is an aerial duel; Statistics counts it", () => {
    const { s: s0 } = landing({ x: 106, y: 37 });
    initStats(s0.players.map(p => ({ id: p.id, team: p.team })));
    const st = find(s0, "A", "ST");
    const cb = find(s0, "B", "CB");
    const gk = find(s0, "B", "GK");
    let s = place(place(place(s0, st.id, 106.5, 37), cb.id, 105.5, 37), gk.id, 114, 50);
    const duels = collect("aerialDuel");
    // duel roll 0 → attacker wins; offender pick 0.5; foul roll 0.99 → no foul.
    s = resolveAerialLanding(s, seq(0, 0.5, 0.99)).state;
    duels.off();
    expect(duels.events).toHaveLength(1);
    expect(duels.events[0]!.winnerId).toBe(st.id);
    expect(getPlayerStats(st.id).aerialDuelsWon).toBe(1);
    expect(getPlayerStats(cb.id).aerialDuels).toBe(1);
    expect(s.shot?.header).toBe(true);
  });

  test("a defender winning in his box heads it clear — a clearance loose ball, no through-ball stats", () => {
    const { s: s0 } = landing({ x: 104, y: 37 });
    const st = find(s0, "A", "ST");
    const cb = find(s0, "B", "CB");
    const gk = find(s0, "B", "GK");
    let s = place(place(place(s0, st.id, 104.5, 37), cb.id, 103.5, 37), gk.id, 114, 50);
    const tb = collect("throughBallLostInRace");
    // duel 0.99 → defender; offender 0.5; no foul 0.99; no corner 0.99; spread 0.5
    s = resolveAerialLanding(s, seq(0.99, 0.5, 0.99, 0.99, 0.5)).state;
    tb.off();
    expect(s.looseBall?.source).toBe("clearance");
    expect(s.looseBall?.fromTeamLastTouch).toBe("B");
    expect(s.ballHolderId).toBe(cb.id);
    expect(s.looseBall!.vx).toBeLessThan(0); // away from the goal B defends (x = 115)
    expect(tb.events).toHaveLength(0);
  });

  test("the keeper claims a ball dropping in his small box", () => {
    const { s: s0 } = landing({ x: 112, y: 37 });
    const gk = find(s0, "B", "GK");
    let s = place(s0, gk.id, 113, 37);
    const claims = collect("gkClaim");
    s = resolveAerialLanding(s, seq(0)).state;
    claims.off();
    expect(claims.events[0]!.claimed).toBe(true);
    expect(s.ballHolderId).toBe(gk.id);
    expect(s.setPiece?.type).toBe("goal_kick");
  });

  test("...or punches it away", () => {
    const { s: s0 } = landing({ x: 112, y: 37 });
    const gk = find(s0, "B", "GK");
    let s = place(s0, gk.id, 113, 37);
    s = resolveAerialLanding(s, seq(0.99, 0.5)).state;
    expect(s.looseBall?.source).toBe("clearance");
    expect(s.looseBall?.fromPasserId).toBe(gk.id);
  });

  test("nobody there: a loose ball from the cross; the team that picks it up completes it", () => {
    const { s: s0, lw } = landing({ x: 95, y: 37 });
    let s = resolveAerialLanding(s0, seq(0.5)).state;
    expect(s.looseBall?.source).toBe("cross");
    const cam = find(s, "A", "CAM");
    s = place(s, cam.id, s.looseBall!.x, s.looseBall!.y);
    const resolved = collect("aerialResolved");
    const tb = collect("throughBallCompleted");
    for (let i = 0; i < 5 && s.looseBall; i++) s = tickState(s, 0.2).state;
    resolved.off();
    tb.off();
    expect(resolved.events.some(e => e.outcome === "loose" && e.completed && e.fromId === lw.id)).toBe(true);
    expect(tb.events).toHaveLength(0);
  });

  test("an attacker offside at the kick who wins it is flagged", () => {
    const { s: s0 } = landing({ x: 106, y: 37 });
    const st = find(s0, "A", "ST");
    const gk = find(s0, "B", "GK");
    let s = place(place(s0, st.id, 106.5, 37), gk.id, 114, 50);
    s = { ...s, pass: { ...s.pass!, aerialOffsideIds: [st.id] } };
    s = resolveAerialLanding(s, seq(0.5)).state;
    expect(s.setPiece?.type).toBe("offside_fk");
    expect(s.players.find(p => p.id === s.ballHolderId)!.team).toBe("B");
  });

  test("an uncontested long ball in midfield is controlled by the forward", () => {
    const { s: s0 } = landing({ x: 70, y: 37 }, "long_ball");
    initStats(s0.players.map(p => ({ id: p.id, team: p.team })));
    const st = find(s0, "A", "ST");
    let s = place(s0, st.id, 70.5, 37);
    const r = resolveAerialLanding(s, seq(0.5));
    s = r.state;
    expect(r.passCompleted).toBe(true);
    expect(s.ballHolderId).toBe(st.id);
    expect(getPlayerStats(s0.ballHolderId).longBallsCompleted).toBe(1);
  });
});

describe("header goals", () => {
  test("a headed goal is flagged on goalScored and counted as a header goal", () => {
    let s = baseState();
    const gkB = find(s, "B", "GK");
    const st = find(s, "A", "ST");
    s = { ...s, players: s.players.filter(p => p.id !== gkB.id) };
    s = place(s, st.id, 108, 37);
    initStats(s.players.map(p => ({ id: p.id, team: p.team })));
    s = {
      ...s,
      ballHolderId: st.id,
      shot: { shooterId: st.id, fromX: 108, fromY: 37, toX: PITCH_LENGTH, toY: 37, t: 0.99, xg: 1, header: true },
    };
    spy = spyOn(Math, "random").mockReturnValue(0);
    const goals = collect("goalScored");
    const r = tickState(s, 0.2);
    goals.off();
    expect(r.goalScored).toBe("A");
    expect(goals.events[0]!.header).toBe(true);
    expect(getPlayerStats(st.id).headerGoals).toBe(1);
  });
});
