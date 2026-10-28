import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { applyPenaltyOutcome, createMatchState, endCurrentPeriod, maybeFoul, tickState } from "@/GameEngine/Domain/gameState";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { PITCH_LENGTH } from "@/GameEngine/Domain/pitch";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Squad } from "@/types/playerTypes";
import type { Formation, GameState, PenaltyOutcome } from "@/GameEngine/types";
import formation433Json from "@/Data/formations/4-3-3.json";

/** 2D penalties (`docs/superpowers/specs/2026-10-28-penalty-2d-design.md`): the engine holds and takes the answer. */

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  const s = JSON.parse(readFileSync(path, "utf8")) as Squad;
  return { ...s, players: s.players.map(p => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 100 } })) };
}

function buildState(): GameState {
  const f = formation433Json as Formation;
  return {
    ...createMatchState(loadSquad("33.json").players, f, loadSquad("34.json").players, f),
    matchPhase: "firstHalf", presentationCountdown: 0, setPiece: null, penaltyInteractive: ["A"],
  } as GameState;
}

const goal: PenaltyOutcome = { scored: true, result: "goal", chance: 0.75 };
const save: PenaltyOutcome = { scored: false, result: "saved", chance: 0.75 };

/** Ticks until the shootout asks for a kick (or ends). */
function nextKick(s: GameState): GameState {
  for (let i = 0; i < 50 && !s.pendingPenalty && s.matchPhase === "penalties"; i++) s = tickState(s, 0.5).state;
  return s;
}

describe("interactive shootout", () => {
  test("each kick waits for its answer; A scores, B misses: done after B's third kick (3–0, B can reach 2)", () => {
    let s: GameState = { ...buildState(), knockout: true, matchPhase: "extraTimeSecond", score: { A: 1, B: 1 } };
    s = endCurrentPeriod(s);
    expect(s.matchPhase).toBe("penalties");
    expect(s.shootout?.live).toBeTruthy();
    s = nextKick(s);
    expect(s.pendingPenalty?.team).toBe("A");
    // Holding: ticks do not move the shootout.
    expect(tickState(s, 2).state.pendingPenalty).toEqual(s.pendingPenalty);
    let kicks = 0;
    while (s.matchPhase === "penalties" && s.pendingPenalty) {
      s = applyPenaltyOutcome(s, s.pendingPenalty.team === "A" ? goal : save);
      kicks++;
      s = nextKick(s);
    }
    expect(s.matchPhase).toBe("matchEnd");
    expect(kicks).toBe(6);
    expect(s.shootout?.winner).toBe("A");
    expect(s.shootout?.finalScore).toEqual({ A: 3, B: 0 });
  });

  test("level after five goes to sudden death", () => {
    let s: GameState = { ...buildState(), knockout: true, matchPhase: "extraTimeSecond", score: { A: 0, B: 0 } };
    s = nextKick(endCurrentPeriod(s));
    let kicks = 0;
    while (s.matchPhase === "penalties" && s.pendingPenalty) {
      // Both score the first five; in sudden death A misses, B scores.
      const sudden = kicks >= 10;
      s = applyPenaltyOutcome(s, sudden && s.pendingPenalty.team === "A" ? save : goal);
      kicks++;
      s = nextKick(s);
    }
    expect(kicks).toBe(12);
    expect(s.shootout?.winner).toBe("B");
  });
});

describe("interactive penalty in the match", () => {
  test("the clock holds until the answer, then a goal restarts from the centre", () => {
    let s = buildState();
    const attacker = s.players.find(p => p.team === "A" && p.role === "ST")!;
    const defender = s.players.find(p => p.team === "B" && p.role === "CB")!;
    s = {
      ...s, ballHolderId: attacker.id,
      players: s.players.map(p => p.id === attacker.id ? { ...p, x: PITCH_LENGTH - 10, y: 37 } : p.id === defender.id ? { ...p, x: PITCH_LENGTH - 11.5, y: 37 } : p),
    };
    let i = 0;
    const out = maybeFoul(s, s.players.find(p => p.id === defender.id)!, s.players.find(p => p.id === attacker.id)!, "tackle", false, () => [0, 0.99, 0.99][Math.min(i++, 2)]!)!;
    expect(out.setPiece?.type).toBe("penalty");
    let state: GameState = { ...out, setPiece: { ...out.setPiece!, countdown: 0.1 } };
    state = tickState(state, 0.2).state;
    expect(state.pendingPenalty?.kind).toBe("match");
    const t = state.matchTime;
    expect(tickState(state, 3).state.matchTime).toBe(t);
    const resolved: Array<{ scored: boolean }> = [];
    const unsub = gameBus.on("penaltyResolved", e => resolved.push(e));
    state = applyPenaltyOutcome(state, goal);
    unsub();
    expect(resolved[0]?.scored).toBe(true);
    expect(state.score.A).toBe(1);
    expect(state.pendingPenalty).toBeNull();
    expect(state.setPiece?.type).toBe("kickoff");
  });
});
