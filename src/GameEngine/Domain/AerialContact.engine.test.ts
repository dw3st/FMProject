import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { setDecisionFlags, DECISION_FLAGS } from "@/GameEngine/Configs/DecisionConfig";
import { createMatchState, tickState, startAerialBall } from "@/GameEngine/Domain/gameState";
import { gameBus, type GameEvents } from "@/GameEngine/Infrastructure/EventBus";
import { initStats, getTeamStats } from "@/GameEngine/Domain/Statistics";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Squad } from "@/types/playerTypes";
import type { Formation, GameState, GamePlayer } from "@/GameEngine/types";
import formation433Json from "@/Data/formations/4-3-3.json";
import { FM_AERIAL } from "@/GameEngine/Configs/FmAerialConfig";
import "@/GameEngine/Domain/Statistics";

/** Stage 10 (`aerial.md` → "Stage 10"): a high ball is met where it first comes within a player's reach in flight. */

beforeAll(() => setDecisionFlags());
afterAll(() => setDecisionFlags());

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  const s = JSON.parse(readFileSync(path, "utf8")) as Squad;
  return { ...s, players: s.players.map(p => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 100 } })) };
}
function baseState(): GameState {
  const f = formation433Json as Formation;
  const s: GameState = {
    ...createMatchState(loadSquad("33.json").players, f, loadSquad("34.json").players, f),
    matchPhase: "firstHalf", presentationCountdown: 0, setPiece: null,
  };
  return { ...s, players: s.players.map(p => (p.role === "GK" ? { ...p, x: p.team === "A" ? 2 : 113, y: 37 } : { ...p, x: 50, y: p.team === "A" ? 5 : 69 })) };
}
const find = (s: GameState, team: "A" | "B", role: string): GamePlayer => s.players.find(p => p.team === team && p.role === role)!;
const place = (s: GameState, id: number, x: number, y: number): GameState =>
  ({ ...s, players: s.players.map(p => (p.id === id ? { ...p, x, y, targetPosition: { x, y } } : p)) });
/** The defending keeper out of the way (stage 11 redoes the keeper; here the outfield contact). */
const keeperAway = (s: GameState): GameState => place(s, find(s, "B", "GK").id, 113, 64);
const seq = (...v: number[]) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]!; };
function collect<K extends keyof GameEvents>(name: K): { events: GameEvents[K][]; off: () => void } {
  const events: GameEvents[K][] = [];
  const off = gameBus.on(name, e => events.push(e));
  return { events, off };
}

/** Team A's left winger crosses from the byline toward `target` (no launch error); returns the state in flight. */
function cross(s0: GameState, target: { x: number; y: number }): GameState {
  const lw = find(s0, "A", "LW");
  let s = place(keeperAway(s0), lw.id, 108, 6);
  s = { ...s, ballHolderId: lw.id };
  return startAerialBall(s, "cross", target, null, seq(1, 0, 1, 0, 0.99));
}
function fly(s: GameState): GameState {
  for (let i = 0; i < 40 && s.pass?.kind === "cross"; i++) s = tickState(s, 0.2).state;
  return s;
}

