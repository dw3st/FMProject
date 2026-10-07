/**
 * Applies the market recalibration (`data_process/transfermarkt/derived.json`, built by
 * `bun scripts/buildMarketDerived.ts`) to the world in `src/example_data/squads`: natural position (and line),
 * overall, birth date, height and a missing nationality. Runs after `bun scripts/importEspn.ts` and before
 * `bun scripts/applyPlayerCorrections.ts` (`.claude/rules/data/espn-import.md` → "Regenerar"; the manual
 * corrections win). Idempotent; writes only the squad files that change, in their original format.
 *
 *   bun scripts/applyMarketRecalibration.ts
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { formatLike, type AttrWeights } from "@/../scripts/curated/corrections";
import { applyDerived } from "@/../scripts/transfermarkt/apply";
import type { DerivedEntry } from "@/../scripts/transfermarkt/derive";
import ROLES_JSON from "@/Data/roles.json";
import type { RosterPlayer } from "@/types/playerTypes";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DATA = join(ROOT, "src", "example_data");
const SQUADS = join(DATA, "squads");
const DERIVED = join(ROOT, "data_process", "transfermarkt", "derived.json");

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

const derived = JSON.parse(readFileSync(DERIVED, "utf-8")) as { players: Record<string, DerivedEntry> };
const entries = derived.players ?? {};
const seen = new Set<string>();
const byLeague = new Map<string, { players: number; changed: number }>();
let filesWritten = 0;

for (const path of listSquadFiles(SQUADS)) {
  const text = readFileSync(path, "utf-8");
  const squad = JSON.parse(text) as SquadFile["squad"];
  const league = relative(SQUADS, path).replace(/\\/g, "/").split("/")[0]!;
  const row = byLeague.get(league) ?? { players: 0, changed: 0 };
  byLeague.set(league, row);
  let dirty = false;
  squad.players = (squad.players ?? []).map((p) => {
    row.players++;
    const entry = entries[p.id];
    if (!entry) return p;
    if (seen.has(p.id)) throw new Error(`applyMarketRecalibration: player ${p.id} appears in more than one squad`);
    seen.add(p.id);
    const next = applyDerived(p, entry, ROLES_JSON as AttrWeights);
    if (next !== p) { row.changed++; dirty = true; }
    return next;
  });
  if (dirty) { writeFileSync(path, formatLike(text, squad)); filesWritten++; }
}

const missing = Object.keys(entries).filter((id) => !seen.has(id));
console.log("Recalibração pelo valor de mercado: jogadores alterados por liga");
let total = 0;
for (const [league, r] of [...byLeague].sort(([a], [b]) => a.localeCompare(b))) {
  if (!r.changed) continue;
  total += r.changed;
  console.log(`  ${league.padEnd(42)} ${String(r.changed).padStart(5)} / ${r.players}`);
}
console.log(`${total} jogador(es) alterado(s), ${filesWritten} arquivo(s) de elenco gravado(s).`);
if (missing.length)
  console.log(`${missing.length} id(s) do derived.json fora do mundo (cortados no MAX_SQUAD do importEspn, ou mundo regenerado): ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? ", …" : ""}`);
