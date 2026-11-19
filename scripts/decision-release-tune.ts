/**
 * Release-gate tuning (`decisions.md` → phase 3): collects the holder situations of seeded matches (pN, raw P, the
 * composure roll, metres to goal, open pass options, facing-away widening) and prints the release rate the gate would
 * give for a grid of constants, by raw-P band and by n = 0 / n ≥ 1, next to FM27's live rates.
 *
 *   bun scripts/decision-release-tune.ts [matches=30] [league=premier_league]
 */
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { aiMatchFormation, autoLineupForFormationWithFitness } from "@/Domain/advanceDay/matchSimulationLineups";
import { loadLeagueAt88, pairAt } from "@/../scripts/ai-formation-goals-shared";
import { mulberry32 } from "@/Domain/rng";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";

const matches = Number(process.argv[2] ?? "30");
const league = process.argv[3] ?? "premier_league";
const squads = loadLeagueAt88(league);
const rows: { p: number; pN: number; c: number; d: number; n: number; w: number }[] = [];
const off = gameBus.on("holderMind", (m) => rows.push({ p: m.pressure, pN: m.pN, c: m.rolls.composure, d: m.distM, n: m.openOptions, w: m.widen }));
const realRandom = Math.random;
for (let k = 0; k < matches; k++) {
  const { home, away, date } = pairAt(squads, k);
  const fH = aiMatchFormation(home, away, date).formation;
  const fA = aiMatchFormation(away, home, date).formation;
  Math.random = mulberry32(9000 + k);
  simulateMatch(home, away, fH, fA, autoLineupForFormationWithFitness(home, fH, date), autoLineupForFormationWithFitness(away, fA, date),
    { tactics: { A: { style: "balanced" }, B: { style: "balanced" } } });
  Math.random = realRandom;
}
off();
const band = (p: number) => (p < 10 ? 0 : p < 20 ? 1 : p < 30 ? 2 : p < 40 ? 3 : p < 80 ? 4 : 5);
console.log(`${rows.length} holder decisions; share n=0 ${((100 * rows.filter(r => r.n === 0).length) / rows.length).toFixed(1)}%`);
console.log("FM27 target: P0-9 3%  P20-29 15%  P40-79 ~25%  P80+ 30-35%  n>=1 1-2%  n=0 20%");
for (const K of [4, 6, 8, 12]) for (const W of [1, 3, 6, 12]) {
  const dec = new Array(8).fill(0), rel = new Array(8).fill(0);
  for (const r of rows) {
    const fire = r.pN > 0 && r.pN * 100 - r.c / 2 > (r.d * K * (1 + W * r.n) / 10) * (1 + r.w);
    for (const i of [band(r.p), r.n === 0 ? 6 : 7]) { dec[i]++; if (fire) rel[i]++; }
  }
  const all = rel.slice(0, 6).reduce((a, b) => a + b, 0) / rows.length;
  console.log(`K ${K} W ${W}: all ${(100 * all).toFixed(1)}%  ` + ["P0-9", "P10-19", "P20-29", "P30-39", "P40-79", "P80+", "n=0", "n>=1"]
    .map((nm, i) => `${nm} ${dec[i] ? ((100 * rel[i]) / dec[i]).toFixed(1) : "-"}`).join("  "));
}
process.exit(0);
