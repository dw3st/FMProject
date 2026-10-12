/**
 * Ball cluster measurement (#145): per live tick, how many outfield players of each team are within
 * 8 yards of the ball, which decisions they hold, and how big a hole the defending team leaves
 * between the ball and its own goal (12×8 grid). Plus the world volume (goals, shots, passes,
 * tackles, fouls) to check a fix keeps it.
 *
 *   bun scripts/ball-cluster.ts [--leagues premier_league] [--modes main,ai] [--engine 200]
 *                               [--chunks 4] [--offset 0] [--out f.json] [--sum a.json,b.json]
 */
import { writeFileSync, readFileSync } from "node:fs";
import type { Mode } from "@/../scripts/ai-formation-goals-shared";
import { emptyClusterTotals, mergeClusterTotals, type ClusterTotals } from "@/../scripts/ball-cluster-shared";

const args = process.argv.slice(2);
const arg = (f: string, d: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] ?? d : d; };
const leagues = arg("--leagues", "premier_league").split(",");
const modes = arg("--modes", "main,ai").split(",") as Mode[];
const engineN = Number(arg("--engine", "200"));
const chunks = Number(arg("--chunks", "4"));
const out = arg("--out", "");
const sumFiles = arg("--sum", "");
const offset0 = Number(arg("--offset", "0"));

const WORKER = new URL("./ball-cluster-worker.ts", import.meta.url).href;
function run(league: string, mode: Mode): Promise<ClusterTotals>[] {
  const per = Math.ceil(engineN / chunks);
  return Array.from({ length: chunks }, (_, c) => new Promise<ClusterTotals>((resolve, reject) => {
    const w = new Worker(WORKER, { type: "module" });
    w.onmessage = (e: MessageEvent<ClusterTotals>) => { w.terminate(); resolve(e.data); };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message)); };
    w.postMessage({ league, mode, matches: Math.min(per, engineN - c * per), offset: offset0 + c * per });
  }));
}

const results: Record<string, ClusterTotals> = {};
if (sumFiles) {
  for (const f of sumFiles.split(",")) {
    const r = JSON.parse(readFileSync(f, "utf8")) as Record<string, ClusterTotals>;
    for (const [k, v] of Object.entries(r)) results[k] = results[k] ? mergeClusterTotals(results[k]!, v) : v;
  }
} else {
  for (const l of leagues) for (const m of modes) {
    const parts = await Promise.all(run(l, m));
    results[`${l}:${m}`] = parts.reduce(mergeClusterTotals, emptyClusterTotals());
  }
  if (out) writeFileSync(out, JSON.stringify(results));
}

const pct = (a: number, b: number) => `${((100 * a) / Math.max(1, b)).toFixed(1)}%`;
const tail = (h: number[], from: number) => h.slice(from).reduce((a, b) => a + b, 0);
const top = (r: Record<string, number>, total: number, k = 8) =>
  Object.entries(r).sort((a, b) => b[1] - a[1]).slice(0, k).map(([n, v]) => `${n} ${pct(v, total)}`).join(", ");
for (const [key, t] of Object.entries(results)) {
  const per = (v: number) => (v / t.n).toFixed(2);
  console.log(`\n## ${key}: ${t.n} jogos, ${t.ticks} ticks vivos (bola solta ${pct(t.looseTicks, t.ticks)})`);
  console.log(`gols ${per(t.goals)} · chutes ${per(t.shots)} · passes ${per(t.passes)} · desarmes ${per(t.tackles)} · faltas ${per(t.fouls)} · interceptações ${per(t.interceptions)}`);
  console.log(`defensores ≤8 jd da bola: média ${(t.defNear / t.ticks).toFixed(3)} · ≥3 ${pct(tail(t.defHist, 3), t.ticks)} · ≥4 ${pct(tail(t.defHist, 4), t.ticks)}`);
  console.log(`  histograma 0..6+: ${t.defHist.map((v) => pct(v, t.ticks)).join(" | ")}`);
  console.log(`atacantes ≤8 jd da bola: média ${(t.attNear / t.ticks).toFixed(3)} · ≥3 ${pct(tail(t.attHist, 3), t.ticks)} · ≥4 ${pct(tail(t.attHist, 4), t.ticks)}`);
  console.log(`  histograma 0..6+: ${t.attHist.map((v) => pct(v, t.ticks)).join(" | ")}`);
  const lt = t.looseDefHist.reduce((a, b) => a + b, 0), ht = t.heldDefHist.reduce((a, b) => a + b, 0);
  console.log(`  bola no ar/solta (${pct(lt, t.ticks)}): ${t.looseDefHist.map((v) => pct(v, lt)).join(" | ")}`);
  console.log(`  bola dominada (${pct(ht, t.ticks)}): ${t.heldDefHist.map((v) => pct(v, ht)).join(" | ")}`);
  console.log(`  perseguidores (os dois times) com bola no ar/solta 0..6+: ${t.chaseHist.map((v) => pct(v, lt)).join(" | ")}`);
  console.log(`  bola dominada, jogadores ainda em chase_loose_ball 0..6+: ${t.staleHist.map((v) => pct(v, ht)).join(" | ")}`);
  const hdt = Object.values(t.heldDefDec).reduce((a, b) => a + b, 0);
  console.log(`  bola dominada, ≥3 perto, papel:decisão: ${top(t.heldDefDec, hdt, 12)}`);
  console.log(`pressionadores simultâneos 0..5+: ${t.pressHist.map((v) => pct(v, t.ticks)).join(" | ")}`);
  console.log(`buraco: maior vão médio ${(t.gap / t.ticks).toFixed(2)} jd · células abertas ${(t.open / t.ticks).toFixed(2)}`);
  for (const k of ["c0", "c3", "c4"] as const) {
    const g = t.gapBy[k];
    if (g.n) console.log(`  com ${k === "c0" ? "≤2" : k === "c3" ? "3" : "≥4"} defensores perto (${pct(g.n, t.ticks)}): vão ${(g.gap / g.n).toFixed(2)} · abertas ${(g.open / g.n).toFixed(2)}`);
  }
  const dTot = Object.values(t.defDecType).reduce((a, b) => a + b, 0);
  console.log(`decisões dos defensores perto (quando ≥3): ${top(t.defDecType, dTot)}`);
  console.log(`  papel:decisão: ${top(t.defDec, dTot, 14)}`);
  const aTot = Object.values(t.attDecType).reduce((a, b) => a + b, 0);
  console.log(`decisões dos atacantes perto (quando ≥3): ${top(t.attDecType, aTot)}`);
}
