import { describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { createMatchState, withReferee } from "@/GameEngine/Domain/gameState";
import { mulberry32 } from "@/Domain/rng";
import { emptySeasonLog, type Squad } from "@/types/playerTypes";
import type { Formation } from "@/GameEngine/types";
import formation433Json from "@/Data/formations/4-3-3.json";

/** Referee rigor in the engine (`.claude/rules/game/referees.md`). */

const F433 = formation433Json as Formation;
function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  const squad = JSON.parse(readFileSync(path, "utf8")) as Squad;
  return { ...squad, players: squad.players.map((p) => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 88 } })) };
}
const HOME = loadSquad("33.json");
const AWAY = loadSquad("34.json");
const TACTICS = { A: { style: "balanced" as const }, B: { style: "balanced" as const } };

function seeded<T>(seed: number, f: () => T): T {
  const spy = spyOn(Math, "random").mockImplementation(mulberry32(seed));
  try { return f(); } finally { spy.mockRestore(); }
}
const ref = (strictness: number) => ({ id: "ref_test", name: "Test Referee", country: "England", strictness });

describe("referee in the engine", () => {
  test("withReferee sets and removes the referee", () => {
    const s = createMatchState(HOME.players, F433, AWAY.players, F433);
    expect(withReferee(s, ref(0.5)).referee).toEqual(ref(0.5));
    expect(withReferee(withReferee(s, ref(0.5)), null).referee).toBeUndefined();
  });

  test("s = 0 plays exactly the match without a referee (same random rolls)", () => {
    const plain = seeded(7, () => simulateMatch(HOME, AWAY, F433, F433, undefined, undefined, { tactics: TACTICS }));
    const neutral = seeded(7, () => simulateMatch(HOME, AWAY, F433, F433, undefined, undefined, { tactics: TACTICS, referee: ref(0) }));
    expect(neutral.score).toEqual(plain.score);
    expect(neutral.cards).toEqual(plain.cards);
    expect(neutral.teamStats.A.fouls).toBe(plain.teamStats.A.fouls);
    expect(neutral.teamStats.B.fouls).toBe(plain.teamStats.B.fouls);
  }, 60_000);

  test("a strict referee books more than a lenient one", () => {
    let strict = 0;
    let lenient = 0;
    for (let i = 0; i < 8; i++) {
      const count = (s: number) => {
        const r = seeded(100 + i, () => simulateMatch(HOME, AWAY, F433, F433, undefined, undefined, { tactics: TACTICS, referee: ref(s) }));
        return r.teamStats.A.fouls + r.teamStats.B.fouls + 4 * r.cards.length;
      };
      strict += count(1);
      lenient += count(-1);
    }
    expect(strict).toBeGreaterThan(lenient);
  }, 120_000);
});
