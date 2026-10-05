/**
 * Face pilot: order in which players are labelled by hand (only those with a free Commons photo).
 *   bun scripts/faces/labelQueue.ts [--all] → ids, one per line
 * 1. world top 300 by overall; 2. auto XI (4-3-3) of every club of the pilot leagues;
 * 3. the other players of the 40 strongest clubs (average XI overall).
 * Already labelled players (faceTraitLabels.txt) and unusable photos (faceTraitSkips.txt) are skipped unless --all.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Player } from "@/Domain/Player";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { LEAGUES } from "@/../scripts/faces/wikidata";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const meta = JSON.parse(readFileSync(join(ROOT, "data_process/wikidata/photoMeta.json"), "utf8"));
const labelsFile = join(ROOT, "data_process/wikidata/faceTraitLabels.txt");
const ids = (file: string) => existsSync(file)
  ? readFileSync(file, "utf8").split("\n").filter((l) => l.trim() && !l.startsWith("#")).map((l) => l.split(/\s+/)[0]!)
  : [];
// Labelled players and unusable photos (faceTraitSkips.txt) are left out unless --all.
const done = new Set(process.argv.includes("--all") ? [] : [...ids(labelsFile), ...ids(join(ROOT, "data_process/wikidata/faceTraitSkips.txt"))]);

const all: { id: string; ovr: number }[] = [];
const clubs: { league: string; sq: any; xi: string[]; level: number }[] = [];
const squadsDir = join(ROOT, "src/example_data/squads");
for (const league of readdirSync(squadsDir)) for (const f of readdirSync(join(squadsDir, league))) {
  const sq = JSON.parse(readFileSync(join(squadsDir, league, f), "utf8"));
  for (const p of sq.players) all.push({ id: p.id, ovr: Player.computeOverallAvg(p) });
  if (LEAGUES.includes(league)) {
    const xi = autoLineupDefaultFormation(sq).filter(Boolean);
    const byId = new Map(sq.players.map((p: any) => [p.id, p]));
    const level = xi.reduce((s, id) => s + Player.computeOverallAvg(byId.get(id) as never), 0) / Math.max(1, xi.length);
    clubs.push({ league, sq, xi, level });
  }
}
const order: string[] = [];
const push = (id: string) => { if (meta[id] && !done.has(id) && !order.includes(id)) order.push(id); };
all.sort((a, b) => b.ovr - a.ovr).slice(0, 300).forEach((p) => push(p.id));
for (const c of clubs) c.xi.forEach(push);
for (const c of clubs.sort((a, b) => b.level - a.level).slice(0, 40)) for (const p of c.sq.players) push(p.id);
console.log(order.join("\n"));
