/**
 * Face pilot: merges the trait sources into the world data file the game reads.
 *   bun scripts/faces/mergeTraits.ts → src/example_data/faceTraits.json (+ copy to src/Data)
 * Sources, later wins per player: data_process/espn/faceTraits.json (photo heuristic),
 * data_process/wikidata/faceTraits.json (visual labels of Commons photos).
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FaceTraits } from "@/Domain/faces/faceTraits";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SOURCES = ["data_process/espn/faceTraits.json", "data_process/wikidata/faceTraits.json"];
const out: Record<string, FaceTraits> = {};
for (const src of SOURCES) {
  const file = join(ROOT, src);
  if (!existsSync(file)) continue;
  const data: Record<string, FaceTraits> = JSON.parse(readFileSync(file, "utf8"));
  for (const [id, t] of Object.entries(data)) out[id] = t; // whole record replaced: later source wins
  console.log(`${src}: ${Object.keys(data).length}`);
}
const lines = Object.keys(out).sort().map((k) => ` ${JSON.stringify(k)}: ${JSON.stringify(out[k])}`);
const dest = join(ROOT, "src/example_data/faceTraits.json");
writeFileSync(dest, `{\n${lines.join(",\n")}\n}\n`);
if (existsSync(join(ROOT, "src/Data"))) copyFileSync(dest, join(ROOT, "src/Data/faceTraits.json"));
console.log(`${lines.length} players → src/example_data/faceTraits.json`);
