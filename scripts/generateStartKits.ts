/**
 * Offline start-kit generator.
 *
 * Builds N pre-computed worlds where the early-starting (European) leagues are fully
 * simulated up to the Brazilian kickoff (2027-02-05) — matches, AI training, transfers,
 * development — using the SAME pipeline as a normal day advance (presimulatePreStart).
 * Each kit is snapshotted into src/Data/startKits/kit-{n}/ and a new Brazilian career
 * copies one at random (see src/backend/startKits.ts), so the world feels fully
 * simulated without the ~6-minute runtime cost.
 *
 * Run:  bun run kits:generate [count]   (default 5)   — or: bun scripts/generateStartKits.ts [count]
 *
 * NOTE: each kit takes ~50 s to simulate with the full world; 5 kits ≈ 4 min. This is a one-time
 * offline build step — commit the resulting src/Data/startKits/ directory.
 */
import { mkdir } from "fs/promises";
import { fileURLToPath } from "node:url";
import { Glob } from "bun";
import { saveService } from "@/backend/SaveService";
import { presimulatePreStart } from "@/backend/advanceDay";
import { snapshotSaveToKit } from "@/backend/startKits";

const KITS_DIR = fileURLToPath(new URL("../src/Data/startKits", import.meta.url));
const DATA_SQUADS_DIR = fileURLToPath(new URL("../src/Data/squads", import.meta.url));
const EXAMPLE_SQUADS_DIR = fileURLToPath(new URL("../src/example_data/squads", import.meta.url));
const COUNT = Math.max(1, parseInt(process.argv[2] ?? "5", 10) || 5);

/**
 * A kit is built directly off `src/Data/squads` (via `saveService.createSave` + the normal squad
 * index), NOT off `src/example_data/squads`. The two must be byte-identical in shape (same squad
 * ids, same player ids, each player in exactly one squad) — a stale `src/Data/squads` left over
 * from `cp -R src/example_data/. src/Data/` (which never deletes) silently bakes duplicate
 * squads/players into every kit. `.claude/rules/data/espn-import.md` documents `rm -rf
 * src/Data/squads` (and `src/Data/logos/espn`) before every sync for this reason — this check is
 * the safety net in case that step is ever skipped.
 */
async function validateWorldMatchesExampleData(): Promise<void> {
  const glob = new Glob("**/*.json");
  const listSquadIds = async (dir: string): Promise<Set<string>> => {
    const ids = new Set<string>();
    for await (const rel of glob.scan({ cwd: dir })) ids.add(rel.replace(/\.json$/, "").split(/[/\\]/).pop()!);
    return ids;
  };
  const [dataIds, exampleIds] = await Promise.all([listSquadIds(DATA_SQUADS_DIR), listSquadIds(EXAMPLE_SQUADS_DIR)]);
  if (dataIds.size !== exampleIds.size) {
    throw new Error(
      `generateStartKits: src/Data/squads has ${dataIds.size} squad files, src/example_data/squads has ${exampleIds.size} — ` +
      `stale files from a previous world (removed/moved clubs). Run "rm -rf src/Data/squads src/Data/logos/espn" then re-sync before regenerating kits.`,
    );
  }
  const missing = [...exampleIds].filter((id) => !dataIds.has(id));
  const extra = [...dataIds].filter((id) => !exampleIds.has(id));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `generateStartKits: src/Data/squads and src/example_data/squads have different squad ids ` +
      `(${missing.length} missing, ${extra.length} extra, e.g. ${[...missing, ...extra].slice(0, 5).join(", ")}) — ` +
      `re-sync src/Data from src/example_data (after "rm -rf src/Data/squads") before regenerating kits.`,
    );
  }

  // Every player id must appear in exactly one squad file — a duplicate means a squad survives
  // under two ids/paths (e.g. an old and a new league folder) with the same players baked twice.
  const playerSquad = new Map<string, string>();
  const duplicates: string[] = [];
  for await (const rel of glob.scan({ cwd: DATA_SQUADS_DIR })) {
    const squad = (await Bun.file(`${DATA_SQUADS_DIR}/${rel}`).json()) as { id: string; players?: Array<{ id: string }> };
    for (const p of squad.players ?? []) {
      const prev = playerSquad.get(p.id);
      if (prev && prev !== squad.id) duplicates.push(`${p.id} (${prev} / ${squad.id})`);
      else playerSquad.set(p.id, squad.id);
    }
  }
  if (duplicates.length > 0) {
    throw new Error(
      `generateStartKits: ${duplicates.length} player id(s) appear in two squads, e.g. ${duplicates.slice(0, 5).join("; ")} — ` +
      `re-sync src/Data/squads from a clean "rm -rf" before regenerating kits.`,
    );
  }
}

await validateWorldMatchesExampleData();

// A real Brazilian club so currentDate resolves to the Brazilian season start.
// The kit world is club-agnostic apart from this one club being excluded from AI
// transfer-out during the pre-period (negligible across 150+ clubs).
const leagueData = (await Bun.file(fileURLToPath(new URL("../src/Data/leagueData.json", import.meta.url))).json()) as Array<{
  slug: string; name: string; standings: Array<{ squadId: string; name?: string; colors?: [string, string] }>;
}>;
const braA = leagueData.find((l) => l.slug === "brazil_serie_a");
if (!braA || braA.standings.length === 0) throw new Error("brazil_serie_a not found in leagueData");
const placeholder = braA.standings[0]!;

console.log(`Generating ${COUNT} start kit(s) with placeholder club ${placeholder.name ?? placeholder.squadId}…\n`);

for (let n = 1; n <= COUNT; n++) {
  const t0 = performance.now();
  const save = await saveService.createSave({
    leagueSlug: "brazil_serie_a",
    leagueName: braA.name,
    clubId: placeholder.squadId,
    clubName: placeholder.name ?? "Placeholder",
    clubColors: placeholder.colors ?? ["#888888", "#ffffff"],
  });

  process.stdout.write(`  kit-${n}: simulating ${save.currentDate} back to world start … `);
  const res = await presimulatePreStart(save.id);

  await mkdir(KITS_DIR, { recursive: true });
  await snapshotSaveToKit(save.id, `kit-${n}`);

  // Record what's in this kit for traceability (readable without unzipping).
  const transfers = await saveService.getTransfers(save.id);
  await Bun.write(`${KITS_DIR}/kit-${n}.manifest.json`, JSON.stringify({
    kit: `kit-${n}`,
    simulatedDays: res.days,
    leaguesCaughtUp: res.leagues,
    transfers: transfers.length,
    targetDate: save.currentDate,
  }, null, 2));

  await saveService.deleteSave(save.id);
  console.log(`done — ${res.days} days, ${transfers.length} transfers, ${((performance.now() - t0) / 1000).toFixed(0)}s`);
}

console.log(`\nWrote ${COUNT} kit(s) to src/Data/startKits/. Commit that directory.`);
