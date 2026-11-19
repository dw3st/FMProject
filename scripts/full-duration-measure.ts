/**
 * Cost and raw volume of a full-engine match: the 90 physical minutes (default) or `--clock 18` (the compressed
 * clock of before stage 2, `LEGACY_CLOCK_SCALE`). One process, matches in sequence, seeded per match (mulberry32), AI formations, balanced, fitness 88.
 *
 *   bun scripts/full-duration-measure.ts [matches=20] [league=premier_league] [--offset 0] [--clock 1] [--out f.json]
 */
import { writeFileSync } from "node:fs";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { matchMinute, isLivePhase, tickState } from "@/GameEngine/Domain/gameState";
import { aiMatchFormation, autoLineupForFormationWithFitness } from "@/Domain/advanceDay/matchSimulationLineups";
import { loadLeagueAt88, pairAt } from "@/../scripts/ai-formation-goals-shared";
import { mulberry32 } from "@/Domain/rng";
import type { GameState } from "@/GameEngine/types";

const args = process.argv.slice(2);
const flag = (f: string, d: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] ?? d : d; };
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1]!.startsWith("--")));
const matches = Number(positional[0] ?? "20");
const league = positional[1] ?? "premier_league";
const offset = Number(flag("--offset", "0"));
const out = flag("--out", "");
const clock = Number(flag("--clock", "1"));

const KEYS = ["goals", "shots", "passesAttempted", "passesCompleted", "throughBallsAttempted", "crosses", "longBalls",
  "corners", "throwIns", "offsides", "fouls", "interceptions", "tackles", "yellowCards", "freeKicks"] as const;
const MARKS = [0, 15, 30, 45, 60, 75, 90];

const squads = loadLeagueAt88(league);
const totals: Record<string, number> = Object.fromEntries(KEYS.map(k => [k, 0]));
const msList: number[] = [];
const ticksList: number[] = [];
const rssList: number[] = [];
const energy: Record<string, { sum: number; n: number }> = {};
const addE = (k: string, s: GameState) => {
  const ps = s.players; let sum = 0; for (const p of ps) sum += p.energy;
  const e = energy[k] ?? (energy[k] = { sum: 0, n: 0 }); e.sum += sum / ps.length; e.n++;
};
const realRandom = Math.random;
let rssPeak = process.memoryUsage().rss;
for (let m = 0; m < matches; m++) {
  const { home, away, date } = pairAt(squads, offset + m);
  const fH = aiMatchFormation(home, away, date).formation;
  const fA = aiMatchFormation(away, home, date).formation;
  const lH = autoLineupForFormationWithFitness(home, fH, date);
  const lA = autoLineupForFormationWithFitness(away, fA, date);
  Math.random = mulberry32(9000 + offset + m);
  let ticks = 0; let prevPhase = ""; const seen = new Set<string>(); let last: GameState | null = null;
  const t0 = performance.now();
  const r = simulateMatch(home, away, fH, fA, lH, lA, {
    ...(clock !== 1 ? { clockScale: clock } : {}),
    tactics: { A: { style: "balanced" }, B: { style: "balanced" } },
    onTick: (s) => {
      ticks++;
      if (prevPhase === "firstHalf" && s.matchPhase !== "firstHalf" && last) { addE("45 end 1H", last); }
      if (prevPhase !== "secondHalf" && s.matchPhase === "secondHalf") addE("45 start 2H", s);
      if (isLivePhase(s.matchPhase)) {
        const mm = matchMinute(s);
        for (const k of MARKS) if (mm >= k && !seen.has(String(k)) && !(k === 45)) { seen.add(String(k)); addE(String(k), s); }
      }
      if (s.matchPhase === "matchEnd" && prevPhase !== "matchEnd" && last) addE("90 end", last);
      prevPhase = s.matchPhase; last = s;
    },
  });
  const ms = performance.now() - t0;
  Math.random = realRandom;
  msList.push(ms); ticksList.push(ticks);
  const rss = process.memoryUsage().rss; rssList.push(rss); rssPeak = Math.max(rssPeak, rss);
  totals.goals! += r.score.A + r.score.B;
  for (const side of [r.teamStats.A, r.teamStats.B]) for (const k of KEYS) if (k !== "goals") totals[k]! += (side as unknown as Record<string, number>)[k] ?? 0;
  console.error(`match ${m + 1}/${matches}: ${ms.toFixed(0)} ms, ${ticks} ticks, ${r.score.A}-${r.score.B}, rss ${(rss / 2 ** 20).toFixed(0)} MB`);
}
void tickState;
const sorted = [...msList].sort((a, b) => a - b);
const mean = msList.reduce((a, b) => a + b, 0) / matches;
const p90 = sorted[Math.min(sorted.length - 1, Math.floor(0.9 * sorted.length))]!;
const ticksMean = ticksList.reduce((a, b) => a + b, 0) / matches;
const res = {
  mode: clock === 1 ? "full" : `clock ${clock}`, league, matches, msMean: mean, msP90: p90, ticksMean, msPerTick: mean / ticksMean,
  rssPeakMB: rssPeak / 2 ** 20, rssEndMB: rssList.at(-1)! / 2 ** 20,
  perMatch: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v / matches])),
  energy: Object.fromEntries(Object.entries(energy).map(([k, v]) => [k, v.sum / v.n])),
};
console.log(JSON.stringify(res, null, 1));
if (out) writeFileSync(out, JSON.stringify(res));
