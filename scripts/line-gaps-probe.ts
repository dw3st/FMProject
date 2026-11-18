/**
 * Back-line gaps probe (defensive cohesion): adjacent lateral gaps between the defending side's
 * back-liners (CB/LB/RB/LWB/RWB within COHESION.LINE_DEPTH of each other), per live tick with the
 * ball held, over full-engine matches (AI formations, seeded).
 *   bun scripts/line-gaps-probe.ts [matches=20] [league=premier_league]
 *   COHESION_OVERRIDES='{"ENABLED":false}' to read the engine before the cohesion.
 */
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { isLivePhase } from "@/GameEngine/Domain/gameState";
import { aiMatchFormation, autoLineupForFormationWithFitness } from "@/Domain/advanceDay/matchSimulationLineups";
import { loadLeagueAt88, pairAt } from "@/../scripts/ai-formation-goals-shared";
import { COHESION, COHESION_LINE_ROLES } from "@/GameEngine/Configs/CohesionConfig";
import { mulberry32 } from "@/Domain/rng";

if (process.env.COHESION_OVERRIDES) Object.assign(COHESION, JSON.parse(process.env.COHESION_OVERRIDES));
const n = Number(process.argv[2] ?? 20);
const squads = loadLeagueAt88(process.argv[3] ?? "premier_league");
const hist = new Array(12).fill(0); // 0-3,3-6,...,33+
let gaps = 0, sum = 0, maxSum = 0, ticks = 0;
for (let m = 0; m < n; m++) {
  const { home, away, date } = pairAt(squads, m);
  Math.random = mulberry32(90_000 + m);
  const fH = aiMatchFormation(home, away, date).formation, fA = aiMatchFormation(away, home, date).formation;
  simulateMatch(home, away, fH, fA, autoLineupForFormationWithFitness(home, fH, date), autoLineupForFormationWithFitness(away, fA, date), {
    tactics: { A: { style: "balanced" }, B: { style: "balanced" } },
    onTick: (s) => {
      if (!isLivePhase(s.matchPhase) || s.setPiece || s.pass || s.looseBall || s.shot) return;
      const h = s.players.find(p => p.id === s.ballHolderId); if (!h) return;
      const line = s.players.filter(p => p.team !== h.team && COHESION_LINE_ROLES.has(p.role)).sort((a, b) => a.y - b.y);
      let mx = 0;
      for (let i = 1; i < line.length; i++) {
        if (Math.abs(line[i]!.x - line[i - 1]!.x) > COHESION.LINE_DEPTH) continue;
        const g = line[i]!.y - line[i - 1]!.y;
        gaps++; sum += g; hist[Math.min(11, Math.floor(g / 3))]++; if (g > mx) mx = g;
      }
      ticks++; maxSum += mx;
    },
  });
}
console.log(`ticks ${ticks} · gaps ${gaps} · mean gap ${(sum / gaps).toFixed(2)} yd · mean widest gap ${(maxSum / ticks).toFixed(2)} yd`);
console.log(`hist (3-yd bins): ${hist.map((v, i) => `${i * 3}:${(100 * v / gaps).toFixed(1)}%`).join(" ")}`);
