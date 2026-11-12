import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { attackHoldsPeriod, createMatchState, tickState } from "@/GameEngine/Domain/gameState";
import { emptySeasonLog } from "@/types/playerTypes";
import type { Squad } from "@/types/playerTypes";
import type { Formation, GameState } from "@/GameEngine/types";
import formation433Json from "@/Data/formations/4-3-3.json";
import { PITCH_LENGTH } from "@/GameEngine/Domain/pitch";

/** The whistle waits for an attack in progress near the goal (tester report, 10.7). */

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
    pass: null,
    shot: null,
    looseBall: null,
  } as GameState;
}

/** The state with `team`'s striker holding the ball `fromGoal` yards from the goal line he attacks. */
function holderAt(team: "A" | "B", fromGoal: number): GameState {
  const base = buildState();
  const st = base.players.find(p => p.team === team && p.role === "ST")!;
  const x = st.attackDir === 1 ? PITCH_LENGTH - fromGoal : fromGoal;
  return { ...base, ballHolderId: st.id, players: base.players.map(p => (p.id === st.id ? { ...p, x, y: 37 } : p)) };
}

describe("the whistle waits for an attack near the goal", () => {
  test("a holder close to the goal he attacks holds the period, for either team, up to the cap", () => {
    for (const team of ["A", "B"] as const) {
      expect(attackHoldsPeriod(holderAt(team, 20), 2701, 2700)).toBe(true);
      expect(attackHoldsPeriod(holderAt(team, 20), 2700 + 46, 2700)).toBe(false);
      expect(attackHoldsPeriod(holderAt(team, 31), 2701, 2700)).toBe(false);
      // Near his OWN goal (a defender on the ball) nothing waits.
      expect(attackHoldsPeriod(holderAt(team, PITCH_LENGTH - 10), 2701, 2700)).toBe(false);
    }
  });

  test("a pass or a loose ball of the attacking side into that zone holds it too; a restart or a shot does not", () => {
    const s = holderAt("A", 45);
    const from = s.players.find(p => p.id === s.ballHolderId)!;
    const goalX = from.attackDir === 1 ? PITCH_LENGTH : 0;
    const toX = goalX - from.attackDir * 12;
    const pass = { fromId: from.id, toId: null, toX, toY: 37, kind: "through", t: 0.3, distance: 30, receiverOffside: false } as unknown as NonNullable<GameState["pass"]>;
    expect(attackHoldsPeriod({ ...s, pass }, 2701, 2700)).toBe(true);
    expect(attackHoldsPeriod({ ...s, pass: { ...pass, toX: goalX - from.attackDir * 50 } }, 2701, 2700)).toBe(false);
    const loose = { x: toX, y: 37, vx: 0, vy: 0, startTime: 0, fromPasserId: from.id, fromTeamLastTouch: "A", intendedRunnerId: null, receiverOffside: false } as unknown as NonNullable<GameState["looseBall"]>;
    expect(attackHoldsPeriod({ ...s, looseBall: loose }, 2701, 2700)).toBe(true);
    // The same loose ball last touched by the defending side (a clearance) is no attack.
    expect(attackHoldsPeriod({ ...s, looseBall: { ...loose, fromTeamLastTouch: "B" } }, 2701, 2700)).toBe(false);
    const near = holderAt("A", 15);
    expect(attackHoldsPeriod({ ...near, setPiece: { type: "throw_in", countdown: 1 } as unknown as GameState["setPiece"] }, 2701, 2700)).toBe(false);
  });

  test("in the tick: the half does not end with the striker through on goal, and ends once the cap passes", () => {
    const s = holderAt("A", 18);
    const end = 2700 + s.extraTimeFirst;
    const at = { ...s, matchTime: end - 0.5 };
    expect(tickState(at, 0.2).state.matchPhase).toBe("firstHalf");
    expect(tickState({ ...at, matchTime: end + 50 }, 0.2).state.matchPhase).toBe("halfTime");
    // In midfield the whistle goes at once.
    expect(tickState({ ...holderAt("A", 60), matchTime: end - 0.5 }, 0.2).state.matchPhase).toBe("halfTime");
  });
});
