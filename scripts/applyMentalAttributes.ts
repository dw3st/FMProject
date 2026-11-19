/**
 * Fills the mental attributes (decisions, composure, flair, anticipation; `.claude/rules/game/mental.md`) of every
 * player of the base world that lacks them, derived from his other attributes, age, id and personality
 * (`deriveMental`, the same derivation the DAL reads use). Last data step of the world chain
 * (`.claude/rules/data/espn-import.md` → "Regenerar"), after the curated corrections and before `kits:generate`.
 * Idempotent (a player with the keys is untouched); writes only the squads that change, in their original format.
 *
 *   bun scripts/applyMentalAttributes.ts [dir=src/example_data/squads]
 */
import { Glob } from "bun";
import { fillSquadMentalInPlace, hasMental } from "@/Domain/mental/mental";
import type { Squad } from "@/types/playerTypes";

const dir = process.argv[2] ?? "src/example_data/squads";
if (/(^|[\/])src[\/]Data([\/]|$)/.test(dir)) {
  console.error("refusing to write the runtime copy (src/Data): run on src/example_data and sync at release");
  process.exit(1);
}
let squads = 0;
let changed = 0;
let players = 0;
for await (const f of new Glob(`${dir}/*/*.json`).scan(".")) {
  const text = await Bun.file(f).text();
  const squad = JSON.parse(text) as Squad;
  squads++;
  const missing = [...squad.players, ...(squad.youth ?? [])].filter((p) => !hasMental(p.stats)).length;
  if (missing === 0) continue;
  fillSquadMentalInPlace(squad);
  players += missing;
  const indent = /^\{\r?\n( +)"/.exec(text)?.[1]?.length ?? 0;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  let out = indent ? JSON.stringify(squad, null, indent) : JSON.stringify(squad);
  if (eol === "\r\n") out = out.replace(/\n/g, "\r\n");
  await Bun.write(f, out + (text.endsWith("\n") ? eol : ""));
  changed++;
}
console.log(`${dir}: ${squads} squads, ${changed} changed, ${players} players filled`);
