/**
 * Measurements of the live match between two managers (multiplayer part 7, `.claude/rules/game/multiplayer.md`).
 *
 *   bun scripts/h2h-measure.ts [seconds=30] [matches=100]
 *
 * (a) CPU and RSS of the server process with 1 and then 3 matches running at the same time in real Bun Workers
 *     (`src/backend/h2h/h2hWorker.ts`) at 1× for `seconds` of real time each.
 * (b) Bytes per second one browser receives: the worker messages slimmed and serialized the way the rooms do
 *     (`wireState` / `wirePlayer` of `h2hRooms.ts`, benches only when they change, the statistics snapshot every 3 s).
 *     Counted on the first 1× run, starting at kickoff of the measured window (the pre-match presentation included).
 * (c) Goals per match: `matches` matches through the worker (`createH2HMatch`) at high speed, 4 at a time (both sides on the assistant, as a
 *     dropped manager) against `matches` `simulateMatch` with the same two Premier League clubs, formation and XIs.
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Keep any lazy DB / runtime file away from src/Data (h2hRooms imports the save layer).
process.env.RUNTIME_DATA_DIR ??= mkdtempSync(join(tmpdir(), "h2h-measure-"));

const { wireState } = await import("@/backend/h2h/h2hRooms");
const { eligibleLivePlayers } = await import("@/Domain/match/liveMatchSetup");
const { formationForSimId } = await import("@/Domain/matchFormations");
const { autoLineupForFormation } = await import("@/Domain/advanceDay/matchSimulationLineups");
const { simulateMatch } = await import("@/GameEngine/Domain/SimulateMatch");

import type { LiveMatchInput, LiveSideInput } from "@/Domain/match/liveMatchSetup";
import type { Squad } from "@/types/playerTypes";
import type { WorkerOut } from "@/types/h2hTypes";

const SECONDS = Number(process.argv[2] ?? 30);
const MATCHES = Number(process.argv[3] ?? 100);
const DATE = "2026-08-20";
const FORMATION = "4-3-3";
const SPEED = Number(process.env.H2H_SPEED ?? 6000);
const POOL = Number(process.env.H2H_POOL ?? 4);

function squad(stem: string): Squad {
  const path = fileURLToPath(new URL(`../src/Data/squads/premier_league/${stem}.json`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Squad;
}

const home = squad("33");
const away = squad("34");
const formation = formationForSimId(FORMATION);
const lineupA = autoLineupForFormation(home, formation, DATE);
const lineupB = autoLineupForFormation(away, formation, DATE);

function side(s: Squad, lineup: string[]): LiveSideInput {
  return {
    players: eligibleLivePlayers(s.players, DATE, null),
    formation,
    lineup,
    tactics: { style: "balanced", mentality: "balanced" },
    morale: "own",
    human: true,
  };
}
const input = (): LiveMatchInput => ({ A: side(home, lineupA), B: side(away, lineupB), date: DATE, knockout: false });

// ── (b) wire bytes, the rooms' slimming ──────────────────────────────────────

function wireMeter() {
  let bytes = 0;
  let benchSig = { A: "", B: "" };
  let lastSnapshotAt = -Infinity;
  const count: Record<string, number> = { frame: 0, state: 0, event: 0 };
  const byType: Record<string, number> = { frame: 0, state: 0, event: 0 };
  return {
    count,
    byType,
    get bytes() { return bytes; },
    add(m: WorkerOut, now: number) {
      let json = "";
      if (m.type === "frame") {
        const { type: _t, ...frame } = m;
        json = JSON.stringify({ type: "h2h_frame", saveId: "x".repeat(12), fixtureId: "x".repeat(12), ...frame });
      } else if (m.type === "event") {
        json = JSON.stringify({ type: "h2h_event", saveId: "x".repeat(12), fixtureId: "x".repeat(12), name: m.name, payload: m.payload });
      } else if (m.type === "state") {
        const full = wireState(m.state, true);
        const sig = { A: JSON.stringify(full.benchA), B: JSON.stringify(full.benchB) };
        const benches = sig.A !== benchSig.A || sig.B !== benchSig.B;
        benchSig = sig;
        const snapshot = now - lastSnapshotAt >= 3000;
        if (snapshot) lastSnapshotAt = now;
        const s = m.stats;
        const stats = { teams: s.teams, goals: s.goals, ratings: s.ratings, ...(snapshot ? { snapshot: s.snapshot } : {}) };
        json = JSON.stringify({
          type: "h2h_state", saveId: "x".repeat(12), fixtureId: "x".repeat(12),
          state: benches ? full : wireState(m.state, false), stats,
        });
      } else return;
      const n = Buffer.byteLength(json);
      bytes += n;
      count[m.type] = (count[m.type] ?? 0) + 1;
      byType[m.type] = (byType[m.type] ?? 0) + n;
    },
  };
}

// ── (a) real workers at 1× ───────────────────────────────────────────────────

async function runWorkers(n: number, seconds: number) {
  const workerUrl = new URL("../src/backend/h2h/h2hWorker.ts", import.meta.url);
  const meters = Array.from({ length: n }, () => wireMeter());
  const workers: Worker[] = [];
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    const w = new Worker(workerUrl);
    const meter = meters[i]!;
    w.onmessage = (e: MessageEvent<WorkerOut>) => meter.add(e.data, performance.now() - t0);
    w.postMessage({ type: "init", input: input() });
    workers.push(w);
  }
  // Let the workers load and start before measuring.
  await Bun.sleep(3000);
  const cpu0 = process.cpuUsage();
  const wall0 = performance.now();
  const bytes0 = meters.map((m) => m.bytes);
  let rssPeak = 0;
  const rssTimer = setInterval(() => { rssPeak = Math.max(rssPeak, process.memoryUsage().rss); }, 500);
  await Bun.sleep(seconds * 1000);
  clearInterval(rssTimer);
  const cpu = process.cpuUsage(cpu0);
  const wall = (performance.now() - wall0) / 1000;
  const rss = process.memoryUsage().rss;
  rssPeak = Math.max(rssPeak, rss);
  const bps = meters.map((m, i) => (m.bytes - bytes0[i]!) / wall);
  for (const w of workers) w.terminate();
  await Bun.sleep(500);
  return {
    cpuPct: ((cpu.user + cpu.system) / 1e6 / wall) * 100,
    rssMB: rss / 1024 / 1024,
    rssPeakMB: rssPeak / 1024 / 1024,
    bps,
    meter: meters[0]!,
    wall,
  };
}

const mb = (n: number) => n.toFixed(0);
console.log(`RSS before any match: ${mb(process.memoryUsage().rss / 1024 / 1024)} MB`);

for (const n of [1, 3]) {
  const r = await runWorkers(n, SECONDS);
  console.log(`\n(a) ${n} match(es), ${r.wall.toFixed(1)} s at 1x: CPU ${r.cpuPct.toFixed(1)}% of one core, RSS ${mb(r.rssMB)} MB (peak ${mb(r.rssPeakMB)} MB)`);
  console.log(`(b) bytes/s per browser: ${r.bps.map((b) => (b / 1024).toFixed(1) + " KB/s").join(", ")}`);
  if (n === 1) {
    const m = r.meter;
    for (const t of ["frame", "state", "event"]) {
      console.log(`    ${t}: ${m.count[t]} messages, avg ${m.count[t] ? Math.round(m.byType[t]! / m.count[t]!) : 0} B`);
    }
  }
}

// ── (c) goals per match ──────────────────────────────────────────────────────

function stats(xs: number[]) {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1));
  return { mean, se: sd / Math.sqrt(xs.length) };
}

const h2hGoals: number[] = [];
const h2hShots: number[] = [];
let t = performance.now();
// The same worker the rooms spawn, `POOL` at a time, real time × SPEED, both sides on the assistant.
async function workerMatch(): Promise<Extract<WorkerOut, { type: "done" }> | null> {
  const w = new Worker(new URL("../src/backend/h2h/h2hWorker.ts", import.meta.url));
  const done = await new Promise<Extract<WorkerOut, { type: "done" }> | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), 120_000);
    w.onmessage = (e: MessageEvent<WorkerOut>) => {
      if (e.data.type === "done") { clearTimeout(timer); resolve(e.data); }
    };
    w.postMessage({ type: "speed", factor: SPEED });
    w.postMessage({ type: "init", input: input() });
    w.postMessage({ type: "auto", side: "A", on: true });
    w.postMessage({ type: "auto", side: "B", on: true });
  });
  w.terminate();
  return done;
}
let next = 0;
await Promise.all(Array.from({ length: POOL }, async () => {
  while (next < MATCHES) {
    next++;
    const done = await workerMatch();
    if (!done) continue;
    h2hGoals.push(done.state.score.A + done.state.score.B);
    h2hShots.push((done.stats.teams.A.shots ?? 0) + (done.stats.teams.B.shots ?? 0));
  }
}));
const h2hSec = (performance.now() - t) / 1000;

const simGoals: number[] = [];
const simShots: number[] = [];
t = performance.now();
for (let i = 0; i < MATCHES; i++) {
  const r = simulateMatch(home, away, formation, formation, lineupA, lineupB, {
    tactics: { A: { style: "balanced" }, B: { style: "balanced" } },
  });
  simGoals.push(r.score.A + r.score.B);
  simShots.push((r.teamStats.A.shots ?? 0) + (r.teamStats.B.shots ?? 0));
}
const simSec = (performance.now() - t) / 1000;

const g1 = stats(h2hGoals), g2 = stats(simGoals), s1 = stats(h2hShots), s2 = stats(simShots);
console.log(`\n(c) ${home.name} x ${away.name}, ${FORMATION}, balanced`);
console.log(`    createH2HMatch: ${h2hGoals.length} matches, goals ${g1.mean.toFixed(2)} ± ${g1.se.toFixed(2)}, shots ${s1.mean.toFixed(2)} (${h2hSec.toFixed(0)} s)`);
console.log(`    simulateMatch : ${simGoals.length} matches, goals ${g2.mean.toFixed(2)} ± ${g2.se.toFixed(2)}, shots ${s2.mean.toFixed(2)} (${simSec.toFixed(0)} s)`);
console.log(`    difference: ${(g1.mean - g2.mean).toFixed(2)} goals (${(((g1.mean / g2.mean) - 1) * 100).toFixed(1)}%), se ${Math.hypot(g1.se, g2.se).toFixed(2)}`);
process.exit(0);
