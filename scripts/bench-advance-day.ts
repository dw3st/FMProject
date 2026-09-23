/**
 * Benchmark the live `advanceOneDay` against the full imported world.
 *
 * Creates a save the same way the new-game wizard does (POST /api/saves →
 * SaveService.createSave + applyBroadcasting, then POST /presimulate →
 * applyRandomStartKit) for a Premier League career with the first club, advances
 * N days (default 14) exactly as the live route does, prints a per-day table and
 * deletes the save at the end (also on failure).
 *
 * Run:  bun scripts/bench-advance-day.ts [--days 14] [--buffered | --compare]
 *
 *   (default)   each day runs straight on FileSystemDAL (the pre-buffer live route)
 *   --buffered  each day runs in its own BufferingSaveDAL, flushed when the day
 *               succeeds — exactly what POST /api/advance-day/:saveId does
 *   --compare   snapshot the fresh save, run unbuffered, restore the snapshot, run
 *               buffered, and compare the deterministic outcomes of both runs
 *
 * Timing is instrumented inside this script only: engine / quickSim / training /
 * market / standings functions are wrapped via `mock.module` before the backend is
 * imported, and the DAL is wrapped in a counting proxy. No engine code is changed.
 */
import { mock } from "bun:test";
import { fileURLToPath } from "node:url";

// Windows-safe default for the runtime dir; must be set before backend modules load.
process.env.RUNTIME_DATA_DIR ||= fileURLToPath(new URL("../src/Data", import.meta.url));

const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const DAYS = Math.max(1, parseInt(argValue("--days") ?? "14", 10) || 14);
const MODE: "unbuffered" | "buffered" | "compare" = args.includes("--compare")
  ? "compare"
  : args.includes("--buffered")
    ? "buffered"
    : "unbuffered";

// ── Function timers (installed before the backend is imported) ────────────────

type Timer = { calls: number; ms: number };
const timers: Record<string, Timer> = {};
const timer = (k: string): Timer => (timers[k] ??= { calls: 0, ms: 0 });

function timed<F extends (...a: never[]) => unknown>(key: string, fn: F): F {
  return ((...a: Parameters<F>) => {
    const t = timer(key);
    const t0 = performance.now();
    try {
      return fn(...a);
    } finally {
      t.ms += performance.now() - t0;
      t.calls++;
    }
  }) as F;
}

async function wrapModule(specifier: string, wraps: Record<string, string>): Promise<void> {
  const real = (await import(specifier)) as Record<string, unknown>;
  const replaced: Record<string, unknown> = { ...real };
  for (const [exportName, key] of Object.entries(wraps)) {
    replaced[exportName] = timed(key, real[exportName] as (...a: never[]) => unknown);
  }
  mock.module(specifier, () => replaced);
}

await wrapModule("@/GameEngine/Domain/SimulateMatch", { simulateMatch: "fullMatch" });
await wrapModule("@/Domain/advanceDay/quickSim", { quickSimMatch: "fastMatch" });
await wrapModule("@/Domain/advanceDay/dailyTraining", { buildTrainingEvent: "training" });
await wrapModule("@/Domain/advanceDay/dailyRest", { buildRestEvent: "rest" });
await wrapModule("@/Domain/transfer/marketRotation", { dailyMarketTick: "marketTick" });
await wrapModule("@/Domain/season/computeStandings", { computeStandings: "standings" });

// ── Backend (imported only after the mocks are in place) ─────────────────────

const { SaveService, saveService } = await import("@/backend/SaveService");
const { FileSystemDAL } = await import("@/backend/dal/FileSystemDAL");
const { BufferingSaveDAL } = await import("@/backend/dal/BufferingSaveDAL");
const { RUNTIME_DATA_DIR } = await import("@/backend/runtimeDir");
const { advanceOneDay } = await import("@/backend/advanceDay");
const { applyRandomStartKit } = await import("@/backend/startKits");
const { applyBroadcasting } = await import("@/backend/FinancialService");
type ISaveDAL = import("@/backend/dal/ISaveDAL").ISaveDAL;

