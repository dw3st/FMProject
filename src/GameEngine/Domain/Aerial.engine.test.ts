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
    // error 0, block roll 0 (< BLOCK_CHANCE), no corner (0.99), spread 0.5, distance 0.5
    s = startAerialBall(s, "cross", { x: 104, y: 37 }, null, seq(1, 0, 0, 0.99, 0.5, 0.5));
    resolved.off();
    expect(resolved.events[0]!.outcome).toBe("blocked");
    expect(s.pass?.kind).toBe("clearance");
    expect(s.pass?.fromId).toBe(rb.id);
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

  test("set-piece rules in the air apply only to a box delivery (corner / crossed free kick)", () => {
    const { s: s0 } = landing({ x: 106, y: 37 });
    const st = find(s0, "A", "ST");
    const cb = find(s0, "B", "CB");
    const gk = find(s0, "B", "GK");
    const s = place(place(place(s0, st.id, 106.5, 37), cb.id, 105.5, 37), gk.id, 114, 50);
    const probAtt = (pass: PassState) => {
      const duels = collect("aerialDuel");
      resolveAerialLanding({ ...s, pass }, seq(0.99, 0.5, 0.99, 0.99, 0.5, 0.5));
      duels.off();
      const d = duels.events[0]!;
      return d.winnerId === st.id ? d.probWinner : 1 - d.probWinner;
    };
    const open = probAtt(s.pass!);
    // A cross played from a quick / long-range free kick (no set layout): open-play rules.
    expect(probAtt({ ...s.pass!, fromSetPiece: true })).toBeCloseTo(open, 6);
    // A corner / crossed free kick: the set marker wins most duels.
    expect(probAtt({ ...s.pass!, fromSetPiece: true, setPieceVariant: "box" })).toBeLessThan(open / 2);
  });

  test("a defender winning in his box heads it clear — a second ball, no through-ball stats", () => {
    const { s: s0 } = landing({ x: 104, y: 37 });
    const st = find(s0, "A", "ST");
    const cb = find(s0, "B", "CB");
    const gk = find(s0, "B", "GK");
    let s = place(place(place(s0, st.id, 104.5, 37), cb.id, 103.5, 37), gk.id, 114, 50);
    const tb = collect("throughBallLostInRace");
    // duel 0.99 → defender; offender 0.5; no foul 0.99; no corner 0.99; distance 0.5; spread 0.5
    s = resolveAerialLanding(s, seq(0.99, 0.5, 0.99, 0.99, 0.5, 0.5)).state;
    tb.off();
    expect(s.pass?.kind).toBe("clearance");
    expect(s.pass?.fromId).toBe(cb.id);
    expect(s.ballHolderId).toBe(cb.id);
    expect(s.pass!.toX).toBeLessThan(103.5); // away from the goal B defends (x = 115)
    expect(tb.events).toHaveLength(0);
    // The second ball: an attacker waiting where it lands wins it.
    const cam = find(s, "A", "CAM");
    s = place(s, cam.id, s.pass!.toX, s.pass!.toY);
    s = resolveAerialLanding(s, seq(0.5)).state;
    expect(s.ballHolderId).toBe(cam.id);
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
    expect(s.pass?.kind).toBe("clearance");
    expect(s.pass?.fromId).toBe(gk.id);
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
    const r = resolveAerialLanding(s, seq(0)); // control roll succeeds
    s = r.state;
    expect(r.passCompleted).toBe(true);
    expect(s.ballHolderId).toBe(st.id);
    expect(getPlayerStats(s0.ballHolderId).longBallsCompleted).toBe(1);
  });
});

