import { describe, expect, test, spyOn, afterEach } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import {
  createMatchState, tickState, maybeFoul, awardCorner, startDirectFreeKick, restartHoldsPeriod, startAerialBall,
} from "@/GameEngine/Domain/gameState";
import { decide } from "@/GameEngine/Domain/DecisionTree";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { initStats, getTeamStats } from "@/GameEngine/Domain/Statistics";
import { SET_PIECE_CONFIG as SP } from "@/GameEngine/Configs/SetPieceConfig";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Squad } from "@/types/playerTypes";
import type { Formation, GameState, GamePlayer } from "@/GameEngine/types";
import formation433Json from "@/Data/formations/4-3-3.json";
import { PITCH_LENGTH, PITCH_WIDTH } from "@/GameEngine/Domain/pitch";

/** Etapa 14 — set pieces in the full engine (`.claude/rules/game-engine/set-pieces-play.md`). */

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  const s = JSON.parse(readFileSync(path, "utf8")) as Squad;
  return { ...s, players: s.players.map(p => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 100 } })) };
}

function buildState(): GameState {
  const f = formation433Json as Formation;
  return {
    ...createMatchState(loadSquad("33.json").players, f, loadSquad("34.json").players, f),
    matchPhase: "firstHalf",
    presentationCountdown: 0,
    setPiece: null,
  } as GameState;
}

/** Team A's ST holds the ball at (x, y), a Team B CB right behind him. Team A attacks +x. */
function foulSituation(x: number, y: number): { s: GameState; attacker: GamePlayer; defender: GamePlayer } {
  let s = buildState();
  const attacker = s.players.find(p => p.team === "A" && p.role === "ST")!;
  const defender = s.players.find(p => p.team === "B" && p.role === "CB")!;
  s = {
    ...s,
    ballHolderId: attacker.id,
    players: s.players.map(p =>
      p.id === attacker.id ? { ...p, x, y } :
      p.id === defender.id ? { ...p, x: x - 1.5, y } : p),
  };
  return { s, attacker: s.players.find(p => p.id === attacker.id)!, defender: s.players.find(p => p.id === defender.id)! };
}

const seq = (...v: number[]) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]!; };
const foul = (s: GameState, off: GamePlayer, vic: GamePlayer) => maybeFoul(s, off, vic, "tackle", false, seq(0, 0.99, 0.99))!;
const holder = (s: GameState) => s.players.find(p => p.id === s.ballHolderId)!;

let randomSpy: ReturnType<typeof spyOn> | null = null;
afterEach(() => { randomSpy?.mockRestore(); randomSpy = null; });

describe("free kicks", () => {
  test("central within 30 yards: a direct free kick with a 2–5 man wall 10 yards away", () => {
    const { s, attacker, defender } = foulSituation(PITCH_LENGTH - 22, 37);
    const out = foul(s, defender, attacker);
    expect(out.setPiece?.type).toBe("free_kick");
    expect(out.setPiece?.variant).toBe("direct");
    const wall = out.setPiece!.wallIds!;
    expect(wall.length).toBeGreaterThanOrEqual(SP.WALL_MIN);
    expect(wall.length).toBeLessThanOrEqual(SP.WALL_MAX);
    for (const id of wall) {
      const w = out.players.find(p => p.id === id)!;
      expect(w.team).toBe("B");
      expect(Math.hypot(w.x - (PITCH_LENGTH - 22), w.y - 37)).toBeCloseTo(SP.WALL_DISTANCE, 0);
    }
    expect(out.setPiecePhase?.team).toBe("A");
  });

  test("wide within FK_CROSS_RANGE: a box free kick; far away: a quick free kick", () => {
    const wide = foulSituation(PITCH_LENGTH - (SP.FK_CROSS_RANGE - 4), 8);
    expect(foul(wide.s, wide.defender, wide.attacker).setPiece?.variant).toBe("box");
    const far = foulSituation(60, 37);
    const out = foul(far.s, far.defender, far.attacker);
    expect(out.setPiece?.variant).toBeUndefined();
    expect(out.setPiecePhase ?? null).toBeNull();
  });

  test("the chosen free-kick taker takes it; the direct taker shoots", () => {
    const { s, attacker, defender } = foulSituation(PITCH_LENGTH - 22, 37);
    const cb = s.players.find(p => p.team === "A" && p.role === "CB")!;
    const out = foul({ ...s, setPieceTakers: { A: { freeKicks: cb.rosterId } } }, defender, attacker);
    expect(out.ballHolderId).toBe(cb.id);
    const h = holder(out);
    expect(decide(h, h, true, false, out.players, null, 0, out.setPiece)).toEqual({ type: "shoot" });
  });

  test("direct free kick: struck wall → loose ball; else a shot flagged freeKick", () => {
    const { s, attacker, defender } = foulSituation(PITCH_LENGTH - 22, 37);
    const fk = { ...foul(s, defender, attacker), setPiece: { ...foul(s, defender, attacker).setPiece!, countdown: 0 } };
    const shots: number[] = [];
    const unsub = gameBus.on("directFreeKick", e => shots.push(e.wallSize));
    const blocked = startDirectFreeKick(fk, () => 0);
    expect(blocked.looseBall).not.toBeNull();
    expect(blocked.shot).toBeNull();
    expect(blocked.setPiece).toBeNull();
    const struck = startDirectFreeKick(fk, () => 0.99);
    unsub();
    expect(struck.shot?.freeKick).toBe(true);
    expect(struck.shot?.xg).toBeGreaterThan(0);
    expect(shots).toHaveLength(2);
  });

  test("the whistle waits for a box or direct free kick still with its taker", () => {
    const { s, attacker, defender } = foulSituation(PITCH_LENGTH - (SP.FK_CROSS_RANGE - 4), 8);
    const out = foul(s, defender, attacker);
    expect(restartHoldsPeriod(out, 2710, 2700)).toBe(true);
    expect(restartHoldsPeriod(out, 2770, 2700)).toBe(false);
  });
});

