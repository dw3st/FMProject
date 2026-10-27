/**
 * Adds the TheSportsDB crests (src/example_data/logos/tsdb/<squadId>.png, from scripts/fetchTheSportsDBBadges.ts)
 * to the existing src/example_data/logoIndex.json without rerunning the import chain. Native and ESPN entries
 * are never overwritten; a tsdb file of a club that is not in the world is ignored. Idempotent.
 *
 *   bun scripts/applyTsdbBadges.ts
 *
 * Then copy logoIndex.json and logos/tsdb/ to src/Data/.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { TSDB_LOGO_DIR } from "@/../scripts/espn/logos";

const DATA = fileURLToPath(new URL("../src/example_data/", import.meta.url));
const dir = join(DATA, "logos", TSDB_LOGO_DIR);
const indexPath = join(DATA, "logoIndex.json");
const index: Record<string, string> = JSON.parse(readFileSync(indexPath, "utf8"));

const worldIds = new Set<string>();
for (const lg of readdirSync(join(DATA, "squads"))) for (const f of readdirSync(join(DATA, "squads", lg))) worldIds.add(f.replace(/\.json$/, ""));

let added = 0, kept = 0, outside = 0;
for (const f of existsSync(dir) ? readdirSync(dir).filter((x) => x.endsWith(".png")) : []) {
  const id = f.slice(0, -4);
  if (!worldIds.has(id)) { outside++; continue; }
  const entry = `${TSDB_LOGO_DIR}/${id}`;
  if (index[id] && index[id] !== entry) { kept++; continue; }
  if (index[id] !== entry) { index[id] = entry; added++; }
}
const sorted = Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true })));
writeFileSync(indexPath, JSON.stringify(sorted, null, 2) + "\n");
console.log(`tsdb: ${added} added, ${kept} skipped (native/ESPN crest), ${outside} not in the world; index ${Object.keys(sorted).length} of ${worldIds.size} clubs`);
