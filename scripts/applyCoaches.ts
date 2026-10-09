/**
 * Applies the head coaches to the world in `src/example_data/squads`: manual corrections
 * (`data_process/curated/coachCorrections.json`) > Wikidata (`data_process/wikidata/coaches.json`) > the coach the
 * squad already has. Replaces `squad.coach` whole (`{ id, name, nationality?, age? }`, id stable by club + name).
 * Runs right after `bun scripts/applyClubNameCorrections.ts` (`.claude/rules/data/espn-import.md` → "Regenerar").
 * Fails on a squad id missing from the world (or repeated), an empty name or an HTML entity. Idempotent; writes
 * only the files that change, in their original format.
 *
 *   bun scripts/applyCoaches.ts
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { formatLike } from "@/../scripts/curated/corrections";
import { applyCoach, coachFor, locateCoachSquads, parseCoachCorrections, parseWikidataCoaches } from "@/../scripts/curated/coaches";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SQUADS = join(ROOT, "src", "example_data", "squads");
const WIKIDATA = join(ROOT, "data_process", "wikidata", "coaches.json");
const CORRECTIONS = join(ROOT, "data_process", "curated", "coachCorrections.json");

type Squad = { id: string; name: string; coach?: { name?: string } } & Record<string, unknown>;

function listSquadFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...listSquadFiles(p));
    else if (e.name.endsWith(".json")) out.push(p);
  }
  return out.sort();
}

const wikidata = parseWikidataCoaches(JSON.parse(readFileSync(WIKIDATA, "utf-8")));
const corrections = parseCoachCorrections(JSON.parse(readFileSync(CORRECTIONS, "utf-8")));

const files = new Map<string, { text: string; squad: Squad }>();
for (const path of listSquadFiles(SQUADS)) {
  const text = readFileSync(path, "utf-8");
  files.set(path, { text, squad: JSON.parse(text) as Squad });
}
const squadsByPath = new Map([...files].map(([k, f]) => [k, f.squad]));
locateCoachSquads(squadsByPath, Object.keys(wikidata), "wikidata/coaches.json");
locateCoachSquads(squadsByPath, Object.keys(corrections), "coachCorrections.json");

let written = 0;
const perLeague = new Map<string, { clubs: number; wikidata: number; manual: number; kept: number }>();
const rows: string[] = [];
for (const [path, file] of files) {
  const league = relative(SQUADS, path).replace(/\\/g, "/").split("/")[0]!;
  const stat = perLeague.get(league) ?? { clubs: 0, wikidata: 0, manual: 0, kept: 0 };
  stat.clubs++;
  const id = file.squad.id;
  const coach = coachFor(id, wikidata[id], corrections[id]);
  if (!coach) { stat.kept++; perLeague.set(league, stat); continue; }
  if (corrections[id]) stat.manual++; else stat.wikidata++;
  perLeague.set(league, stat);
  const r = applyCoach(file.squad, coach);
  if (r.changed) {
    writeFileSync(path, formatLike(file.text, r.squad));
    written++;
    rows.push(`* ${id.padEnd(26)} ${league.padEnd(40)} ${file.squad.coach?.name ?? "—"} → ${coach.name}`);
  }
}

for (const row of rows) console.log(row);
console.log("\nliga: clubes / Wikidata / correção manual / mantido");
for (const [l, s] of [...perLeague].sort()) console.log(`${l.padEnd(42)} ${s.clubs} / ${s.wikidata} / ${s.manual} / ${s.kept}`);
console.log(`${written} elenco(s) gravado(s).`);
