import { describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { formationForSimId } from "@/Domain/matchFormations";
import { MENTAL_KEYS, withMentalAttributes } from "@/Domain/mental/mental";
import { mulberry32 } from "@/Domain/rng";
import { emptySeasonLog, type PlayerStatsRecord, type Squad } from "@/types/playerTypes";

// Phase 1 of the FM-style decisions (`.claude/rules/game/mental.md`): the engine reads no mental attribute, so a
// match is the same, roll for roll, with or without them on the rosters.
function load(file: string, mental: boolean): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  const squad = JSON.parse(readFileSync(path, "utf8")) as Squad;
  return {
    ...squad,
    players: squad.players.map((p) => {
      const stats = { ...p.stats } as Record<string, number>;
      for (const k of MENTAL_KEYS) delete stats[k];
      const bare = { ...p, stats: stats as unknown as PlayerStatsRecord, seasonLog: { ...emptySeasonLog(), fitness: 90 } };
      return mental ? withMentalAttributes(bare) : bare;
    }),
  };
}

describe("engine identity with the mental keys", () => {
  test("same seeded match", () => {
    const F = formationForSimId("4-3-3");
    const run = (mental: boolean) => {
      const spy = spyOn(Math, "random").mockImplementation(mulberry32(4242));
      try {
        const r = simulateMatch(load("33.json", mental), load("34.json", mental), F, F, undefined, undefined, {
          tactics: { A: { style: "balanced" }, B: { style: "balanced" } },
        });
        return { score: r.score, teamStats: r.teamStats, ratings: r.playerRatings, stats: [...r.playerStats], subs: r.substitutions };
      } finally {
        spy.mockRestore();
      }
    };
    const without = run(false);
    const withM = run(true);
    expect(Object.keys(without.ratings).length).toBeGreaterThan(20);
    expect(withM).toEqual(without);
    expect(run(false)).toEqual(without);
  }, 60_000);
});
