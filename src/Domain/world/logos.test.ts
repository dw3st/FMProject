import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { logoUrlFromIndex } from "@/Domain/world/logos";

test("logoUrlFromIndex", () => {
  const idx = { "33": "premier_league/manchester_united", es_1: "espn/es_1" };
  expect(logoUrlFromIndex(idx, "33")).toBe("/api/logos/premier_league/manchester_united");
  expect(logoUrlFromIndex(idx, "es_1")).toBe("/api/logos/espn/es_1");
  expect(logoUrlFromIndex(idx, "nope")).toBeUndefined();
});

// Regression for issues #25/#26: two different clubs (e.g. Figueirense and
// Fluminense, or Athletic Club Brazil and Athletic Bilbao) ended up pointing at
// byte-identical crest files, because data_process/pipeline.py's logo matcher
// searched a single cross-league map (exact and fuzzy) instead of staying scoped
// to each club's own league source directory. Two DIFFERENT native squadIds must
// never resolve to identical crest file content. `espn/*` entries are excluded —
// the ESPN importer already has its own club-matching path and legitimately
// shares crests only when it's truly the same club (see espn-import.md).
test("no two different native squads share byte-identical crest content", () => {
  const indexPath = join(import.meta.dir, "../../example_data/logoIndex.json");
  if (!existsSync(indexPath)) return; // nothing to check in this checkout
  const index: Record<string, string> = JSON.parse(readFileSync(indexPath, "utf8"));
  const logosRoot = join(import.meta.dir, "../../example_data/logos");

  const hashBySquad = new Map<string, string>();
  for (const [squadId, path] of Object.entries(index)) {
    if (path.startsWith("espn/")) continue;
    const [folder, stem] = path.split("/");
    if (!folder || !stem) continue;
    const dir = join(logosRoot, folder);
    if (!existsSync(dir)) continue;
    const file = readdirSync(dir).find((f) => f.startsWith(`${stem}.`));
    if (!file) continue;
    const bytes = readFileSync(join(dir, file));
    hashBySquad.set(squadId, createHash("md5").update(bytes).digest("hex"));
  }

  const bySquadForHash = new Map<string, string[]>();
  for (const [squadId, hash] of hashBySquad) {
    const list = bySquadForHash.get(hash) ?? [];
    list.push(squadId);
    bySquadForHash.set(hash, list);
  }

  const collisions = [...bySquadForHash.entries()].filter(([, squadIds]) => squadIds.length > 1);
  const details = collisions.map(([hash, squadIds]) => `${hash}: ${squadIds.map((id) => `${id} -> ${index[id]}`).join(", ")}`);
  expect(details).toEqual([]);
});
