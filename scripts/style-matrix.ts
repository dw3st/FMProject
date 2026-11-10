/**
 * Style against style: does any tactical style beat another on its own? Full engine, the SAME club on both sides (the
 * next club of the league per match, sides alternating), 4-3-3, auto XI, fitness 88, familiarity neutral (50), every
 * match on its own seeded `Math.random`. Edge = win% − loss% of the row against the column; standard error ~±4 p.p.
 * with 300 matches.
 *
 *   bun scripts/style-matrix.ts [league=premier_league] [matches=300] [--part 0/3] [--out file.json]
 *   bun scripts/style-matrix.ts --sum a.json,b.json
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { simulateMatch } from "@/GameEngine/Domain/SimulateMatch";
import { autoLineupForFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { formationForSimId } from "@/Domain/matchFormations";
import { emptySeasonLog, type Squad } from "@/types/playerTypes";
import { mulberry32, seedFrom } from "@/Domain/rng";
import type { TacticalStyle } from "@/types/tacticsTypes";

const STYLES: TacticalStyle[] = ["balanced", "possession", "high_press", "counter_attack", "direct_play"];

interface Pair { x: TacticalStyle; y: TacticalStyle; matches: number; wins: number; draws: number; losses: number; gx: number; gy: number; sx: number; sy: number }

const args = process.argv.slice(2);
const flag = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };

function print(pairs: Pair[]) {
  const at = (x: string, y: string) => pairs.find((p) => (p.x === x && p.y === y) || (p.x === y && p.y === x));
  const edge = (x: string, y: string) => {
    const p = at(x, y)!;
    const e = ((p.wins - p.losses) / p.matches) * 100;
    return p.x === x ? e : -e;
  };
  console.log("edge of the row against the column (win% - loss%)");
  console.log("".padEnd(16) + STYLES.map((s) => s.padStart(16)).join(""));
  for (const x of STYLES) console.log(x.padEnd(16) + STYLES.map((y) => (x === y ? "-" : edge(x, y).toFixed(1)).padStart(16)).join(""));
  console.log("\nmean edge against the four others, goals and shots per match of the mirror");
  for (const x of STYLES) {
    const others = STYLES.filter((y) => y !== x);
    const mean = others.reduce((a, y) => a + edge(x, y), 0) / others.length;
    const m = at(x, x)!;
    console.log(`${x.padEnd(16)} ${mean.toFixed(1).padStart(6)}   goals ${((m.gx + m.gy) / m.matches).toFixed(2)}   shots ${((m.sx + m.sy) / m.matches).toFixed(2)}   (${m.matches} mirror matches)`);
  }
  const n = pairs.filter((p) => p.x !== p.y)[0]?.matches ?? 0;
  console.log(`\n${n} matches per pair; standard error of an edge ~${(100 * Math.sqrt(0.7 / Math.max(1, n))).toFixed(1)} p.p.`);
}

const sum = flag("--sum");
if (sum) {
  const merged = new Map<string, Pair>();
  for (const f of sum.split(",")) {
    for (const p of JSON.parse(readFileSync(f, "utf8")) as Pair[]) {
      const key = `${p.x}|${p.y}`;
      const m = merged.get(key);
      if (!m) { merged.set(key, { ...p }); continue; }
      for (const k of ["matches", "wins", "draws", "losses", "gx", "gy", "sx", "sy"] as const) m[k] += p[k];
    }
  }
  print([...merged.values()]);
  process.exit(0);
}

const pos = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const league = pos[0] ?? "premier_league";
const perPair = Number(pos[1] ?? 300);
const [part, parts] = (flag("--part") ?? "0/1").split("/").map(Number) as [number, number];
const out = flag("--out");

const dir = fileURLToPath(new URL(`../src/Data/squads/${league}/`, import.meta.url));
const squads = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => {
  const s = JSON.parse(readFileSync(dir + f, "utf8")) as Squad;
  return { ...s, players: s.players.map((p) => ({ ...p, seasonLog: { ...emptySeasonLog(), fitness: 88, load: 0 } })) };
});
const f433 = formationForSimId("4-3-3");
const pairs: Pair[] = [];
for (let i = 0; i < STYLES.length; i++) for (let j = i; j < STYLES.length; j++) {
  pairs.push({ x: STYLES[i]!, y: STYLES[j]!, matches: 0, wins: 0, draws: 0, losses: 0, gx: 0, gy: 0, sx: 0, sy: 0 });
}

const realRandom = Math.random;
let k = -1;
const only = flag("--only")?.split(",");
for (const p of pairs) {
  if (only && !only.includes(p.x) && !only.includes(p.y)) { k += perPair; continue; }
  for (let m = 0; m < perPair; m++) {
    k++;
    if (k % parts !== part) continue;
    const squad = squads[m % squads.length]!;
    const a: Squad = { ...squad, players: squad.players.map((q) => ({ ...q, id: `A-${q.id}` })) };
    const b: Squad = { ...squad, players: squad.players.map((q) => ({ ...q, id: `B-${q.id}` })) };
    const xHome = m % 2 === 0;
    Math.random = mulberry32(seedFrom(`style:${league}:${p.x}:${p.y}:${m}`));
    const r = simulateMatch(a, b, f433, f433, autoLineupForFormation(a, f433), autoLineupForFormation(b, f433), {
      tactics: { A: { style: xHome ? p.x : p.y }, B: { style: xHome ? p.y : p.x } },
    });
    Math.random = realRandom;
    const [gx, gy] = xHome ? [r.score.A, r.score.B] : [r.score.B, r.score.A];
    const [sx, sy] = xHome ? [r.teamStats.A.shots, r.teamStats.B.shots] : [r.teamStats.B.shots, r.teamStats.A.shots];
    p.matches++;
    if (gx > gy) p.wins++; else if (gx < gy) p.losses++; else p.draws++;
    p.gx += gx; p.gy += gy; p.sx += sx; p.sy += sy;
  }
}
if (out) writeFileSync(out, JSON.stringify(pairs));
else print(pairs);
