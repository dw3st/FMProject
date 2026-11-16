/**
 * One-off repair (tester report, A. Davies shown as a right wing-back): retired records written before 2026-11-13
 * dropped the player's fixed natural position. Fills it back from the base world (`src/example_data/squads`) by
 * player id. Only records without one are touched; nothing else changes.
 *
 *   bun scripts/repairRetiredNatural.ts <saveId> [--dry]
 */
import { readdirSync, readFileSync } from "node:fs";
import { RUNTIME_DATA_DIR } from "@/backend/runtimeDir";
import type { RetiredPlayer, Squad } from "@/types/playerTypes";

const saveId = process.argv[2];
const dry = process.argv.includes("--dry");
if (!saveId || !/^[0-9a-f-]{36}$/.test(saveId)) throw new Error("usage: bun scripts/repairRetiredNatural.ts <saveId> [--dry]");

const natural = new Map<string, string>();
const root = "src/example_data/squads";
for (const lg of readdirSync(root)) for (const f of readdirSync(`${root}/${lg}`)) {
  if (!f.endsWith(".json")) continue;
  const squad = JSON.parse(readFileSync(`${root}/${lg}/${f}`, "utf8")) as Squad;
  for (const p of squad.players) if (p.naturalPosition) natural.set(p.id, p.naturalPosition);
}

const path = `${RUNTIME_DATA_DIR}/saves/${saveId}/retired.json`;
const retired = (await Bun.file(path).json()) as RetiredPlayer[];
let fixed = 0;
const out = retired.map((r) => {
  if (r.naturalPosition) return r;
  const pos = natural.get(r.id);
  if (!pos) return r;
  fixed++;
  return { ...r, naturalPosition: pos };
});
console.log(`${retired.length} retired, ${fixed} given their natural position back${dry ? " (dry run)" : ""}`);
if (!dry && fixed > 0) await Bun.write(path, JSON.stringify(out));
