/**
 * Formation balance vs 4-3-3 with identical real squads (Etapa 18, #59).
 *
 *   bun scripts/formation-vs-433.ts [--matches 200] [--chunks 2] [--league premier_league]
 *                                   [--vs 4-3-3] [--only a,b] [--json out.json] [--mirror]
 *
 * Every tested formation plays `matches` full-engine matches against `--vs` (default 4-3-3); both
 * sides field the same club (each match takes the next club of the league; sides alternate). The
 * engine isn't seeded, so runs can be summed (`--json` writes the raw totals; pass several files
 * to `--sum a.json,b.json` to print the summed table without simulating).
 * Win edge = win% − loss% of the tested formation (0 = even with 4-3-3).
 */
import { FORMATION_IDS } from "@/Domain/matchFormations";
import type { Totals } from "./formation-vs-433-worker";

const args = process.argv.slice(2);
const arg = (f: string, d: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] ?? d : d; };
const matches = Number(arg("--matches", "200"));
const chunks = Number(arg("--chunks", "2"));
const league = arg("--league", "premier_league");
const vs = arg("--vs", "4-3-3");
const only = arg("--only", "");
const jsonOut = arg("--json", "");
const sum = arg("--sum", "");
/** Each formation plays itself instead of `--vs` (goal volume of a formation's mirror match). */
const mirror = args.includes("--mirror");

function add(a: Totals, b: Totals): Totals {
  return {
    formation: a.formation, matches: a.matches + b.matches, wins: a.wins + b.wins, draws: a.draws + b.draws,
    losses: a.losses + b.losses, goalsFor: a.goalsFor + b.goalsFor, goalsAgainst: a.goalsAgainst + b.goalsAgainst,
    shotsFor: a.shotsFor + b.shotsFor, shotsAgainst: a.shotsAgainst + b.shotsAgainst,
  };
}

function print(rows: Totals[]): void {
  const p = (n: number, d: number) => ((100 * n) / d).toFixed(1);
  console.log(`| Formação | jogos | V % | E % | D % | vantagem (V−D) | gols pró | gols contra | chutes pró | chutes contra |`);
  console.log(`|---|---|---|---|---|---|---|---|---|---|`);
  for (const t of [...rows].sort((a, b) => (b.wins - b.losses) / b.matches - (a.wins - a.losses) / a.matches)) {
    const n = t.matches;
    const edge = (100 * (t.wins - t.losses)) / n;
    console.log(`| ${t.formation} | ${n} | ${p(t.wins, n)} | ${p(t.draws, n)} | ${p(t.losses, n)} | ${edge >= 0 ? "+" : ""}${edge.toFixed(1)} | ${(t.goalsFor / n).toFixed(2)} | ${(t.goalsAgainst / n).toFixed(2)} | ${(t.shotsFor / n).toFixed(2)} | ${(t.shotsAgainst / n).toFixed(2)} |`);
  }
}

if (sum) {
  const byId = new Map<string, Totals>();
  for (const file of sum.split(",")) {
    for (const t of (await Bun.file(file).json()) as Totals[]) {
      byId.set(t.formation, byId.has(t.formation) ? add(byId.get(t.formation)!, t) : t);
    }
  }
  print([...byId.values()]);
  process.exit(0);
}

const ids = (only ? only.split(",") : FORMATION_IDS.filter((f) => mirror || f !== vs));
const per = Math.ceil(matches / chunks);
const WORKER = new URL("./formation-vs-433-worker.ts", import.meta.url).href;
console.error(`${ids.length} formations × ${matches} matches vs ${vs} (${league}), ${ids.length * chunks} workers`);
const start = performance.now();
const jobs = ids.flatMap((formation) => Array.from({ length: chunks }, (_, c) => new Promise<Totals>((resolve, reject) => {
  const w = new Worker(WORKER, { type: "module" });
  w.onmessage = (e: MessageEvent<Totals>) => { w.terminate(); resolve(e.data); };
  w.onerror = (e) => { w.terminate(); reject(new Error(`${formation}: ${e.message}`)); };
  const n = Math.min(per, matches - c * per);
  w.postMessage({ formation, vs: mirror ? formation : vs, league, matches: n, offset: c * per + Math.floor(Math.random() * 1000) * 2 });
})));
const results = await Promise.all(jobs);
const merged = new Map<string, Totals>();
for (const t of results) merged.set(t.formation, merged.has(t.formation) ? add(merged.get(t.formation)!, t) : t);
console.error(`done in ${((performance.now() - start) / 1000).toFixed(0)} s`);
print([...merged.values()]);
if (jsonOut) await Bun.write(jsonOut, JSON.stringify([...merged.values()], null, 2));