// ── Counting DAL proxy ────────────────────────────────────────────────────────

const IO_CATS = ["squadRead", "squadWrite", "squadList", "rounds", "dayLog", "other"] as const;
type IoCat = (typeof IO_CATS)[number];
const io = {
  squadReads: 0,      // squad files parsed (readSquad hits + every squad in a list call)
  squadReadMisses: 0, // readSquad calls that found no file (slug → stem fallback)
  squadWrites: 0,
  listAllSquads: 0,
  busyMs: Object.fromEntries(IO_CATS.map((c) => [c, 0])) as Record<IoCat, number>,
};
const inflight = Object.fromEntries(IO_CATS.map((c) => [c, { n: 0, since: 0 }])) as Record<
  IoCat,
  { n: number; since: number }
>;
function ioCategory(method: string): IoCat {
  if (method === "readSquad" || method === "squadExists") return "squadRead";
  if (method === "writeSquad") return "squadWrite";
  if (method === "listAllSquads" || method === "listSquadsInLeague" || method === "listSquadFiles") return "squadList";
  if (method === "readRound" || method === "writeRound") return "rounds";
  if (method === "readDayLog" || method === "writeDayLog") return "dayLog";
  return "other";
}

function countingDAL(inner: ISaveDAL): ISaveDAL {
  return new Proxy(inner, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      const method = String(prop);
      return async (...a: unknown[]) => {
        const cat = ioCategory(method);
        const slot = inflight[cat];
        if (slot.n++ === 0) slot.since = performance.now();
        try {
          const result = await (value as (...x: unknown[]) => Promise<unknown>).apply(target, a);
          if (method === "readSquad") {
            if (result) io.squadReads++;
            else io.squadReadMisses++;
          } else if (method === "writeSquad") io.squadWrites++;
          else if (method === "listAllSquads" || method === "listSquadsInLeague" || method === "listSquadFiles") {
            io.squadReads += (result as unknown[]).length;
            if (method !== "listSquadsInLeague") io.listAllSquads++;
          }
          return result;
        } finally {
          if (--slot.n === 0) io.busyMs[cat] += performance.now() - slot.since;
        }
      };
    },
  });
}

function resetCounters(): void {
  for (const k of Object.keys(timers)) delete timers[k];
  io.squadReads = io.squadReadMisses = io.squadWrites = io.listAllSquads = 0;
  for (const k of Object.keys(io.busyMs) as IoCat[]) io.busyMs[k] = 0;
}

// ── Save creation (mirrors the wizard) ────────────────────────────────────────

type LeagueEntry = { slug: string; name: string; standings: Array<{ squadId: string; name?: string; colors?: [string, string] }> };
const leagueData = (await Bun.file(
  fileURLToPath(new URL("../src/Data/leagueData.json", import.meta.url)),
).json()) as LeagueEntry[];
const databases = (await Bun.file(
  fileURLToPath(new URL("../src/Data/databases.json", import.meta.url)),
).json()) as Array<{ id: string; name: string; version: string; startDate: string }>;

async function createBenchSave(): Promise<string> {
  const pl = leagueData.find((l) => l.slug === "premier_league");
  const club = pl?.standings[0];
  if (!pl || !club) throw new Error("premier_league not found in leagueData");
  const db = databases[0]!;
  const t0 = performance.now();
  const meta = await saveService.createSave({
    leagueSlug: pl.slug,
    leagueName: pl.name,
    clubId: club.squadId,
    clubName: club.name ?? club.squadId,
    clubColors: club.colors ?? ["#888888", "#ffffff"],
    budget: 0,
    database: { id: db.id, name: db.name, version: db.version, startDate: db.startDate },
    manager: { name: "Bench Manager", nationalityIso: "gb", backgroundId: "former-player" },
  });
  await applyBroadcasting(meta.id, meta, meta.leagueSlug, meta.clubId);
  const kit = await applyRandomStartKit(meta.id);
  console.log(
    `Save ${meta.id} — ${club.name} (${pl.name}), start ${meta.currentDate}, ` +
      `${meta.activeLeagues?.length ?? 0} active leagues, kit: ${kit.applied ? kit.kit : kit.reason}, ` +
      `created in ${(performance.now() - t0).toFixed(0)} ms\n`,
  );
  return meta.id;
}

