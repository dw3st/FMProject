/**
 * Applies `data_process/curated/followerCorrections.json` (built by `scripts/curated/buildFollowerCorrections.ts`) to
 * the squads of the base world. Idempotent; writes only the squads that change, in their original format.
 *
 *   bun scripts/applyFollowerCorrections.ts [dir=src/example_data/squads]
 */
import { Glob } from "bun";

const dir = process.argv[2] ?? "src/example_data/squads";
const fixes = (await Bun.file("data_process/curated/followerCorrections.json").json()) as Record<string, { name: string; followers: number }>;
const seen = new Set<string>();
let changed = 0;
for await (const f of new Glob(`${dir}/*/*.json`).scan(".")) {
  const text = await Bun.file(f).text();
  const squad = JSON.parse(text);
  const fix = fixes[String(squad.id)];
  if (!fix) continue;
  seen.add(String(squad.id));
  if (!squad.finances || squad.finances.followers === fix.followers) continue;
  squad.finances.followers = fix.followers;
  const indent = /^\{\r?\n( +)"/.exec(text)?.[1]?.length ?? 0;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  let out = indent ? JSON.stringify(squad, null, indent) : JSON.stringify(squad);
  if (eol === "\r\n") out = out.replace(/\n/g, "\r\n");
  await Bun.write(f, out + (text.endsWith("\n") ? eol : ""));
  changed++;
}
const unknown = Object.keys(fixes).filter((id) => !seen.has(id));
if (unknown.length > 0) console.warn(`not in ${dir}: ${unknown.length} ids (${unknown.slice(0, 5).join(", ")}…)`);
console.log(`${dir}: ${changed} squads changed`);
