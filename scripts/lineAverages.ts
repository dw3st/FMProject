// Média de nota (overall) por linha (GK/DEF/MID/FWD, por positions[0]) das ligas pedidas, a partir de uma pasta de elencos.
// Uso: bun scripts/lineAverages.ts [pasta de elencos = src/example_data/squads] [ligas = 5 grandes + brazil_serie_a]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeOverallAvg } from "@/Domain/playerRating";
import { getMainRole } from "@/Domain/roles";
import type { RosterPlayer } from "@/types/playerTypes";

const dir = process.argv[2] ?? fileURLToPath(new URL("../src/example_data/squads", import.meta.url));
const leagues = (process.argv[3] ?? "premier_league,la_liga,bundesliga,serie_a,ligue_1,brazil_serie_a").split(",");
const LINES = ["GK", "Defender", "Midfielder", "Forward"] as const;

console.log(`liga`.padEnd(18) + LINES.map((l) => l.slice(0, 3).padStart(12)).join(""));
for (const league of leagues) {
  const d = join(dir, league);
  if (!existsSync(d)) { console.log(`${league}: sem pasta`); continue; }
  const sums = new Map<string, { s: number; n: number }>();
  for (const f of readdirSync(d).filter((x) => x.endsWith(".json"))) {
    const squad = JSON.parse(readFileSync(join(d, f), "utf8")) as { players: RosterPlayer[] };
    for (const p of squad.players) {
      const line = getMainRole(p.positions[0] ?? "CM");
      const e = sums.get(line) ?? { s: 0, n: 0 };
      e.s += computeOverallAvg(p); e.n++;
      sums.set(line, e);
    }
  }
  console.log(league.padEnd(18) + LINES.map((l) => {
    const e = sums.get(l);
    return (e ? `${(e.s / e.n).toFixed(2)} (${e.n})` : "—").padStart(12);
  }).join(""));
}