describe("first touch", () => {
  test("a failed first touch drops the ball loose at the landing point", () => {
    const { s: s0 } = landing({ x: 70, y: 37 }, "long_ball");
    const st = find(s0, "A", "ST");
    const s = resolveAerialLanding(place(s0, st.id, 70.5, 37), seq(0.999, 0.25)).state;
    expect(s.looseBall?.source).toBe("long_ball");
    expect(s.looseBall?.x).toBe(70);
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

describe("/test scenario cross-to-box", () => {
  test("the winger with the ball chooses to cross", async () => {
    const { TEST_SCENARIOS } = await import("@/GameEngine/Support/TestCases");
    const { decide } = await import("@/GameEngine/Domain/DecisionTree");
    const sc = TEST_SCENARIOS.find(t => t.id === "cross-to-box")!;
    const s = sc.createState();
    const holder = s.players.find(p => p.id === s.ballHolderId)!;
    const d = decide(holder, holder, true, false, s.players, null, 0);
    expect(d.type).toBe("cross");
  });
});

describe("review fixes", () => {
  test("committing chasers for a new ball releases the ones still chasing an old one", () => {
    let s = baseState();
    const lw = find(s, "A", "LW");
    const st = find(s, "A", "ST");
    const far = find(s, "B", "LB");
    s = place(place(place(s, lw.id, 100, 8), st.id, 104, 37), far.id, 30, 60);
    s = {
      ...s,
      ballHolderId: lw.id,
      players: s.players.map(p => (p.id === far.id
        ? { ...p, decisionMemory: { path: "TEAM_WITHOUT_BALL", decision: { type: "chase_loose_ball", toX: 30, toY: 60 }, commitTicks: 6 } }
        : p)),
    };
    s = startAerialBall(s, "cross", { x: 104, y: 37 }, st.id, seq(1, 0, 0.99));
    expect(s.players.find(p => p.id === far.id)!.decisionMemory.decision).toBeNull();
  });

  test("half-time clears every chase memory", () => {
    let s = baseState();
    const st = find(s, "A", "ST");
    s = {
      ...s,
      matchPhase: "halfTime",
      presentationCountdown: 0.01,
      players: s.players.map(p => (p.id === st.id
        ? { ...p, decisionMemory: { path: "TEAM_WITH_BALL", decision: { type: "chase_loose_ball", toX: 1, toY: 1 }, commitTicks: 6 } }
        : p)),
    };
    s = tickState(s, 0.2).state;
    expect(s.matchPhase).toBe("secondHalf");
    expect(s.players.find(p => p.id === st.id)!.decisionMemory.decision).toBeNull();
  });

  test("a keeper far out of position does not claim a ball dropping in his small box", () => {
    const { s: s0 } = landing({ x: 112, y: 37 });
    const gk = find(s0, "B", "GK");
    const s = place(s0, gk.id, 95, 37);
    const claims = collect("gkClaim");
    resolveAerialLanding(s, seq(0.5));
    claims.off();
    expect(claims.events).toHaveLength(0);
  });

  test("an attacker offside at the kick who picks up the dropped ball is flagged", () => {
    const { s: s0 } = landing({ x: 95, y: 37 });
    const cam = find(s0, "A", "CAM");
    let s: GameState = { ...s0, pass: { ...s0.pass!, aerialOffsideIds: [cam.id] } };
    s = resolveAerialLanding(s, seq(0.5)).state;
    expect(s.looseBall?.offsideIds).toEqual([cam.id]);
    s = place(s, cam.id, s.looseBall!.x, s.looseBall!.y);
    for (let i = 0; i < 5 && s.looseBall; i++) s = tickState(s, 0.2).state;
    expect(s.setPiece?.type).toBe("offside_fk");
  });

  test("an offside attacker in an aerial duel is flagged before any duel or foul", () => {
    const { s: s0 } = landing({ x: 106, y: 37 });
    const st = find(s0, "A", "ST");
    const cb = find(s0, "B", "CB");
    const gk = find(s0, "B", "GK");
    let s = place(place(place(s0, st.id, 106.5, 37), cb.id, 105.5, 37), gk.id, 114, 50);
    s = { ...s, pass: { ...s.pass!, aerialOffsideIds: [st.id] } };
    const duels = collect("aerialDuel");
    const fouls = collect("foul");
    s = resolveAerialLanding(s, seq(0)).state;
    duels.off();
    fouls.off();
    expect(duels.events).toHaveLength(0);
    expect(fouls.events).toHaveLength(0);
    expect(s.setPiece?.type).toBe("offside_fk");
  });

  test("a defender's bad first touch is his team's loose ball, not a completed long ball", () => {
    const { s: s0 } = landing({ x: 70, y: 37 }, "long_ball");
    initStats(s0.players.map(p => ({ id: p.id, team: p.team })));
    const cb = find(s0, "B", "CB");
    const resolved = collect("aerialResolved");
    const s = resolveAerialLanding(place(s0, cb.id, 70.5, 37), seq(0.999, 0.25)).state;
    resolved.off();
    expect(s.looseBall?.fromTeamLastTouch).toBe("B");
    expect(s.looseBall?.source).toBe("clearance");
    expect(resolved.events[0]).toMatchObject({ completed: false, outcome: "loose" });
    expect(getPlayerStats(s0.ballHolderId).longBallsCompleted).toBe(0);
  });

  test("the whistle waits for a high ball played from a set piece", async () => {
    const { restartHoldsPeriod } = await import("@/GameEngine/Domain/gameState");
    const { s } = landing({ x: 100, y: 37 });
    expect(restartHoldsPeriod(s, 2701, 2700)).toBe(false);
    expect(restartHoldsPeriod({ ...s, pass: { ...s.pass!, fromSetPiece: true } }, 2701, 2700)).toBe(true);
    expect(restartHoldsPeriod({ ...s, pass: { ...s.pass!, fromSetPiece: true } }, 2800, 2700)).toBe(false);
  });
});
