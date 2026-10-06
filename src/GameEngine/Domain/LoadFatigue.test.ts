import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { ensureSeasonLog } from "@/Domain/advanceDay/seasonLog";
import { FITNESS } from "@/Domain/fitness/fitnessConfig";
import type { Squad } from "@/types/playerTypes";

/**
 * Task 3 of `docs/superpowers/archive/2026-09-27-stamina.md` — `seasonLog.load` raises the in-match
 * energy drain (`GamePlayer.drainMultiplier`, consumed by `consumeEnergy` in `RuntimeLineup.ts`).
 * See `docs/superpowers/specs/2026-09-27-stamina-design.md` §1 "Na partida".
 */

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Squad;
}

/** Same roster, same starting fitness — only `load` differs, so `drainMultiplier` is the only lever. */
function withLoad(squad: Squad, load: number): Squad {
  return {
    ...squad,
    players: squad.players.map(p => {
      const withLog = ensureSeasonLog(p);
      return { ...withLog, seasonLog: { ...withLog.seasonLog!, load, fitness: 100 } };
    }),
  };
}

describe("load raises in-match energy cost", () => {
  test("a high-load team ends a headless match with less energy than an identical fresh team", () => {
    const base = loadSquad("33.json");
    const highLoad = withLoad(base, FITNESS.LOAD_HIGH);
    const fresh = withLoad(base, 0);

    // Same underlying squad on both sides (only `seasonLog.load` differs) — pickForRole is
    // deterministic given identical `players` arrays, so both teams start with the exact same
    // starting XI (matched by rosterId). AI substitutions bring on fresh bench legs and would
    // otherwise mask the drain difference by the time the match ends, so we only compare players
    // who were never substituted in on either side.
    const REPLICATES = 6;
    let highTotal = 0;
    let freshTotal = 0;
    let comparedPairs = 0;

    for (let i = 0; i < REPLICATES; i++) {
      const result = simulateMatch(highLoad, fresh);
      const subbedInIds = new Set(result.substitutions.map(s => s.playerInRosterId));
      const stillOriginal = result.players.filter(p => !subbedInIds.has(p.rosterId));
      const highPlayers = stillOriginal.filter(p => p.team === "A");
      const freshByRoster = new Map(
        stillOriginal.filter(p => p.team === "B").map(p => [p.rosterId, p]),
      );

      let sumHigh = 0;
      let sumFresh = 0;
      let n = 0;
      for (const p of highPlayers) {
        const counterpart = freshByRoster.get(p.rosterId);
        if (!counterpart) continue;
        sumHigh += p.energy;
        sumFresh += counterpart.energy;
        n++;
      }
      expect(n).toBeGreaterThan(0);
      highTotal += sumHigh / n;
      freshTotal += sumFresh / n;
      comparedPairs++;
    }

    const avgHigh = highTotal / comparedPairs;
    const avgFresh = freshTotal / comparedPairs;
    // Measured effect is consistently several energy points; a wide margin keeps this from being
    // flaky while still failing if the load multiplier stops being applied.
    expect(avgHigh).toBeLessThan(avgFresh - 2);
  }, 30_000);
});
