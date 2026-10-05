/**
 * Face pilot: builds the world data file the game reads.
 *   bun scripts/faces/mergeTraits.ts → src/example_data/faceTraits.json (+ copy to src/Data)
 *
 * 1. Visual labels → per-source traits, for each labelled source (Wikidata/Commons, TheSportsDB):
 *    `<dir>/faceTraitLabels.txt` (id skin hairColor hairLength beard [id of the photo seen]) →
 *    `<dir>/faceTraits.json`, keeping only players whose photo is still the one labelled
 *    (`<dir>/photoMeta.json`, `qid` or `idPlayer`): a match dropped or changed drops its label.
 * 2. Merge, later wins per player: ESPN photo heuristic, then TheSportsDB labels, then Commons labels.
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

function labelsToTraits(dir: string, photoKey: "qid" | "idPlayer"): void {
  const labels = at(`${dir}/faceTraitLabels.txt`);
  if (!existsSync(labels)) return;
  const meta = JSON.parse(readFileSync(at(`${dir}/photoMeta.json`), "utf8"));
  const out: Record<string, FaceTraits> = {};
  let dropped = 0;
  for (const line of readFileSync(labels, "utf8").split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [id, skin, hairColor, hairLength, beard, seen] = line.trim().split(/\s+/);
    const s = Number(skin);
    if (!id || !(s >= 1 && s <= 7) || !COLORS.has(hairColor!) || !LENGTHS.has(hairLength!) || !BEARDS.has(beard!)) throw new Error(`bad label in ${dir}: ${line}`);
    if (!meta[id] || (seen !== undefined && meta[id][photoKey] !== seen)) { dropped++; continue; }
    out[id] = { skin: s as SkinTone, hairColor: hairColor as HairColor, hairLength: hairLength as HairLength, beard: beard as BeardKind };
  }
  console.log(`${dir} labels: ${write(at(`${dir}/faceTraits.json`), out)} (${dropped} dropped: no photo match any more)`);
}
labelsToTraits("data_process/wikidata", "qid");
labelsToTraits("data_process/thesportsdb", "idPlayer");

const out: Record<string, FaceTraits> = {};
for (const src of ["data_process/espn/faceTraits.json", "data_process/thesportsdb/faceTraits.json", "data_process/wikidata/faceTraits.json"]) {
  if (!existsSync(at(src))) continue;
  Object.assign(out, JSON.parse(readFileSync(at(src), "utf8")));
}
const dest = at("src/example_data/faceTraits.json");
console.log(`${write(dest, out)} players → src/example_data/faceTraits.json`);
if (existsSync(at("src/Data"))) copyFileSync(dest, at("src/Data/faceTraits.json"));
