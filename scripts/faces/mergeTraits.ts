/**
 * Face pilot: builds the world data file the game reads.
 *   bun scripts/faces/mergeTraits.ts → src/example_data/faceTraits.json (+ copy to src/Data)
 *
 * 1. data_process/wikidata/faceTraitLabels.txt (visual labels: id skin hairColor hairLength beard
 *    [Wikidata qid of the photo seen]) → data_process/wikidata/faceTraits.json, keeping only players whose photo is still the one
 *    labelled (photoMeta.json): a match dropped or changed by a stricter matcher drops its label.
 * 2. Merge, later wins per player: data_process/espn/faceTraits.json (photo heuristic), then Wikidata.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BeardKind, FaceTraits, HairColor, HairLength, SkinTone } from "@/Domain/faces/faceTraits";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const at = (p: string) => join(ROOT, p);
const write = (file: string, data: Record<string, FaceTraits>) => {
  const lines = Object.keys(data).sort().map((k) => ` ${JSON.stringify(k)}: ${JSON.stringify(data[k])}`);
  writeFileSync(file, `{\n${lines.join(",\n")}\n}\n`);
  return lines.length;
};

const COLORS = new Set(["black", "darkBrown", "brown", "blond", "red", "grey"]);
const LENGTHS = new Set(["bald", "short", "medium", "long"]);
const BEARDS = new Set(["none", "stubble", "full"]);
const meta = JSON.parse(readFileSync(at("data_process/wikidata/photoMeta.json"), "utf8"));
const wd: Record<string, FaceTraits> = {};
let dropped = 0;
for (const line of readFileSync(at("data_process/wikidata/faceTraitLabels.txt"), "utf8").split("\n")) {
  if (!line.trim() || line.startsWith("#")) continue;
  const [id, skin, hairColor, hairLength, beard, qid] = line.trim().split(/\s+/);
  const s = Number(skin);
  if (!id || !(s >= 1 && s <= 7) || !COLORS.has(hairColor!) || !LENGTHS.has(hairLength!) || !BEARDS.has(beard!)) throw new Error(`bad label: ${line}`);
  if (!meta[id] || (qid !== undefined && meta[id].qid !== qid)) { dropped++; continue; }
  wd[id] = { skin: s as SkinTone, hairColor: hairColor as HairColor, hairLength: hairLength as HairLength, beard: beard as BeardKind };
}
console.log(`wikidata labels: ${write(at("data_process/wikidata/faceTraits.json"), wd)} (${dropped} dropped: no photo match any more)`);

const out: Record<string, FaceTraits> = {};
for (const src of ["data_process/espn/faceTraits.json", "data_process/wikidata/faceTraits.json"]) {
  if (!existsSync(at(src))) continue;
  Object.assign(out, JSON.parse(readFileSync(at(src), "utf8")));
}
const dest = at("src/example_data/faceTraits.json");
console.log(`${write(dest, out)} players → src/example_data/faceTraits.json`);
if (existsSync(at("src/Data"))) copyFileSync(dest, at("src/Data/faceTraits.json"));
