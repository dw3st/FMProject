import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { createMatchState, endVarReview, foulCheck, tickState } from "@/GameEngine/Domain/gameState";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { getTeamStats, initStats } from "@/GameEngine/Domain/Statistics";
import { mulberry32 } from "@/Domain/rng";
import { emptySeasonLog, type Squad } from "@/types/playerTypes";
import type { Formation, GameState, GamePlayer } from "@/GameEngine/types";
import formation433Json from "@/Data/formations/4-3-3.json";
import { PITCH_LENGTH } from "@/GameEngine/Domain/pitch";
import type { RefereeErrorKind } from "@/GameEngine/Domain/Var";

/** Referee errors and the VAR in the engine (`.claude/rules/game/var.md`). */

const F433 = formation433Json as Formation;
function loadSquad(file: string, fitness = 100): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  const s = JSON.parse(readFileSync(path, "utf8")) as Squad;
  return { ...s, players: s.players.map((p) => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness } })) };
}
const HOME = loadSquad("33.json");
const AWAY = loadSquad("34.json");

const referee = (extra: { quality?: number; var?: boolean } = {}) => ({ id: "ref_t", name: "Ref", country: "England", strictness: 0, ...extra });

function boxSituation(x: number, opts: { var?: boolean; forced?: RefereeErrorKind } = {}): { s: GameState; attacker: GamePlayer; defender: GamePlayer } {
  let s: GameState = {
    ...createMatchState(HOME.players, F433, AWAY.players, F433),
    matchPhase: "firstHalf", presentationCountdown: 0, setPiece: null,
    referee: referee({ quality: 50, ...(opts.var ? { var: true } : {}) }),
    forcedRefError: opts.forced ?? null,
  } as GameState;
  const attacker = s.players.find((p) => p.team === "A" && p.role === "ST")!;
  const defender = s.players.find((p) => p.team === "B" && p.role === "CB")!;
  s = {
    ...s,
    ballHolderId: attacker.id,
    players: s.players.map((p) => (p.id === attacker.id ? { ...p, x, y: 37 } : p.id === defender.id ? { ...p, x: x - 1.5, y: 37 } : p)),
  };
  return { s, attacker: s.players.find((p) => p.id === attacker.id)!, defender: s.players.find((p) => p.id === defender.id)! };
}

const seq = (...v: number[]) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]!; };
/** Runs the VAR check of `s` to its end. */
const finishReview = (s: GameState) => {
  let st = s;
  for (let i = 0; i < 40 && st.varReview; i++) st = tickState(st, 0.2).state;
  return st;
};

let randomSpy: ReturnType<typeof spyOn> | null = null;
afterEach(() => { randomSpy?.mockRestore(); randomSpy = null; });

