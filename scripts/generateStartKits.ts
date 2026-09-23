/**
 * Offline start-kit generator.
 *
 * Builds N pre-computed worlds where the early-starting (European) leagues are fully
 * simulated up to the Brazilian kickoff (2025-02-05) — matches, AI training, transfers,
 * development — using the SAME pipeline as a normal day advance (presimulatePreStart).
 * Each kit is snapshotted into src/Data/startKits/kit-{n}/ and a new Brazilian career
 * copies one at random (see src/backend/startKits.ts), so the world feels fully
 * simulated without the ~6-minute runtime cost.
 *
 * Run:  bun run kits:generate [count]   (default 5)   — or: bun scripts/generateStartKits.ts [count]
 *
 * NOTE: each kit takes minutes to simulate; 5 kits ≈ 25-35 min. This is a one-time
 * offline build step — commit the resulting src/Data/startKits/ directory.
 */
import { mkdir } from "fs/promises";
import { saveService } from "@/backend/SaveService";
import { presimulatePreStart } from "@/backend/advanceDay";
import { snapshotSaveToKit } from "@/backend/startKits";

const KITS_DIR = new URL("../src/Data/startKits", import.meta.url).pathname;
const COUNT = Math.max(1, parseInt(process.argv[2] ?? "5", 10) || 5);

// A real Brazilian club so currentDate resolves to the Brazilian season start.
// The kit world is club-agnostic apart from this one club being excluded from AI
// transfer-out during the pre-period (negligible across 150+ clubs).
const leagueData = (await Bun.file(new URL("../src/Data/leagueData.json", import.meta.url).pathname).json()) as Array<{
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
    budget: 0,
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
