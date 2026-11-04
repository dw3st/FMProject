import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_SIM_FORMATION_ID, formationForSimId } from "@/Domain/matchFormations";
import { mulberry32 } from "@/Domain/rng";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { emptySeasonLog, type Squad } from "@/types/playerTypes";

/** Throw-ins from the touchline (`.claude/rules/game-engine/set-pieces-play.md` → "Laterais"). */
const load = (f: string): Squad => {
  const s = JSON.parse(readFileSync(fileURLToPath(new URL(`../../example_data/squads/premier_league/${f}`, import.meta.url)), "utf8")) as Squad;
  return { ...s, players: s.players.map((p) => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 88, load: 0 } })) };
};

describe("throw-ins", () => {
  let spy: ReturnType<typeof spyOn> | null = null;
  afterEach(() => { spy?.mockRestore(); spy = null; });

  test("a match has throw-ins, taken by the team with the restart at the touchline", () => {
    spy = spyOn(Math, "random").mockImplementation(mulberry32(5));
    const f = formationForSimId(DEFAULT_SIM_FORMATION_ID);
    let seen = 0;
    let last: unknown = null;
    const m = simulateMatch(load("40.json"), load("33.json"), f, f, undefined, undefined, {
      tactics: { A: { style: "balanced" }, B: { style: "balanced" } },
      onTick: (s) => {
        if (s.setPiece?.type !== "throw_in" || s.setPiece === last) return;
        if (last && (last as { takerId: number }).takerId === s.setPiece.takerId) return;
        last = s.setPiece;
        seen++;
        expect(s.ballHolderId).toBe(s.setPiece.takerId);
        const y = s.setPiece.position?.y ?? -1;
        expect(y === 0 || y >= 73).toBe(true);
      },
    });
    expect(m.teamStats.A.throwIns + m.teamStats.B.throwIns).toBeGreaterThan(0);
    expect(seen).toBeGreaterThan(0);
  }, 30_000);
});
