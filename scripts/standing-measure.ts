// Distribution of the standing bars and their value multiplier over a save's world (`.claude/rules/game/standing.md`).
// bun scripts/standing-measure.ts [saveId]   (default: the newest local save)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { standingValueMult, withStandings, worldRanks } from "@/Domain/standing/standing";
import type { Squad } from "@/types/playerTypes";

const root = "src/Data/saves";
const saveId = process.argv[2] ?? readdirSync(root).filter((f) => !f.endsWith(".json")).sort((a, b) => statSync(join(root, b)).mtimeMs - statSync(join(root, a)).mtimeMs)[0]!;
const squads: Squad[] = [];
const dir = join(root, saveId, "squads");
for (const league of readdirSync(dir)) for (const f of readdirSync(join(dir, league))) squads.push(JSON.parse(readFileSync(join(dir, league, f), "utf8")));
const t0 = performance.now();
const ranks = worldRanks(squads);
const done = squads.map((s) => withStandings(s, ranks));
console.log(`save ${saveId}: ${squads.length} squads, computed in ${(performance.now() - t0).toFixed(0)} ms`);
const hist = { fans: Array(11).fill(0), club: Array(11).fill(0), world: Array(11).fill(0) };
const mults: number[] = [];
for (const s of done) for (const p of s.players) {
  const b = p.standing!;
  hist.fans[b.fans]++; hist.club[b.club]++; hist.world[b.world]++;
  mults.push(standingValueMult(p));
}
for (const k of ["fans", "club", "world"] as const) console.log(k.padEnd(6), hist[k].join(" "));
mults.sort((a, b) => a - b);
const q = (x: number) => mults[Math.floor(x * (mults.length - 1))]!.toFixed(3);
const mean = mults.reduce((a, b) => a + b, 0) / mults.length;
console.log(`mult mean ${mean.toFixed(4)} · p5 ${q(0.05)} · p25 ${q(0.25)} · median ${q(0.5)} · p75 ${q(0.75)} · p95 ${q(0.95)} · max ${q(1)}`);
