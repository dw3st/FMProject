/**
 * Cost and reproducibility of the full engine: seeded matches in sequence (AI formations, balanced, fitness 88),
 * ms per match and per tick, and a fingerprint of each match (score, team stats, final positions) so an
 * optimisation can be checked to leave every match identical.
 *
 *   bun scripts/engine-cost.ts [matches=3] [league=premier_league] [--seed 9000] [--clock 1] [--out f.json] [--check f.json]
 *
 * `--clock 18` plays the old compressed clock (comparison only). `--check f.json` compares the fingerprints with a
 * previous `--out` and exits 1 on any difference.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { aiMatchFormation, autoLineupForFormationWithFitness } from "@/Domain/advanceDay/matchSimulationLineups";
import { loadLeagueAt88, pairAt } from "@/../scripts/ai-formation-goals-shared";
import type { GameState } from "@/GameEngine/types";

const args = process.argv.slice(2);
const flag = (f: string, d: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] ?? d : d; };
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1]!.startsWith("--")));
const matches = Number(positional[0] ?? "3");
const league = positional[1] ?? "premier_league";
const seed = Number(flag("--seed", "9000"));
const clock = Number(flag("--clock", "1"));
const out = flag("--out", "");
const check = flag("--check", "");

function fnv(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

const squads = loadLeagueAt88(league);
const rows: { ms: number; cpuMs: number; ticks: number; fp: string; score: string }[] = [];
for (let m = 0; m < matches; m++) {
  const { home, away, date } = pairAt(squads, m);
  const fH = aiMatchFormation(home, away, date).formation;
  const fA = aiMatchFormation(away, home, date).formation;
  const lH = autoLineupForFormationWithFitness(home, fH, date);
  const lA = autoLineupForFormationWithFitness(away, fA, date);
  let ticks = 0; let last: GameState | null = null;
  const t0 = performance.now();
  const c0 = process.cpuUsage();
  const r = simulateMatch(home, away, fH, fA, lH, lA, {
    seed: seed + m,
    ...(clock !== 1 ? { clockScale: clock } : {}),
    tactics: { A: { style: "balanced" }, B: { style: "balanced" } },
    onTick: (s) => { ticks++; last = s; },
  });
  const ms = performance.now() - t0;
  const cu = process.cpuUsage(c0);
  const cpuMs = (cu.user + cu.system) / 1000;
  const pos = (last as GameState | null)?.players.map(p => `${p.id}:${p.x.toFixed(3)},${p.y.toFixed(3)},${p.energy.toFixed(3)}`).join("|") ?? "";
  const fp = fnv(JSON.stringify([r.score, r.teamStats, r.playerRatings]) + pos);
  rows.push({ ms, cpuMs, ticks, fp, score: `${r.score.A}-${r.score.B}` });
  console.error(`match ${m + 1}/${matches}: ${ms.toFixed(0)} ms (cpu ${cpuMs.toFixed(0)}), ${ticks} ticks, ${(ms / ticks).toFixed(3)} ms/tick, ${r.score.A}-${r.score.B}, fp ${fp}`);
}
const msMean = rows.reduce((a, r) => a + r.ms, 0) / matches;
const ticksMean = rows.reduce((a, r) => a + r.ticks, 0) / matches;
const cpuMean = rows.reduce((a, r) => a + r.cpuMs, 0) / matches;
const res = { league, matches, seed, clock, msMean, ticksMean, msPerTick: msMean / ticksMean, cpuMsPerTick: cpuMean / ticksMean, rssMB: process.memoryUsage().rss / 2 ** 20, rows };
console.log(JSON.stringify({ ...res, rows: undefined }, null, 1));
if (out) writeFileSync(out, JSON.stringify(res));
if (check) {
  const prev = JSON.parse(readFileSync(check, "utf8")) as typeof res;
  const diff = rows.map((r, i) => (prev.rows[i] && prev.rows[i]!.fp !== r.fp ? i : -1)).filter(i => i >= 0);
  console.log(diff.length === 0 ? "fingerprints: identical" : `fingerprints differ in matches ${diff.join(", ")}`);
  if (diff.length > 0) process.exit(1);
}