describe("substitutions during a set-piece freeze", () => {
  test("the taker is not subbed before the kick; a subbed wall player is replaced in the wall", () => {
    const { s, attacker, defender } = foulSituation(PITCH_LENGTH - 22, 37);
    let fk = foul(s, defender, attacker);
    const takerId = fk.setPiece!.takerId;
    const wallOut = fk.setPiece!.wallIds![0]!;
    const inA = fk.benchA[0]!.id;
    const inB = fk.benchB[0]!.id;
    fk = { ...fk, pendingSubsA: [{ outId: takerId, inId: inA }], pendingSubsB: [{ outId: wallOut, inId: inB }] } as GameState;
    const out = tickState(fk, 0.2).state;
    expect(out.ballHolderId).toBe(takerId);
    expect(out.setPiece?.takerId).toBe(takerId);
    expect(holder(out).x).toBeCloseTo(PITCH_LENGTH - 22, 5);
    expect(out.pendingSubsA.map(p => p.outId)).toEqual([takerId]);
    expect(out.players.some(p => p.id === inB)).toBe(true);
    expect(out.setPiece!.wallIds).toContain(inB);
    expect(out.setPiece!.wallIds).not.toContain(wallOut);
  });
});

describe("corners", () => {
  test("box layout, the taker on the flag, cornerAwarded, a set-piece phase", () => {
    const s = buildState();
    const events: unknown[] = [];
    const unsub = gameBus.on("cornerAwarded", e => events.push(e));
    const out = awardCorner(s, "A", { x: PITCH_LENGTH, y: 0 }, -1, "clearance", "save").state;
    unsub();
    expect(events).toHaveLength(1);
    expect(out.setPiece?.type).toBe("corner");
    expect(out.setPiece?.variant).toBe("box");
    const t = holder(out);
    expect(t.team).toBe("A");
    expect({ x: t.x, y: t.y }).toEqual({ x: PITCH_LENGTH, y: 0 });
    const inBox = out.players.filter(p => p.team === "A" && PITCH_LENGTH - p.x <= 16 && p.y > 15 && p.y < 59);
    expect(inBox.length).toBeGreaterThanOrEqual(SP.BOX_ATTACKERS);
    expect(out.setPiecePhase).toMatchObject({ team: "A", kind: "corner" });
    expect(restartHoldsPeriod(out, 2710, 2700)).toBe(true);
  });

  test("the chosen corner taker takes it, the taker crosses or plays short", () => {
    const s = buildState();
    const rb = s.players.find(p => p.team === "A" && p.role === "RB")!;
    const out = awardCorner({ ...s, setPieceTakers: { A: { corners: rb.rosterId } } }, "A", { x: PITCH_LENGTH, y: PITCH_WIDTH }, -1, "clearance", "loose").state;
    expect(out.ballHolderId).toBe(rb.id);
    const t = holder(out);
    const d = decide(t, t, true, false, out.players, null, 0, out.setPiece);
    expect(["cross", "pass"]).toContain(d.type);
  });

  test("a goal straight after the corner counts as a set-piece goal", () => {
    let s = awardCorner(buildState(), "A", { x: PITCH_LENGTH, y: 0 }, -1, "clearance", "save").state;
    const st = holder(s);
    // A header from 6 yards that cannot miss.
    s = {
      ...s,
      setPiece: null,
      ballHolderId: st.id,
      shot: { shooterId: st.id, fromX: PITCH_LENGTH - 6, fromY: 37, toX: PITCH_LENGTH, toY: 37, t: 0.99, xg: 1, header: true },
      players: s.players.filter(p => !(p.team === "B" && p.role === "GK")),
    };
    initStats(s.players.map(p => ({ id: p.id, team: p.team })));
    const goals: unknown[] = [];
    const unsub = gameBus.on("goalScored", e => goals.push(e));
    randomSpy = spyOn(Math, "random").mockReturnValue(0);
    tickState(s, 0.2);
    unsub();
    expect(goals).toHaveLength(1);
    expect(goals[0]).toMatchObject({ team: "A", setPiece: "corner" });
    expect(getTeamStats("A").setPieceGoals).toBe(1);
  });
});

