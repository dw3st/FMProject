/**
 * Rebuilds src/Domain/world/playerNameFixes.json from the base world: the players that would show the
 * same abbreviated name. Run after regenerating the world (.claude/rules/data/espn-import.md).
 *
 *   bun scripts/buildPlayerNameFixes.ts
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { buildNameFixes, type NamedPlayer } from "@/Domain/world/playerNames";

const root = "src/example_data/squads";
const players: NamedPlayer[] = [];
for (const league of readdirSync(root)) {
  for (const file of readdirSync(`${root}/${league}`)) {
    const squad = JSON.parse(readFileSync(`${root}/${league}/${file}`, "utf8")) as { players: NamedPlayer[] };
    players.push(...squad.players);
  }
}
const fixes = buildNameFixes(players);
const sorted = Object.fromEntries(Object.entries(fixes).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync("src/Domain/world/playerNameFixes.json", `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`${Object.keys(sorted).length} players`);
for (const [id, name] of Object.entries(sorted)) console.log(`${id}  ${name}`);
