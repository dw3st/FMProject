/**
 * Scenario Storage — persists scenario results under debug/balance/lab/.
 *
 * Layout:
 *   debug/balance/lab/
 *     index.json              ← ScenarioIndex
 *     {scenarioId}.json       ← ScenarioResult (full)
 */

import { mkdir, readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type {
  ScenarioIndex,
  ScenarioIndexEntry,
  ScenarioResult,
} from "@/lab/types";

const ROOT = "debug/balance/lab";
const INDEX_PATH = join(ROOT, "index.json");

async function ensureDir(): Promise<void> {
  await mkdir(ROOT, { recursive: true });
}

function emptyIndex(): ScenarioIndex {
  return { version: 1, entries: [] };
}

export async function readIndex(): Promise<ScenarioIndex> {
  await ensureDir();
  const file = Bun.file(INDEX_PATH);
  if (!(await file.exists())) return emptyIndex();
  try {
    const data = (await file.json()) as ScenarioIndex;
    if (!data?.entries) return emptyIndex();
    return data;
  } catch {
    return emptyIndex();
  }
}

async function writeIndex(idx: ScenarioIndex): Promise<void> {
  await ensureDir();
  await Bun.write(INDEX_PATH, JSON.stringify(idx, null, 2));
}

export async function listScenarios(): Promise<ScenarioIndexEntry[]> {
  const idx = await readIndex();
  return [...idx.entries].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

export async function loadScenario(id: string): Promise<ScenarioResult | null> {
  await ensureDir();
  const path = join(ROOT, `${id}.json`);
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  return (await file.json()) as ScenarioResult;
}

export async function saveScenario(result: ScenarioResult): Promise<ScenarioIndexEntry> {
  await ensureDir();
  const id = result.scenario.id;
  const file = `${id}.json`;
  await Bun.write(join(ROOT, file), JSON.stringify(result, null, 2));

  const variantIds = new Set<string>();
  result.scenario.variants.forEach((v) => variantIds.add(v.id));

  const entry: ScenarioIndexEntry = {
    id,
    name: result.scenario.name,
    startedAt: result.startedAt,
    matchesPerPair: result.scenario.matchesPerPair,
    variantCount: variantIds.size,
    pairCount: result.pairs.length,
    totalDurationMs: result.totalDurationMs,
    file,
  };

  const idx = await readIndex();
  idx.entries = idx.entries.filter((e) => e.id !== id);
  idx.entries.push(entry);
  await writeIndex(idx);
  return entry;
}

export async function deleteScenario(id: string): Promise<boolean> {
  await ensureDir();
  const path = join(ROOT, `${id}.json`);
  try {
    await unlink(path);
  } catch {
    // file may already be gone
  }
  const idx = await readIndex();
  const before = idx.entries.length;
  idx.entries = idx.entries.filter((e) => e.id !== id);
  if (idx.entries.length !== before) {
    await writeIndex(idx);
    return true;
  }
  return false;
}

/**
 * One-time-ish discovery: rebuild the index from any orphaned result files.
 * Useful if the user drops a JSON in manually or the index gets out of sync.
 */
export async function rebuildIndex(): Promise<ScenarioIndex> {
  await ensureDir();
  const files = await readdir(ROOT);
  const entries: ScenarioIndexEntry[] = [];
  for (const f of files) {
    if (f === "index.json" || !f.endsWith(".json")) continue;
    try {
      const buf = await readFile(join(ROOT, f), "utf8");
      const r = JSON.parse(buf) as ScenarioResult;
      const variantIds = new Set<string>();
      r.scenario.variants.forEach((v) => variantIds.add(v.id));
      entries.push({
        id: r.scenario.id,
        name: r.scenario.name,
        startedAt: r.startedAt,
        matchesPerPair: r.scenario.matchesPerPair,
        variantCount: variantIds.size,
        pairCount: r.pairs.length,
        totalDurationMs: r.totalDurationMs,
        file: f,
      });
    } catch {
      // skip malformed files
    }
  }
  const idx: ScenarioIndex = { version: 1, entries };
  await writeIndex(idx);
  return idx;
}
