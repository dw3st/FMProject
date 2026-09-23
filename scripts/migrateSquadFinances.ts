/**
 * One-off migration: unify squad finances in src/Data/squads/**.
 *
 * Strips legacy `wagesBudget` / `transferBudget` and writes a single `budget`
 * field (sum of the two) so the shape matches the new ClubFinances interface.
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { join } from "path";

const SQUADS_DIR = join(import.meta.dir, "..", "src", "Data", "squads");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (entry.endsWith(".json")) {
      out.push(full);
    }
  }
  return out;
}

let changed = 0;
let skipped = 0;

for (const file of walk(SQUADS_DIR)) {
  const raw = readFileSync(file, "utf-8");
  const data = JSON.parse(raw);
  const fin = data.finances;
  if (!fin || typeof fin !== "object") { skipped++; continue; }

  const hasLegacy = "wagesBudget" in fin || "transferBudget" in fin;
  if (!hasLegacy && "budget" in fin) { skipped++; continue; }

  const wages    = Number(fin.wagesBudget    ?? 0);
  const transfer = Number(fin.transferBudget ?? 0);
  const budget   = Number(fin.budget ?? (wages + transfer));

  const next = {
    score:        fin.score ?? 0,
    broadcasting: fin.broadcasting ?? 0,
    commercial:   fin.commercial ?? 0,
    total:        fin.total ?? 0,
    budget,
    followers:    fin.followers ?? 0,
  };

  data.finances = next;
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  changed++;
}

console.log(`Migrated: ${changed}, unchanged: ${skipped}`);