// ── Day loop ──────────────────────────────────────────────────────────────────

type DayRow = {
  date: string;
  ms: number;
  exFullMs: number;
  full: number;
  fast: number;
  reads: number;
  misses: number;
  writes: number;
  listAll: number;
  matchEvents: number;
  newDate: string;
  profile: Record<string, number>;
};

async function runDays(saveId: string, buffered: boolean): Promise<DayRow[]> {
  const plain = new SaveService(new FileSystemDAL());
  const rows: DayRow[] = [];
  for (let d = 0; d < DAYS; d++) {
    const date = (await plain.getMeta(saveId))?.currentDate ?? "?";
    resetCounters();
    const t0 = performance.now();
    let flushMs = 0;
    let outcome: Awaited<ReturnType<typeof advanceOneDay>>;
    if (buffered) {
      // Mirrors the live route: one buffer per day, flushed only on success.
      const buffer = new BufferingSaveDAL(countingDAL(new FileSystemDAL()));
      outcome = await advanceOneDay(new SaveService(buffer), saveId);
      if (outcome.ok) {
        const f0 = performance.now();
        await buffer.flush();
        flushMs = performance.now() - f0;
      }
    } else {
      outcome = await advanceOneDay(new SaveService(countingDAL(new FileSystemDAL())), saveId);
    }
    const ms = performance.now() - t0;
    if (!outcome.ok) throw new Error(`advanceOneDay failed on ${date}: ${outcome.status} ${outcome.error}`);
    const events = (outcome.payload.events as Array<{ kind: string }>) ?? [];
    const fullMs = timers.fullMatch?.ms ?? 0;
    rows.push({
      date,
      ms,
      exFullMs: ms - fullMs,
      full: timers.fullMatch?.calls ?? 0,
      fast: timers.fastMatch?.calls ?? 0,
      reads: io.squadReads,
      misses: io.squadReadMisses,
      writes: io.squadWrites,
      listAll: io.listAllSquads,
      matchEvents: events.filter((e) => e.kind === "match").length,
      newDate: String(outcome.payload.newDate),
      profile: {
        flush: flushMs,
        fullMatch: fullMs,
        fastMatch: timers.fastMatch?.ms ?? 0,
        training: (timers.training?.ms ?? 0) + (timers.rest?.ms ?? 0),
        marketTick: timers.marketTick?.ms ?? 0,
        standings: timers.standings?.ms ?? 0,
        ioSquadRead: io.busyMs.squadRead,
        ioSquadWrite: io.busyMs.squadWrite,
        ioSquadList: io.busyMs.squadList,
        ioRounds: io.busyMs.rounds,
        ioDayLog: io.busyMs.dayLog,
        ioOther: io.busyMs.other,
      },
    });
  }
  return rows;
}

// ── Reporting ─────────────────────────────────────────────────────────────────

