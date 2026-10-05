/**
 * Face pilot: order in which players are labelled by hand (see `priority.ts`).
 *   bun scripts/faces/labelQueue.ts [--source wikidata|thesportsdb] [--all] → ids, one per line
 * wikidata (default): players with a free Commons photo, skipping faceTraitLabels/faceTraitSkips.
 * thesportsdb: players with a TheSportsDB photo and no Commons label, skipping the TheSportsDB
 * labels/skips. --all keeps the already labelled/skipped ones.
 */
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { idsInFile, priorityPlayers } from "@/../scripts/faces/priority";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const at = (p: string) => join(ROOT, p);
const arg = process.argv.indexOf("--source");
const source = arg > 0 ? process.argv[arg + 1] : "wikidata";
const all = process.argv.includes("--all");

const wdLabels = idsInFile(at("data_process/wikidata/faceTraitLabels.txt"));
let photo: Record<string, unknown>;
let done: Set<string>;
if (source === "thesportsdb") {
  photo = JSON.parse(readFileSync(at("data_process/thesportsdb/photoMeta.json"), "utf8"));
  done = new Set([...wdLabels, ...(all ? [] : [
    ...idsInFile(at("data_process/thesportsdb/faceTraitLabels.txt")),
    ...idsInFile(at("data_process/thesportsdb/faceTraitSkips.txt")),
  ])]);
} else {
  photo = JSON.parse(readFileSync(at("data_process/wikidata/photoMeta.json"), "utf8"));
  done = new Set(all ? [] : [...wdLabels, ...idsInFile(at("data_process/wikidata/faceTraitSkips.txt"))]);
}
console.log(priorityPlayers().filter((p) => photo[p.id] && !done.has(p.id)).map((p) => p.id).join("\n"));
