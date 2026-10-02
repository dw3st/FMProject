import { describe, expect, test, spyOn, afterEach } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { createMatchState, tickState, maybeFoul, bookPlayer, restartHoldsPeriod } from "@/GameEngine/Domain/gameState";
import { TACKLE_COOLDOWN } from "@/GameEngine/Infrastructure/ActionOutcomes";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Squad } from "@/types/playerTypes";
import type { Formation, GameState, GamePlayer } from "@/GameEngine/types";
import formation433Json from "@/Data/formations/4-3-3.json";
import { PITCH_LENGTH } from "@/GameEngine/Domain/pitch";

/** Etapa 12 — fouls, cards and penalties in the full engine (`.claude/rules/game-engine/fouls.md`). */

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

/** Puts the Team A ST (holder) at (x, 37) and a Team B CB right behind him, attacking direction +1. */
function boxSituation(x: number): { s: GameState; attacker: GamePlayer; defender: GamePlayer } {
  let s = buildState();
  const attacker = s.players.find(p => p.team === "A" && p.role === "ST")!;
  const defender = s.players.find(p => p.team === "B" && p.role === "CB")!;
  expect(attacker.attackDir).toBe(1);
  s = {
    ...s,
    ballHolderId: attacker.id,
    players: s.players.map(p =>
      p.id === attacker.id ? { ...p, x, y: 37 } :
      p.id === defender.id ? { ...p, x: x - 1.5, y: 37 } : p),
  };
  return { s, attacker: s.players.find(p => p.id === attacker.id)!, defender: s.players.find(p => p.id === defender.id)! };
}

const always = () => 0;     // every roll succeeds (foul, red first)
const seq = (...v: number[]) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]!; };

let randomSpy: ReturnType<typeof spyOn> | null = null;
afterEach(() => { randomSpy?.mockRestore(); randomSpy = null; });

