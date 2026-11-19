/**
 * Kinematics A/B (`.claude/rules/game-engine/kinematics.md`): full-engine matches with `Math.random` seeded per match,
 * AI formations, balanced style, fitness 88. Prints per-match totals (both teams) and writes them to `--out`.
 *
 *   bun scripts/kinematics-measure.ts [--matches 400] [--leagues premier_league,of_championship] [--chunks 2 (per league)]
 *        [--seed 5000] [--off] [--set '{"ACCEL_SCALE":1.2}'] [--out file.json] [--compare base.json]
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { Totals } from "@/../scripts/kinematics-measure-worker";

const args = process.argv.slice(2);
const arg = (f: string, d: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] ?? d : d; };
const matches = Number(arg("--matches", "400"));
const leagues = arg("--leagues", "premier_league,of_championship").split(",");
const chunks = Number(arg("--chunks", "2"));
const seed = Number(arg("--seed", "5000"));
const out = arg("--out", "");
const compare = arg("--compare", "");
const overrides: Record<string, unknown> = { ...(args.includes("--off") ? { ENABLED: false } : {}), ...JSON.parse(arg("--set", "{}")) };

const WORKER = new URL("./kinematics-measure-worker.ts", import.meta.url).href;
const sum = (xs: Totals[]) => xs.reduce((a, b) => { for (const [k, v] of Object.entries(b)) a[k] = (a[k] ?? 0) + v; return a; }, {} as Totals);

// Every worker starts at once (each reads the engine code when it starts): `--chunks` per league.
async function league(l: string): Promise<Totals> {
  const per = Math.ceil(matches / chunks);
  const jobs = Array.from({ length: chunks }, (_, c) => new Promise<Totals>((resolve, reject) => {
    const w = new Worker(WORKER, { type: "module" });
    w.onmessage = (e: MessageEvent<Totals>) => { w.terminate(); resolve(e.data); };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message)); };
    w.postMessage({ league: l, matches: Math.min(per, matches - c * per), offset: c * per, seed, overrides });
  }));
  return sum(await Promise.all(jobs));
}

const res: Record<string, Totals> = {};
const done = await Promise.all(leagues.map(league));
leagues.forEach((l, i) => { res[l] = done[i]!; });
res.all = sum(Object.values(res));
if (out) writeFileSync(out, JSON.stringify(res, null, 1));
const base = compare ? (JSON.parse(readFileSync(compare, "utf8")) as Record<string, Totals>) : null;

const KEYS = ["goals", "s.shots", "s.xg", "s.passesAttempted", "s.passesCompleted", "s.throughBallsAttempted", "s.throughBallsCompleted",
  "s.interceptions", "s.tackles", "s.fouls", "s.offsides", "s.dribblesWon", "s.dribblesLost", "s.crosses", "s.corners", "s.penaltiesAwarded",
  "s.looseBallsWon", "s.avgEndEnergy", "s.distanceCovered", "s.sprints"];
const per = (t: Totals, k: string) => (t[k] ?? NaN) / t.n!;
console.log(`overrides ${JSON.stringify(overrides)}  seed ${seed}`);
for (const l of Object.keys(res)) {
  const t = res[l]!;
  const b = base?.[l];
  const m = t.goals! / t.n!, se = Math.sqrt((t.goalsSq! / t.n! - m * m) / t.n!);
  console.log(`\n${l}  n ${t.n}  goals ${m.toFixed(3)} ± ${se.toFixed(3)}`);
  for (const k of KEYS) {
    let v = per(t, k);
    if (k === "s.avgEndEnergy") v /= 2;
    let line = `  ${k.replace("s.", "").padEnd(24)} ${v.toFixed(3)}`;
    if (k === "s.throughBallsCompleted") line += `  (${((100 * t[k]!) / t["s.throughBallsAttempted"]!).toFixed(1)}%)`;
    if (k === "s.distanceCovered") line += `  (${(v / 22).toFixed(0)} yd/player)`;
    if (b) { let bv = per(b, k); if (k === "s.avgEndEnergy") bv /= 2; line += `   base ${bv.toFixed(3)}  Δ ${(((v - bv) / bv) * 100).toFixed(1)}%`; }
    console.log(line);
  }
}
