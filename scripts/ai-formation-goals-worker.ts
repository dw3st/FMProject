/** Worker for `ai-formation-goals.ts`: full-engine matches of one league, one mode. */
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { aiMatchFormation, autoLineupForFormationWithFitness } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId } from "@/Domain/matchFormations";
import { loadLeagueAt88, pairAt, type Mode, type GoalTotals } from "@/../scripts/ai-formation-goals-shared";

interface Input { league: string; mode: Mode; matches: number; offset: number }

self.onmessage = (e: MessageEvent<Input>) => {
  const { league, mode, matches, offset } = e.data;
  const squads = loadLeagueAt88(league);
  const t: GoalTotals = { n: 0, goals: 0, shots: 0 };
  for (let m = 0; m < matches; m++) {
    const { home, away, date } = pairAt(squads, offset + m);
    const fH = mode === "main" ? formationForSimId("4-3-3") : aiMatchFormation(home, away, date).formation;
    const fA = mode === "main" ? formationForSimId("4-3-3") : aiMatchFormation(away, home, date).formation;
    const r = simulateMatch(home, away, fH, fA,
      autoLineupForFormationWithFitness(home, fH, date), autoLineupForFormationWithFitness(away, fA, date),
      { tactics: { A: { style: "balanced" }, B: { style: "balanced" } } });
    t.n++; t.goals += r.score.A + r.score.B; t.shots += r.teamStats.A.shots + r.teamStats.B.shots;
  }
  postMessage(t);
};