describe("fouls in the engine", () => {
  test("a foul outside the box gives the fouled team a free kick at the spot, overturning a won tackle", () => {
    const { s, attacker, defender } = boxSituation(60);
    const fouls: unknown[] = [];
    const unsub = gameBus.on("foul", e => fouls.push(e));
    // foul roll 0 (< chance) → foul; card rolls 0.99 → no card.
    const out = maybeFoul(s, defender, attacker, "tackle", true, seq(0, 0.99, 0.99))!;
    unsub();
    expect(out).not.toBeNull();
    expect(fouls).toHaveLength(1);
    expect(out.setPiece?.type).toBe("free_kick");
    expect(out.players.find(p => p.id === out.ballHolderId)!.team).toBe("A");
    expect(out.setPiece?.position).toEqual({ x: 60, y: 37 });
    expect(out.cards).toHaveLength(0);
  });

  test("no foul when the roll misses", () => {
    const { s, attacker, defender } = boxSituation(60);
    expect(maybeFoul(s, defender, attacker, "tackle", false, () => 0.95)).toBeNull();
  });

  test("a foul in the box becomes a penalty, resolved with penaltyChance when the countdown ends", () => {
    const { s, attacker, defender } = boxSituation(PITCH_LENGTH - 10);
    const awarded: unknown[] = [];
    const unsubA = gameBus.on("penaltyAwarded", e => awarded.push(e));
    const out = maybeFoul(s, defender, attacker, "tackle", false, seq(0, 0.99, 0.99))!;
    unsubA();
    expect(out.setPiece?.type).toBe("penalty");
    expect(awarded).toHaveLength(1);
    const taker = out.players.find(p => p.id === out.setPiece!.takerId)!;
    expect(taker.team).toBe("A");
    expect(taker.x).toBeCloseTo(PITCH_LENGTH - 12, 5);

    // Score it: Math.random() 0 → goal.
    randomSpy = spyOn(Math, "random").mockImplementation(() => 0);
    const resolved: Array<{ scored: boolean }> = [];
    const unsubR = gameBus.on("penaltyResolved", e => resolved.push(e));
    let state: GameState = { ...out, setPiece: { ...out.setPiece!, countdown: 0.1 } };
    const r = tickState(state, 0.2);
    unsubR();
    state = r.state;
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.scored).toBe(true);
    expect(r.goalScored).toBe("A");
    expect(state.score.A).toBe(1);
    expect(state.setPiece?.type).toBe("kickoff");
  });

  test("a missed penalty gives the goalkeeper a goal kick", () => {
    const { s, attacker, defender } = boxSituation(PITCH_LENGTH - 10);
    const out = maybeFoul(s, defender, attacker, "tackle", false, seq(0, 0.99, 0.99))!;
    randomSpy = spyOn(Math, "random").mockImplementation(() => 0.9999);
    const r = tickState({ ...out, setPiece: { ...out.setPiece!, countdown: 0.1 } }, 0.2);
    expect(r.state.score.A).toBe(0);
    expect(r.state.setPiece?.type).toBe("goal_kick");
    expect(r.state.players.find(p => p.id === r.state.ballHolderId)!.role).toBe("GK");
  });

  test("a straight red sends the offender off with no substitute — the team plays with 10", () => {
    const { s, attacker, defender } = boxSituation(60);
    const out = maybeFoul(s, defender, attacker, "tackle", false, always)!;
    expect(out.cards.map(c => c.card)).toEqual(["red"]);
    expect(out.players.some(p => p.id === defender.id)).toBe(false);
    expect(out.players.filter(p => p.team === "B")).toHaveLength(10);
    expect(out.subsRemainingB).toBe(5);
    expect(out.substitutions).toHaveLength(0);
  });

  test("a second yellow is a red: two card records, player removed", () => {
    const { s, defender } = boxSituation(60);
    const cards: Array<{ card: string; secondYellow: boolean }> = [];
    const unsub = gameBus.on("card", e => cards.push(e));
    const once = bookPlayer(s, defender, "yellow", 10);
    expect(once.players.some(p => p.id === defender.id)).toBe(true);
    const twice = bookPlayer(once, once.players.find(p => p.id === defender.id)!, "yellow", 70);
    unsub();
    expect(twice.cards.map(c => `${c.card}${c.secondYellow ? "*" : ""}`)).toEqual(["yellow", "yellow", "red*"]);
    expect(cards.map(c => c.card)).toEqual(["yellow", "yellow", "red"]);
    expect(twice.players.some(p => p.id === defender.id)).toBe(false);
  });

  test("a sent-off goalkeeper leaves the team with an emergency keeper", () => {
    const s = buildState();
    const gk = s.players.find(p => p.team === "B" && p.role === "GK")!;
    const out = bookPlayer(s, gk, "red", 30);
    const teamB = out.players.filter(p => p.team === "B");
    expect(teamB).toHaveLength(10);
    const keeper = teamB.find(p => p.role === "GK");
    expect(keeper).toBeDefined();
    expect(keeper!.runtimeStats.withoutBall.gkReflex).toBeGreaterThan(0);
  });

  test("a penalty awarded right before the whistle is taken before half time", () => {
    const { s, attacker, defender } = boxSituation(PITCH_LENGTH - 10);
    const out = maybeFoul({ ...s, extraTimeFirst: 0, matchTime: 2700 - 5 }, defender, attacker, "tackle", false, seq(0, 0.99, 0.99))!;
    expect(out.setPiece?.type).toBe("penalty");
    randomSpy = spyOn(Math, "random").mockImplementation(() => 0);
    const resolved: unknown[] = [];
    const unsub = gameBus.on("penaltyResolved", e => resolved.push(e));
    let state = out;
    for (let i = 0; i < 40 && state.matchPhase === "firstHalf"; i++) state = tickState(state, 0.2).state;
    unsub();
    expect(resolved).toHaveLength(1);
    expect(state.score.A).toBe(1);
    expect(state.matchPhase).toBe("halfTime");
  });

  test("a dangerous free kick still held by its taker delays the whistle; a midfield one does not", () => {
    const n = boxSituation(PITCH_LENGTH - 22);
    const near = maybeFoul(n.s, n.defender, n.attacker, "tackle", false, seq(0, 0.99, 0.99))!;
    expect(near.setPiece?.type).toBe("free_kick");
    expect(restartHoldsPeriod(near, 2701, 2700)).toBe(true);
    expect(restartHoldsPeriod(near, 2700 + 61, 2700)).toBe(false); // capped
    const { s, attacker, defender } = boxSituation(60);
    const mid = maybeFoul(s, defender, attacker, "tackle", false, seq(0, 0.99, 0.99))!;
    expect(mid.setPiece?.type).toBe("free_kick");
    expect(restartHoldsPeriod(mid, 2701, 2700)).toBe(false);
  });

  test("the free-kick taker can't be challenged right after the freeze (tackle cooldown)", () => {
    const { s, attacker, defender } = boxSituation(60);
    const out = maybeFoul({ ...s, tackleCooldown: 0 }, defender, attacker, "dribble", false, seq(0, 0.99, 0.99))!;
    expect(out.setPiece?.type).toBe("free_kick");
    expect(out.tackleCooldown).toBe(TACKLE_COOLDOWN);
    // The freeze doesn't drain it: the cooldown is still full when play restarts.
    const afterFreeze = tickState(out, out.setPiece!.countdown).state;
    expect(afterFreeze.setPiece?.countdown).toBe(0);
    expect(afterFreeze.tackleCooldown).toBe(TACKLE_COOLDOWN);
  });
});