const pad = (v: string | number, n: number) => String(v).padStart(n);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function printTable(title: string, rows: DayRow[]): void {
  console.log(`\n=== ${title} ===`);
  console.log(
    `${"date".padEnd(10)} ${pad("ms", 7)} ${pad("ms ex-full", 10)} ${pad("full", 4)} ${pad("fast", 5)} ` +
      `${pad("sq reads", 8)} ${pad("misses", 6)} ${pad("sq writes", 9)} ${pad("listAll", 7)}`,
  );
  for (const r of rows) {
    console.log(
      `${r.date.padEnd(10)} ${pad(r.ms.toFixed(0), 7)} ${pad(r.exFullMs.toFixed(0), 10)} ${pad(r.full, 4)} ${pad(r.fast, 5)} ` +
        `${pad(r.reads, 8)} ${pad(r.misses, 6)} ${pad(r.writes, 9)} ${pad(r.listAll, 7)}`,
    );
  }
  const userDays = rows.filter((r) => r.full > 0);
  const otherDays = rows.filter((r) => r.full === 0);
  const line = (label: string, rs: DayRow[]) =>
    console.log(
      `${label.padEnd(26)} n=${pad(rs.length, 2)}  avg ms ${pad(avg(rs.map((r) => r.ms)).toFixed(0), 6)}  ` +
        `avg ex-full ${pad(avg(rs.map((r) => r.exFullMs)).toFixed(0), 6)}  avg fast ${pad(avg(rs.map((r) => r.fast)).toFixed(1), 5)}`,
    );
  line("user-league matchdays", userDays);
  line("other days", otherDays);
  line("all days", rows);

  const keys = Object.keys(rows[0]?.profile ?? {});
  console.log("\nper-day profile (ms):");
  for (const r of rows) {
    console.log(`  ${r.date}: ${keys.map((k) => `${k} ${r.profile[k]!.toFixed(0)}`).join(" | ")}`);
  }
  console.log("\nprofile (avg ms/day, I/O = wall time with calls in flight):");
  for (const [label, rs] of [["user-league matchdays", userDays], ["other days", otherDays]] as const) {
    if (rs.length === 0) continue;
    const parts = keys.map((k) => `${k} ${avg(rs.map((r) => r.profile[k]!)).toFixed(0)}`);
    // flush I/O is already counted in the io* buckets (the flush writes go through the counting DAL).
    const accounted = avg(rs.map((r) => keys.reduce((s, k) => (k === "flush" ? s : s + r.profile[k]!), 0)));
    parts.push(`unaccounted ${(avg(rs.map((r) => r.ms)) - accounted).toFixed(0)}`);
    console.log(`  ${label}: ${parts.join(" | ")}`);
  }
}

// ── Behaviour summary (read back from disk with a plain DAL) ─────────────────

type WorldSummary = {
  currentDate: string;
  leagues: Record<string, { standingsRows: number; mpSum: number; played: number }>;
  missingStandings: string[];
  transfers: number;
  squadFiles: number;
};

async function summarizeWorld(saveId: string): Promise<WorldSummary> {
  const plain = new SaveService(new FileSystemDAL());
  const meta = await plain.getMeta(saveId);
  const leagues: WorldSummary["leagues"] = {};
  const missingStandings: string[] = [];
  for (const l of meta?.activeLeagues ?? []) {
    const standings = await plain.getLeagueStandings(saveId, l.leagueSlug);
    if (!standings) missingStandings.push(l.leagueSlug);
    const fixtures = await plain.getAllFixturesForLeague(saveId, l.leagueSlug);
    leagues[l.leagueSlug] = {
      standingsRows: standings?.length ?? 0,
      mpSum: (standings ?? []).reduce((s, r) => s + r.mp, 0),
      played: fixtures.filter((f) => f.played).length,
    };
  }
  return {
    currentDate: meta?.currentDate ?? "?",
    leagues,
    missingStandings,
    transfers: (await plain.getTransfers(saveId)).length,
    squadFiles: (await plain.getAllSquads(saveId)).length,
  };
}