describe("blocked crosses", () => {
  /** Team A LW crossing from `x` yards out on the left, a Team B RB right on him (always blocks). */
  function blocked(distToLine: number): GameState {
    let s = buildState();
    const lw = s.players.find(p => p.team === "A" && p.role === "LW")!;
    const rb = s.players.find(p => p.team === "B" && p.role === "RB")!;
    const x = PITCH_LENGTH - distToLine;
    s = {
      ...s,
      ballHolderId: lw.id,
      players: s.players.map(p => (p.id === lw.id ? { ...p, x, y: 8 } : p.id === rb.id ? { ...p, x: x + 0.5, y: 8 } : p)),
    };
    return startAerialBall(s, "cross", { x: PITCH_LENGTH - 10, y: 37 }, null, () => 0);
  }

  test("a block near the byline can go behind for a corner; further out it is a clearance", () => {
    expect(blocked(4).setPiece?.type).toBe("corner");
    const far = blocked(30);
    expect(far.setPiece).toBeNull();
    expect(far.pass?.kind).toBe("clearance");
  });
});

describe("loose ball over the goal line", () => {
  /** A Team A through ball drifting out over Team B's goal line, with `who` of Team B on it. */
  function outOver(who: "GK" | "CB"): { s: GameState; passerId: number } {
    let s = buildState();
    const passer = s.players.find(p => p.team === "A" && p.role === "CM")!;
    const d = s.players.find(p => p.team === "B" && p.role === who)!;
    s = {
      ...s,
      ballHolderId: passer.id,
      // Everyone else far away.
      players: s.players.map(p => (p.id === d.id ? { ...p, x: PITCH_LENGTH - 0.5, y: 20 } : p.id === passer.id ? p : { ...p, x: 50, y: p.y })),
      looseBall: {
        x: PITCH_LENGTH - 0.1, y: 20, vx: 5, vy: 0, startTime: 0,
        fromPasserId: passer.id, fromTeamLastTouch: "A", intendedRunnerId: null, receiverOffside: false,
      },
    };
    return { s, passerId: passer.id };
  }

  test("an outfield defender on it: corner, and the through ball is not 'lost in race' to the passer's own team", () => {
    const { s } = outOver("CB");
    randomSpy = spyOn(Math, "random").mockReturnValue(0);
    const lost: unknown[] = [];
    const unsub = gameBus.on("throughBallLostInRace", e => lost.push(e));
    const out = tickState(s, 0.2).state;
    unsub();
    expect(out.setPiece?.type).toBe("corner");
    expect(holder(out).team).toBe("A");
    expect(lost).toHaveLength(0);
  });

  test("only the keeper on it: goal kick", () => {
    const { s } = outOver("GK");
    randomSpy = spyOn(Math, "random").mockReturnValue(0);
    const out = tickState(s, 0.2).state;
    expect(out.setPiece?.type).toBe("goal_kick");
  });
});

describe("throw-ins", () => {
  test("a throw-in only reaches teammates within THROW_IN_RANGE", () => {
    let s = buildState();
    const taker = s.players.find(p => p.team === "A" && p.role === "LB")!;
    const near = s.players.find(p => p.team === "A" && p.role === "LW")!;
    s = {
      ...s,
      ballHolderId: taker.id,
      setPiece: { type: "throw_in", takerId: taker.id, countdown: 0, position: { x: 50, y: 0 } },
      players: s.players.map(p => {
        if (p.id === taker.id) return { ...p, x: 50, y: 0 };
        if (p.id === near.id) return { ...p, x: 55, y: 8 };
        if (p.team === "A" && p.role !== "GK") return { ...p, x: 50 + (p.id % 2 ? 30 : -30), y: 50 };
        return p;
      }),
    };
    for (let i = 0; i < 20; i++) {
      const out = tickState(s, 0.2).state;
      if (out.pass) {
        const to = out.players.find(p => p.id === out.pass!.toId)!;
        expect(Math.hypot(to.x - 50, to.y - 0)).toBeLessThanOrEqual(SP.THROW_IN_RANGE + 2);
      }
    }
  });
});

describe("penalties", () => {
  test("the chosen penalty taker takes it", () => {
    const { s, attacker, defender } = foulSituation(PITCH_LENGTH - 10, 37);
    const lb = s.players.find(p => p.team === "A" && p.role === "LB")!;
    const out = foul({ ...s, setPieceTakers: { A: { penalties: lb.rosterId } } }, defender, attacker);
    expect(out.setPiece?.type).toBe("penalty");
    expect(out.setPiece?.takerId).toBe(lb.id);
    expect(out.setPiecePhase).toMatchObject({ team: "A", kind: "penalty" });
  });
});
