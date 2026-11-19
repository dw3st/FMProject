import { LEGACY_CLOCK_SCALE } from "@/GameEngine/Domain/gameState";
import { describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { simulateMatch, DEFAULT_FORMATION } from "@/GameEngine/Domain/SimulateMatch";
import { createMatchState, tickState } from "@/GameEngine/Domain/gameState";
import { loadMatchRng, matchRandom } from "@/GameEngine/Infrastructure/MatchRng";
import { mulberry32 } from "@/Domain/rng";
import { emptySeasonLog, type Squad } from "@/types/playerTypes";
import type { GameState } from "@/GameEngine/types";

/** Seeded match generator (engine rebuild stage 0): same seed, same match; no `Math.random` in a seeded match. */

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  const squad = JSON.parse(readFileSync(path, "utf8")) as Squad;
  return { ...squad, players: squad.players.map((p) => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 88, load: 0 } })) };
}
const A = loadSquad("33.json");
const B = loadSquad("34.json");
// Compressed clock (`LEGACY_CLOCK_SCALE`) only to keep the three matches fast: the generator path is the same (stage 2).
const play = (seed: number) => simulateMatch(A, B, DEFAULT_FORMATION, DEFAULT_FORMATION, [], [], { seed, clockScale: LEGACY_CLOCK_SCALE });
const fingerprint = (r: ReturnType<typeof play>) => ({
  score: r.score,
  shots: [r.teamStats.A.shots, r.teamStats.B.shots],
  passes: [r.teamStats.A.passesCompleted, r.teamStats.B.passesCompleted],
  fouls: [r.teamStats.A.fouls, r.teamStats.B.fouls],
  ratings: r.playerRatings,
});

describe("match generator", () => {
  test("mulberry32, the same stream as @/Domain/rng", () => {
    loadMatchRng(1234);
    const ref = mulberry32(1234);
    for (let i = 0; i < 50; i++) expect(matchRandom()).toBe(ref());
  });

  test("the same seed plays the same match, another seed another one", () => {
    const a = play(42);
    const b = play(42);
    expect(a.seed).toBe(42);
    expect(fingerprint(b)).toEqual(fingerprint(a));
    const c = play(43);
    expect(fingerprint(c)).not.toEqual(fingerprint(a));
  }, 60_000);

  test("a seeded match never calls Math.random", () => {
    const spy = spyOn(Math, "random");
    try {
      play(7);
      expect(spy).toHaveBeenCalledTimes(0);
    } finally {
      spy.mockRestore();
    }
  }, 30_000);

  test("draws of another match between ticks do not leak into this one", () => {
    const start = (): GameState => ({ ...createMatchState(A.players, DEFAULT_FORMATION, B.players, DEFAULT_FORMATION, undefined, undefined, {}, 99), matchPhase: "firstHalf" as const, presentationCountdown: 0 });
    let x = start();
    for (let i = 0; i < 250; i++) {
      x = tickState(x, 0.2).state;
      loadMatchRng(i * 7919);
      matchRandom();
    }
    let y = start();
    for (let i = 0; i < 250; i++) y = tickState(y, 0.2).state;
    expect(y.rng).toBe(x.rng);
    expect(y.score).toEqual(x.score);
    expect(y.players.map(p => [p.x, p.y])).toEqual(x.players.map(p => [p.x, p.y]));
  }, 30_000);
});
