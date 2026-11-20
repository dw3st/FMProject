/**
 * Public world measurement (multiplayer part 5b): 10 seats, 6 slot steps; prints time, days run and RSS per step.
 * Run alone: `bun scripts/public-world-measure.ts`. Uses a disposable runtime dir.
 * Stage 22: `SEATS=40` (the clubs of each of the 10 leagues in turn, at most 40), `STEPS=n`; the match pool's jobs and
 * engine time per step are printed (`MATCH_WORKERS` sets the pool).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "fm-public-measure-"));
process.env.RUNTIME_DATA_DIR = tmp;

const { db } = await import("@/backend/db");
const { saveService } = await import("@/backend/SaveService");
const { addSeat } = await import("@/backend/seats");
const { defaultGroupDeps, setKickScheduler, waitWorld } = await import("@/backend/groupAdvance");
const { ensurePublicWorld, publicSlotTick } = await import("@/backend/worlds/publicWorld");
const { deleteWorld } = await import("@/backend/worlds/worldLifecycle");
const { PUBLIC_WORLD } = await import("@/Domain/multiplayer/publicWorldConfig");
const { matchPoolStats } = await import("@/backend/matchPool");
const SEATS = Math.min(40, Number(process.env.SEATS ?? 10));
const STEPS = Number(process.env.STEPS ?? 6);

const mb = () => Math.round(process.memoryUsage().rss / 1048576);
const version = `measure-${Date.now()}`;
let saveId: string | null = null;
try {
  setKickScheduler(null);
  saveId = await ensurePublicWorld({ version, now: () => Date.parse("2026-10-26T12:00:00Z"), sweep: false });
  const index = await saveService.getSquadIndex(saveId);
  for (let i = 0; i < SEATS; i++) {
    const slug = PUBLIC_WORLD.LEAGUES[i % PUBLIC_WORLD.LEAGUES.length]!;
    const club = index.inLeague(slug)[Math.floor(i / PUBLIC_WORLD.LEAGUES.length)];
    if (!club) throw new Error(`no club ${i} in ${slug}`);
    await addSeat(saveId, {
      userId: `measure-user-${i}`, clubId: club.squadId, role: "member",
      manager: { name: `Tester ${i}`, nationalityIso: "br", backgroundId: "former-player" },
    });
  }
  console.log(`seats: ${SEATS}, leagues: ${PUBLIC_WORLD.LEAGUES.length}, pool ${matchPoolStats().size}, start rss ${mb()} MB`);

  let t = Date.parse("2026-10-26T16:30:00Z"); // 13:30 Brasilia: the 13:00 slot is due
  const gaps = [5, 4, 11, 4, 5, 4].map((h) => h * 3600_000);
  console.log("step | wall ms | days | from -> to | rss MB | pool jobs | engine s");
  for (let step = 1; step <= STEPS; step++) {
    const pool0 = matchPoolStats();
    const before = (await saveService.getMeta(saveId))!.currentDate!;
    const deps = { ...defaultGroupDeps, now: () => t };
    const t0 = performance.now();
    const started = await publicSlotTick(saveId, deps);
    await waitWorld(saveId);
    const ms = Math.round(performance.now() - t0);
    const after = (await saveService.getMeta(saveId))!.currentDate!;
    const days = Math.round((Date.parse(after) - Date.parse(before)) / 86400_000);
    const pool1 = matchPoolStats();
    console.log(`${step} | ${ms} | ${days} | ${before} -> ${after}${started ? "" : " (no step)"} | ${mb()} | ${pool1.jobs - pool0.jobs} | ${((pool1.busyMs - pool0.busyMs) / 1000).toFixed(0)}`);
    t += gaps[(step - 1) % gaps.length]!;
  }
} finally {
  if (saveId) await deleteWorld(saveId, "server").catch(() => saveService.deleteSave(saveId!).catch(() => {}));
  db.prepare("DELETE FROM public_editions WHERE version = ?").run(version);
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* db still open on Windows */ }
}
process.exit(0);