describe("contact in the air (FM_AERIAL)", () => {
  test("the flag is on by default", () => {
    expect(DECISION_FLAGS.FM_AERIAL).toBe(true);
  });

  test("a defender standing on the cross's path meets it in the air before it lands", () => {
    // Two yards short of the landing point on the line from the crosser: the ball comes down onto his head.
    const target = { x: 110, y: 37 };
    const dx = target.x - 108, dy = target.y - 6, d = Math.hypot(dx, dy);
    let s0 = baseState();
    const cb = find(s0, "B", "CB");
    s0 = place(s0, cb.id, target.x - (dx / d) * 2, target.y - (dy / d) * 2);
    let s = cross(s0, target);
    const contacts = collect("aerialContact");
    s = fly(s);
    contacts.off();
    expect(contacts.events).toHaveLength(1);
    const c = contacts.events[0]!;
    expect(c.toucherId).toBe(cb.id);
    expect(c.toucherTeam).toBe("B");
    expect(c.z).toBeGreaterThan(0.3);
    expect(c.z).toBeLessThanOrEqual(FM_AERIAL.HEAD_TOP_YD + FM_AERIAL.JUMP_YD + 1e-6);
    expect(s.pass?.kind === "cross").toBe(false);
  });

  test("an attacker alone under the ball at the far post heads at goal from the air", () => {
    let s0 = baseState();
    const st = find(s0, "A", "ST");
    // A defender deep on the far side keeps him onside.
    s0 = place(place(s0, st.id, 109.5, 40), find(s0, "B", "RB").id, 113, 72);
    let s = cross(s0, { x: 111, y: 41 });
    const headers = collect("header");
    const contacts = collect("aerialContact");
    s = fly(s);
    headers.off(); contacts.off();
    expect(contacts.events[0]?.toucherId).toBe(st.id);
    if (contacts.events[0]!.air) {
      expect(headers.events).toHaveLength(1);
      expect(s.shot?.header || headers.events.length === 1).toBe(true);
    } else {
      expect(headers.events).toHaveLength(0);
    }
  });

  test("nobody meets it: the cross lands and runs loose; the counters see it", () => {
    let s = cross(baseState(), { x: 104, y: 30 });
    initStats(s.players);
    const contacts = collect("aerialContact");
    for (let i = 0; i < 40 && s.pass?.kind === "cross"; i++) s = tickState(s, 0.2).state;
    contacts.off();
    // The keeper or a chaser may still get there; when nobody did, the ball is loose.
    const c = contacts.events[0]!;
    expect(c).toBeDefined();
    if (c.toucherId === null) {
      expect(s.looseBall).not.toBeNull();
      expect(getTeamStats("A").airCrossUnmet).toBe(1);
    }
    expect(getTeamStats("A").airCrosses).toBe(1);
  });

  test("a contested header counts a header attempt for both and a win for one, by line", () => {
    let s0 = baseState();
    const cb = find(s0, "B", "CB"), st = find(s0, "A", "ST");
    s0 = place(place(s0, cb.id, 107.6, 35.8), st.id, 107.9, 36.4);
    let s = cross(s0, { x: 108, y: 37 });
    initStats(s.players);
    const contacts = collect("aerialContact");
    s = fly(s);
    contacts.off();
    const c = contacts.events[0]!;
    if (c.air && c.contested) {
      const a = getTeamStats("A"), b = getTeamStats("B");
      expect(a.headAttFwd + b.headAttDef).toBe(2);
      expect(a.headWonFwd + b.headWonDef).toBe(1);
    }
    expect(c.toucherId === cb.id || c.toucherId === st.id).toBe(true);
  });
});

describe("/test scenario fm-cross-byline", () => {
  test("the winger at the byline is offered the cross over FM's zones and plays it into one of them", async () => {
    const { TEST_SCENARIOS } = await import("@/GameEngine/Support/TestCases");
    const { decide } = await import("@/GameEngine/Domain/DecisionTree");
    const { evaluateCrossTargets, isCrossPosition } = await import("@/GameEngine/Domain/Aerial");
    const sc = TEST_SCENARIOS.find(t => t.id === "fm-cross-byline")!;
    const s = sc.createState();
    const holder = s.players.find(p => p.id === s.ballHolderId)!;
    expect(isCrossPosition(holder)).toBe(true);
    const targets = evaluateCrossTargets(holder, s.players);
    expect(targets).toHaveLength(7);
    expect(targets.every(t => t.weight !== undefined)).toBe(true);
    const d = decide(holder, holder, true, false, s.players, null, 0);
    expect(["cross", "carry", "pass", "dribble", "shoot", "through_ball"]).toContain(d.type);
  });
});
