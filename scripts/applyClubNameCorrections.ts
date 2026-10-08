/**
 * Applies the curated club names (`data_process/curated/clubNameCorrections.json`) to the world in
 * `src/example_data`: the squad files (`name`, and `shortName` when the correction has one) and the
 * standings of `leagueData.json`. Runs right after `bun scripts/applyPlayerCorrections.ts`
 * (`.claude/rules/data/espn-import.md` → "Regenerar"). Fails on a squad id missing from the world.
 * Idempotent; writes only the files that change, in their original format.
 *
 *   bun scripts/applyClubNameCorrections.ts
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { formatLike } from "@/../scripts/curated/corrections";
import {
  applyClubName, applyStandingsNames, locateSquads, parseClubNameCorrections,
} from "@/../scripts/curated/clubNames";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DATA = join(ROOT, "src", "example_data");
const SQUADS = join(DATA, "squads");
const LEAGUE_DATA = join(DATA, "leagueData.json");
const CORRECTIONS = join(ROOT, "data_process", "curated", "clubNameCorrections.json");

type Squad = { id: string; name: string; shortName?: string } & Record<string, unknown>;
interface SquadFile { text: string; squad: Squad }

function listSquadFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...listSquadFiles(p));
    else if (e.name.endsWith(".json")) out.push(p);
  }
  return out.sort();
}

const corrections = parseClubNameCorrections(JSON.parse(readFileSync(CORRECTIONS, "utf-8")));
const ids = Object.keys(corrections);

const files = new Map<string, SquadFile>();
for (const path of listSquadFiles(SQUADS)) {
  const text = readFileSync(path, "utf-8");
  files.set(path, { text, squad: JSON.parse(text) as Squad });
}
const locations = locateSquads(new Map([...files].map(([k, f]) => [k, f.squad])), ids);

const rows: string[] = [];
let written = 0;
for (const id of ids) {
  const path = locations.get(id)!;
  const file = files.get(path)!;
  const r = applyClubName(file.squad, corrections[id]!);
  if (r.changed) {
    writeFileSync(path, formatLike(file.text, r.squad));
    written++;
  }
  rows.push(`${r.changed ? "*" : " "} ${id.padEnd(26)} ${relative(SQUADS, path).replace(/\\/g, "/").padEnd(44)} ${r.before} → ${r.squad.name}`);
}

const leagueText = readFileSync(LEAGUE_DATA, "utf-8");
const standings = applyStandingsNames(JSON.parse(leagueText) as { standings?: { squadId: string; name: string }[] }[], corrections);
if (standings.changed > 0) writeFileSync(LEAGUE_DATA, formatLike(leagueText, standings.leagues));

console.log(`Nomes de clubes (${ids.length}): antes → depois (* = mudou)`);
for (const row of rows) console.log(row);
console.log(`${written} elenco(s) gravado(s); ${standings.changed} entrada(s) de standings em leagueData.json.`);
