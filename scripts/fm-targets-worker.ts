/** Worker for `fm-targets.ts`: seeded full-engine matches of one league with the FM target collector on every tick. */
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { aiMatchFormation, autoLineupForFormationWithFitness } from "@/Domain/advanceDay/matchSimulationLineups";
import { loadLeagueAt88, pairAt } from "@/../scripts/ai-formation-goals-shared";
import { mulberry32 } from "@/Domain/rng";
import { emptyFmTargets, fmTargetCollector, type FmTargetTotals } from "@/lab/fmTargets";

interface Input { league: string; matches: number; offset: number; seed: number }
export interface FmWorkerOut { fm: FmTargetTotals; world: Record<string, number>; ms: number }

const WORLD_KEYS = ["goals", "shots", "xg", "passesAttempted", "passesCompleted", "tackles", "fouls", "interceptions"] as const;

self.onmessage = (e: MessageEvent<Input>) => {
  const { league, matches, offset, seed } = e.data;
  const squads = loadLeagueAt88(league);
  const fm = emptyFmTargets();
  const world: Record<string, number> = Object.fromEntries(WORLD_KEYS.map(k => [k, 0]));
  let ms = 0;
  const realRandom = Math.random;
  for (let m = 0; m < matches; m++) {
    const { home, away, date } = pairAt(squads, offset + m);
    const fH = aiMatchFormation(home, away, date).formation;
    const fA = aiMatchFormation(away, home, date).formation;
    const lH = autoLineupForFormationWithFitness(home, fH, date);
    const lA = autoLineupForFormationWithFitness(away, fA, date);
    const col = fmTargetCollector(fm);
    Math.random = mulberry32(seed + offset + m);
    const t0 = performance.now();
    const r = simulateMatch(home, away, fH, fA, lH, lA, { tactics: { A: { style: "balanced" }, B: { style: "balanced" } }, onTick: col.tick });
    ms += performance.now() - t0;
    Math.random = realRandom;
    col.finish();
    world.goals! += r.score.A + r.score.B;
    for (const side of [r.teamStats.A, r.teamStats.B]) {
      for (const k of WORLD_KEYS) if (k !== "goals") world[k]! += (side as unknown as Record<string, number>)[k] ?? 0;
    }
  }
  postMessage({ fm, world, ms } satisfies FmWorkerOut);
};
