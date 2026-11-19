import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { LEGACY_CLOCK_SCALE } from "@/GameEngine/Domain/gameState";
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
    // Stage 14: the AI makes 3–4 changes from 55' (FM), so the comparison is read at half time, before any change:
    // the mean outfield condition of each side when the first half ends.
    const REPLICATES = 4;
    let highTotal = 0;
    let freshTotal = 0;
    let comparedPairs = 0;

    for (let i = 0; i < REPLICATES; i++) {
      let atHalf: { A: number; B: number } | null = null;
      // Compressed clock (`LEGACY_CLOCK_SCALE`) only to keep this mechanism test fast: the code paths are the same (stage 2).
      simulateMatch(highLoad, fresh, undefined, undefined, undefined, undefined, {
        clockScale: LEGACY_CLOCK_SCALE, seed: 700 + i,
        onTick: s => {
          if (atHalf || s.matchPhase !== "halfTime") return;
          const mean = (t: "A" | "B") => {
            const v = s.players.filter(p => p.team === t && p.role !== "GK").map(p => p.energy);
            return v.reduce((a, b) => a + b, 0) / v.length;
          };
          atHalf = { A: mean("A"), B: mean("B") };
        },
      });
      expect(atHalf).not.toBeNull();
      highTotal += atHalf!.A;
      freshTotal += atHalf!.B;
      comparedPairs++;
    }

    const avgHigh = highTotal / comparedPairs;
    const avgFresh = freshTotal / comparedPairs;
    // Measured effect is consistently several energy points; a wide margin keeps this from being
    // flaky while still failing if the load multiplier stops being applied.
    expect(avgHigh).toBeLessThan(avgFresh - 2);
  }, 30_000);
});
