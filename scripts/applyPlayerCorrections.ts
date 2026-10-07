/**
 * Applies the manual player corrections (`data_process/curated/playerCorrections.json`) to the
 * world in `src/example_data/squads`: fixed natural position and/or a hand-set overall. Runs right
 * after `bun scripts/importEspn.ts` (`.claude/rules/data/espn-import.md` → "Regenerar").
 * Idempotent; writes only the squad files that change, in their original format.
 *
 *   bun scripts/applyPlayerCorrections.ts
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyCorrection, formatLike, locatePlayers, parseCorrections, type AttrWeights,
} from "@/../scripts/curated/corrections";
import ROLES_JSON from "@/Data/roles.json";
import type { RosterPlayer } from "@/types/playerTypes";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DATA = join(ROOT, "src", "example_data");
const SQUADS = join(DATA, "squads");
const CORRECTIONS = join(ROOT, "data_process", "curated", "playerCorrections.json");

// The overall math reads src/Data/roles.json (Player.ts); same precondition as the importers.
{
  const runtimeRoles = join(ROOT, "src", "Data", "roles.json");
  if (!existsSync(runtimeRoles) || readFileSync(runtimeRoles, "utf-8") !== readFileSync(join(DATA, "roles.json"), "utf-8"))
    throw new Error("src/Data/roles.json is out of sync — run cp src/example_data/roles.json src/Data/roles.json first");
}

interface SquadFile { path: string; text: string; squad: { players: RosterPlayer[] } & Record<string, unknown> }

function listSquadFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...listSquadFiles(p));
    else if (e.name.endsWith(".json")) out.push(p);
  }
  return out.sort();
}

const corrections = parseCorrections(JSON.parse(readFileSync(CORRECTIONS, "utf-8")));
const ids = Object.keys(corrections);

const files = new Map<string, SquadFile>();
for (const path of listSquadFiles(SQUADS)) {
  const text = readFileSync(path, "utf-8");
  const squad = JSON.parse(text) as SquadFile["squad"];
  files.set(path, { path, text, squad });
}
const locations = locatePlayers(new Map([...files].map(([k, f]) => [k, f.squad.players ?? []])), ids);

const changedFiles = new Set<string>();
const rows: string[] = [];
for (const id of ids) {
  const loc = locations.get(id)!;
  const file = files.get(loc.file)!;
  const player = file.squad.players[loc.index]!;
  const r = applyCorrection(player, corrections[id]!, ROLES_JSON as AttrWeights);
  if (r.changed) {
    file.squad.players[loc.index] = r.player;
    changedFiles.add(loc.file);
  }
  rows.push(
    `${r.changed ? "*" : " "} ${id.padEnd(14)} ${player.name.padEnd(22)} ${relative(SQUADS, loc.file).replace(/\\/g, "/").padEnd(28)} ` +
    `${r.before.position.padStart(3)} ${r.before.overall.toFixed(2)} → ${r.after.position.padStart(3)} ${r.after.overall.toFixed(2)}`,
  );
}

for (const path of changedFiles) {
  const f = files.get(path)!;
  writeFileSync(path, formatLike(f.text, f.squad));
}

console.log(`Correções de jogadores (${ids.length}): posição natural e nota, antes → depois (* = mudou)`);
for (const row of rows) console.log(row);
console.log(`${changedFiles.size} arquivo(s) de elenco gravado(s).`);