function compareRuns(
  a: { rows: DayRow[]; world: WorldSummary },
  b: { rows: DayRow[]; world: WorldSummary },
): boolean {
  const problems: string[] = [];
  for (let i = 0; i < Math.max(a.rows.length, b.rows.length); i++) {
    const ra = a.rows[i];
    const rb = b.rows[i];
    if (!ra || !rb) { problems.push(`day ${i}: missing in one run`); continue; }
    if (ra.date !== rb.date || ra.newDate !== rb.newDate)
      problems.push(`day ${i}: dates ${ra.date}→${ra.newDate} vs ${rb.date}→${rb.newDate}`);
    if (ra.matchEvents !== rb.matchEvents || ra.full !== rb.full || ra.fast !== rb.fast)
      problems.push(`${ra.date}: matches ${ra.matchEvents} (${ra.full}f/${ra.fast}q) vs ${rb.matchEvents} (${rb.full}f/${rb.fast}q)`);
  }
  if (a.world.currentDate !== b.world.currentDate)
    problems.push(`final currentDate ${a.world.currentDate} vs ${b.world.currentDate}`);
  if (a.world.squadFiles !== b.world.squadFiles)
    problems.push(`squad files ${a.world.squadFiles} vs ${b.world.squadFiles}`);
  for (const w of [a.world, b.world]) {
    if (w.missingStandings.length) problems.push(`missing standings: ${w.missingStandings.join(", ")}`);
    for (const [slug, l] of Object.entries(w.leagues)) {
      if (l.mpSum !== 2 * l.played) problems.push(`${slug}: standings mp ${l.mpSum} ≠ 2 × played ${l.played}`);
    }
  }
  for (const slug of Object.keys(a.world.leagues)) {
    const la = a.world.leagues[slug]!;
    const lb = b.world.leagues[slug];
    if (!lb || la.played !== lb.played || la.standingsRows !== lb.standingsRows)
      problems.push(`${slug}: played ${la.played}/${la.standingsRows} rows vs ${lb?.played}/${lb?.standingsRows}`);
  }
  const totalPlayed = (w: WorldSummary) => Object.values(w.leagues).reduce((s, l) => s + l.played, 0);
  console.log("\n=== behaviour comparison (unbuffered vs buffered, same starting save) ===");
  console.log(
    `fixtures played: ${totalPlayed(a.world)} vs ${totalPlayed(b.world)} across ${Object.keys(a.world.leagues).length} leagues; ` +
      `final date ${a.world.currentDate} vs ${b.world.currentDate}; squad files ${a.world.squadFiles} vs ${b.world.squadFiles}; ` +
      `transfers ${a.world.transfers} vs ${b.world.transfers} (random, not compared)`,
  );
  if (problems.length === 0) console.log("OK — per-day dates and match counts, per-league played fixtures and standings (mp = 2 × played) all match");
  else for (const p of problems) console.log(`MISMATCH ${p}`);
  return problems.length === 0;
}

// ── Save snapshot / restore (for --compare) ──────────────────────────────────

const { cp, rm, mkdtemp } = await import("fs/promises");
const { tmpdir } = await import("os");
const savesDir = `${RUNTIME_DATA_DIR}/saves`;

async function snapshotSave(saveId: string, dir: string): Promise<void> {
  await cp(`${savesDir}/${saveId}.json`, `${dir}/${saveId}.json`);
  await cp(`${savesDir}/${saveId}`, `${dir}/${saveId}`, { recursive: true });
}
async function restoreSave(saveId: string, dir: string): Promise<void> {
  await saveService.deleteSave(saveId);
  await cp(`${dir}/${saveId}.json`, `${savesDir}/${saveId}.json`);
  await cp(`${dir}/${saveId}`, `${savesDir}/${saveId}`, { recursive: true });
}

// ── Main ──────────────────────────────────────────────────────────────────────

let saveId: string | null = null;
let snapshotDir: string | null = null;
let exitCode = 0;
try {
  saveId = await createBenchSave();
  if (MODE === "compare") {
    snapshotDir = await mkdtemp(`${tmpdir()}/bench-advance-day-`);
    await snapshotSave(saveId, snapshotDir);
    const before = await runDays(saveId, false);
    const beforeWorld = await summarizeWorld(saveId);
    await restoreSave(saveId, snapshotDir);
    const after = await runDays(saveId, true);
    const afterWorld = await summarizeWorld(saveId);
    printTable(`BEFORE — unbuffered (FileSystemDAL), ${DAYS} days`, before);
    printTable(`AFTER — buffered per day (live route), ${DAYS} days`, after);
    if (!compareRuns({ rows: before, world: beforeWorld }, { rows: after, world: afterWorld })) exitCode = 1;
  } else {
    const rows = await runDays(saveId, MODE === "buffered");
    printTable(`${MODE === "buffered" ? "buffered per day (live route)" : "unbuffered (FileSystemDAL)"}, ${DAYS} days`, rows);
  }
} finally {
  if (saveId) {
    await saveService.deleteSave(saveId);
    console.log(`\nDeleted save ${saveId}`);
  }
  if (snapshotDir) await rm(snapshotDir, { recursive: true, force: true });
}
process.exit(exitCode);
