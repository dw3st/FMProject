/** Worker for `kinematics-measure.ts`: seeded full-engine matches of one league (AI formations, balanced, fitness 88). */
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { aiMatchFormation, autoLineupForFormationWithFitness } from "@/Domain/advanceDay/matchSimulationLineups";
import { loadLeagueAt88, pairAt } from "@/../scripts/ai-formation-goals-shared";
import { mulberry32 } from "@/Domain/rng";

interface Input { league: string; matches: number; offset: number; seed: number; overrides?: Record<string, unknown> }

/** Every numeric team stat, summed over both teams and all matches. */
export type Totals = Record<string, number>;

self.onmessage = async (e: MessageEvent<Input>) => {
  const { league, matches, offset, seed, overrides } = e.data;
  // Absent on a checkout without the kinematic layer (baseline runs): nothing to switch.
  const K = (await import("@/GameEngine/Configs/KinematicsConfig").catch(() => null))?.KINEMATICS_CONFIG as Record<string, unknown> | undefined;
  if (K && overrides) Object.assign(K, overrides);
  const squads = loadLeagueAt88(league);
  const t: Totals = { n: 0, goalsSq: 0 };
  const realRandom = Math.random;
  for (let m = 0; m < matches; m++) {
    const { home, away, date } = pairAt(squads, offset + m);
    const fH = aiMatchFormation(home, away, date).formation;
    const fA = aiMatchFormation(away, home, date).formation;
    const lH = autoLineupForFormationWithFitness(home, fH, date);
    const lA = autoLineupForFormationWithFitness(away, fA, date);
    Math.random = mulberry32(seed + offset + m);
    const r = simulateMatch(home, away, fH, fA, lH, lA, { tactics: { A: { style: "balanced" }, B: { style: "balanced" } } });
    Math.random = realRandom;
    t.n!++;
    const g = r.score.A + r.score.B;
    t.goals = (t.goals ?? 0) + g;
    t.goalsSq! += g * g;
    for (const side of [r.teamStats.A, r.teamStats.B] as unknown as Record<string, unknown>[]) {
      for (const [k, v] of Object.entries(side)) if (typeof v === "number" && k !== "goals") t[`s.${k}`] = (t[`s.${k}`] ?? 0) + v;
    }
  }
  postMessage(t);
};
