/** Face pilot: top N players by overall across the pilot leagues (`bun scripts/faces/topPlayers.ts 60`). */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Player } from "@/Domain/Player";
import { LEAGUES } from "@/../scripts/faces/wikidata";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export function topPlayers(n: number): { id: string; name: string; club: string; league: string; overall: number }[] {
  const all: { id: string; name: string; club: string; league: string; overall: number }[] = [];
  for (const league of LEAGUES) for (const f of readdirSync(join(ROOT, "src/example_data/squads", league))) {
    const sq = JSON.parse(readFileSync(join(ROOT, "src/example_data/squads", league, f), "utf8"));
    for (const p of sq.players) all.push({ id: p.id, name: p.name, club: sq.name, league, overall: Player.computeOverallAvg(p) });
  }
  return all.sort((a, b) => b.overall - a.overall).slice(0, n);
}
if (import.meta.main) for (const p of topPlayers(Number(process.argv[2] ?? 60))) console.log(`${p.overall.toFixed(2)} ${p.id} ${p.name} (${p.club})`);