describe("referee errors in the engine", () => {
  test("no referee quality: the match is the one before (same random rolls)", () => {
    const run = (ref?: ReturnType<typeof referee>) => {
      const spy = spyOn(Math, "random").mockImplementation(mulberry32(21));
      try {
        return simulateMatch(HOME, AWAY, F433, F433, undefined, undefined, {
          tactics: { A: { style: "balanced" }, B: { style: "balanced" } }, ...(ref ? { referee: ref } : {}),
        });
      } finally { spy.mockRestore(); }
    };
    const plain = run();
    const noQuality = run(referee({ var: true }));
    expect(noQuality.score).toEqual(plain.score);
    expect(noQuality.cards).toEqual(plain.cards);
    expect(noQuality.teamStats.A.passesAttempted).toBe(plain.teamStats.A.passesAttempted);
    expect(noQuality.teamStats.A.refereeErrors + noQuality.teamStats.B.refereeErrors).toBe(0);
    expect(noQuality.teamStats.A.varReviews + noQuality.teamStats.B.varReviews).toBe(0);
  }, 60_000);

  test("phantom penalty: a clean challenge in the box is whistled; no VAR keeps it", () => {
    const { s, attacker, defender } = boxSituation(PITCH_LENGTH - 10, { forced: "phantom_penalty" });
    const out = foulCheck(s, defender, attacker, "tackle", false, () => 0.99).foul!;
    expect(out.setPiece?.type).toBe("penalty");
    expect(out.cards).toHaveLength(0);
    expect(out.refereeErrors?.map((e) => e.kind)).toEqual(["phantom_penalty"]);
    expect(out.varReview ?? null).toBeNull();
    expect(out.forcedRefError).toBeNull();
  });

  test("phantom penalty with VAR: checked, ruled out, free kick to the defending side", () => {
    const { s, attacker, defender } = boxSituation(PITCH_LENGTH - 10, { forced: "phantom_penalty", var: true });
    initStats(s.players.map((p) => ({ id: p.id, team: p.team })));
    const reviews: Array<{ outcome: string; kind: string }> = [];
    const unsub = gameBus.on("varReview", (e) => reviews.push(e));
    const out = foulCheck(s, defender, attacker, "tackle", false, () => 0.99).foul!;
    expect(out.varReview?.kind).toBe("penalty");
    const after = finishReview(out);
    unsub();
    expect(reviews).toEqual([expect.objectContaining({ kind: "penalty", outcome: "overturned" })]);
    expect(after.setPiece?.type).toBe("free_kick");
    expect(after.players.find((p) => p.id === after.ballHolderId)!.team).toBe("B");
    expect(getTeamStats("A").penaltiesAwarded).toBe(0);
    expect(getTeamStats("A").varOverturned).toBe(1);
  });

  test("missed penalty: no whistle, the error is logged; with VAR the penalty is given after a check", () => {
    const a = boxSituation(PITCH_LENGTH - 10, { forced: "missed_penalty" });
    const r = foulCheck(a.s, a.defender, a.attacker, "tackle", false, seq(0, 0.99, 0.99));
    expect(r.foul).toBeNull();
    expect(r.state.refereeErrors?.[0]).toEqual(expect.objectContaining({ kind: "missed_penalty", team: "A", corrected: false }));
    const b = boxSituation(PITCH_LENGTH - 10, { forced: "missed_penalty", var: true });
    const out = foulCheck(b.s, b.defender, b.attacker, "tackle", false, seq(0, 0.99, 0.99)).foul!;
    expect(out.setPiece?.type).toBe("penalty");
    expect(out.varReview?.kind).toBe("missed_penalty");
    expect(finishReview(out).setPiece?.type).toBe("penalty");
  });

  test("wrong red: a yellow shown as red; with VAR it stays a yellow", () => {
    const a = boxSituation(60, { forced: "wrong_red" });
    const out = foulCheck(a.s, a.defender, a.attacker, "tackle", false, seq(0, 0.99, 0)).foul!;
    expect(out.cards.map((c) => c.card)).toEqual(["red"]);
    expect(out.players.some((p) => p.id === a.defender.id)).toBe(false);
    const b = boxSituation(60, { forced: "wrong_red", var: true });
    const fixed = foulCheck(b.s, b.defender, b.attacker, "tackle", false, seq(0, 0.99, 0)).foul!;
    expect(fixed.cards.map((c) => c.card)).toEqual(["yellow"]);
    expect(fixed.varReview?.outcome).toBe("overturned");
  });

  test("missed red: a straight red shown as yellow; with VAR the red is given", () => {
    const a = boxSituation(60, { forced: "missed_red" });
    const out = foulCheck(a.s, a.defender, a.attacker, "tackle", false, seq(0, 0, 0)).foul!;
    expect(out.cards.map((c) => c.card)).toEqual(["yellow"]);
    const b = boxSituation(60, { forced: "missed_red", var: true });
    const fixed = foulCheck(b.s, b.defender, b.attacker, "tackle", false, seq(0, 0, 0)).foul!;
    expect(fixed.cards.map((c) => c.card)).toEqual(["red"]);
    expect(fixed.varReview?.kind).toBe("missed_red");
  });

  test("missed offside: play goes on; a goal from that move is ruled out by the VAR", () => {
    const { s: base, attacker } = boxSituation(PITCH_LENGTH - 20, { forced: "missed_offside", var: true });
    const passer = base.players.find((p) => p.team === "A" && p.role === "CM")!;
    // A pass to the offside striker about to arrive.
    let s: GameState = {
      ...base,
      ballHolderId: passer.id,
      pass: { fromId: passer.id, toId: attacker.id, toX: attacker.x, toY: attacker.y, kind: "short", t: 0.999, distance: 20, receiverOffside: true, intendedRunnerId: null } as GameState["pass"],
    };
    initStats(s.players.map((p) => ({ id: p.id, team: p.team })));
    s = tickState(s, 0.05).state;
    expect(s.setPiece?.type ?? null).not.toBe("offside_fk");
    expect(s.missedOffside?.playerId).toBe(attacker.id);
    expect(s.refereeErrors?.[0]?.kind).toBe("missed_offside");

    // The striker scores straight away.
    const st = s.players.find((p) => p.id === attacker.id)!;
    s = { ...s, pass: null, ballHolderId: st.id, shot: { shooterId: st.id, fromX: st.x, fromY: 37, toX: PITCH_LENGTH, toY: 37, t: 0.99, xg: 0.9 } };
    randomSpy = spyOn(Math, "random").mockImplementation(() => 0);
    const disallowed: unknown[] = [];
    const unsub = gameBus.on("goalDisallowed", (e) => disallowed.push(e));
    const r = tickState(s, 0.2);
    expect(r.goalScored).toBe("A");
    expect(r.state.score.A).toBe(1);
    expect(r.state.varReview?.kind).toBe("goal");
    const after = finishReview(r.state);
    unsub();
    expect(after.score.A).toBe(0);
    expect(disallowed).toHaveLength(1);
    expect(after.setPiece?.type).toBe("offside_fk");
    expect(getTeamStats("A").goals).toBe(0);
    expect(after.refereeErrors?.[0]?.corrected).toBe(true);
  });

  test("endVarReview without a review is a no-op", () => {
    const { s } = boxSituation(60);
    expect(endVarReview(s)).toBe(s);
  });
});
