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
    // Stage 21 R9: the FM condition curve drains less (DRAIN_SCALE 1) and fades toward its floor, so the load gap at
    // half time is ~3 points, of the order of the side-to-side difference between two identical teams (A vs B ~1).
    // The control is therefore the same side without load in the same seeded match, not the other side.
    const REPLICATES = 4;
    const halfTimeMeanA = (a: Squad, seed: number): number => {
      let atHalf: number | null = null;
      // Compressed clock (`LEGACY_CLOCK_SCALE`) only to keep this mechanism test fast: the code paths are the same (stage 2).
      simulateMatch(a, fresh, undefined, undefined, undefined, undefined, {
        clockScale: LEGACY_CLOCK_SCALE, seed,
        onTick: s => {
          if (atHalf !== null || s.matchPhase !== "halfTime") return;
          const v = s.players.filter(p => p.team === "A" && p.role !== "GK").map(p => p.energy);
          atHalf = v.reduce((x, y) => x + y, 0) / v.length;
        },
      });
      expect(atHalf).not.toBeNull();
      return atHalf!;
    };

    let highTotal = 0;
    let freshTotal = 0;
    for (let i = 0; i < REPLICATES; i++) {
      highTotal += halfTimeMeanA(highLoad, 700 + i);
      freshTotal += halfTimeMeanA(fresh, 700 + i);
    }

    const avgHigh = highTotal / REPLICATES;
    const avgFresh = freshTotal / REPLICATES;
    expect(avgHigh).toBeLessThan(avgFresh - 1.5);
  }, 60_000);
});
