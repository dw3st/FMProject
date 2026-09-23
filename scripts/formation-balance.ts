/**
 * Formation Balance CLI
 *
 * Runs every active formation pair with identical 10/10 squads and writes the
 * result JSON to stdout or a file.
 *
 * Architecture: spawns one Bun Worker per formation pair, runs IN PARALLEL.
 * Each worker has its own module registry (isolated Statistics/PlayerRating
 * singletons), so concurrent workers don't collide. Parent collects results
 * via postMessage and aggregates.
 *
 * Usage:
 *   bun scripts/formation-balance.ts [options]
 *
 * Options:
 *   --matches <n>     Games per matchup (default: 10)
 *   --stat-level <n>  Player attribute level 1..10 applied to every stat (default: 10)
 *   --out <path>      Write JSON to this file (default: debug/balance/formation-balance_<n>_<n>.json)
 *   --pretty          Pretty-print the JSON (default: compact)
 *
 * Examples:
 *   bun scripts/formation-balance.ts --matches 200 --pretty
 *   bun scripts/formation-balance.ts --matches 200 --stat-level 5 --pretty
 *   bun scripts/formation-balance.ts --matches 500 --out debug/balance/custom.json --pretty
 */

import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

// ── CLI argument parsing ───────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(flag: string, defaultValue: string): string {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
}

const matchesPerPair = parseInt(getArg('--matches', '10'), 10);
const statLevel      = parseInt(getArg('--stat-level', '10'), 10);
const outFile        = getArg('--out', `debug/balance/formation-balance_${statLevel}_${statLevel}.json`);
const pretty         = args.includes('--pretty');

if (isNaN(matchesPerPair) || matchesPerPair < 1) {
  console.error('Error: --matches must be a positive integer');
  process.exit(1);
}
if (isNaN(statLevel) || statLevel < 1 || statLevel > 10) {
  console.error('Error: --stat-level must be an integer between 1 and 10');
  process.exit(1);
}

// ── Setup ──────────────────────────────────────────────────────────────────────

const ACTIVE_FORMATIONS: Record<string, string> = {
  '4-3-3': 'Three forwards up top with midfield control and defensive stability.',
  '4-4-2': 'Paired strikers backed by a balanced flat four across midfield.',
  '3-5-2': 'Five midfielders dominate possession with wing-backs providing width.',
};

const formationIds = Object.keys(ACTIVE_FORMATIONS);
const pairs: [string, string][] = [];
for (let i = 0; i < formationIds.length; i++) {
  for (let j = i + 1; j < formationIds.length; j++) {
    pairs.push([formationIds[i], formationIds[j]]);
  }
}

// ── Spawn one Worker per pair — in parallel ────────────────────────────────────

type TeamRawStats = {
  wins:            number;
  goals:           number;
  shots:           number;
  xg:              number;
  assists:         number;
  passesAttempted: number;
  passesCompleted: number;
  passesFailed:    number;
  tackles:         number;
  interceptions:   number;
  dribblesWon:     number;
  dribblesLost:    number;
};

type BatchRaw = {
  formationA: string;
  formationB: string;
  matches:    number;
  draws:      number;
  durationMs: number;
  teamA:      TeamRawStats;
  teamB:      TeamRawStats;
};

type WorkerMessage =
  | { type: 'progress'; fAId: string; fBId: string; done: number; total: number }
  | { type: 'result';   result: BatchRaw };

const WORKER_URL = new URL('./formation-balance-worker.ts', import.meta.url);

console.error(`Formation balance: ${formationIds.join(' vs ')} — ${matchesPerPair} matches/pair @ ${statLevel}/10 attrs (${pairs.length} workers, parallel)`);

function runPair([fAId, fBId]: [string, string]): Promise<BatchRaw> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_URL.href, { type: 'module' });
    worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        console.error(`[${msg.fAId} vs ${msg.fBId}] ${msg.done}/${msg.total}`);
      } else if (msg.type === 'result') {
        worker.terminate();
        resolve(msg.result);
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(`Worker for ${fAId} vs ${fBId} failed: ${e.message ?? 'unknown error'}`));
    };
    worker.postMessage({ fAId, fBId, matches: matchesPerPair, statLevel });
  });
}

const totalStart = performance.now();
const results: BatchRaw[] = await Promise.all(pairs.map(runPair));

// ── Helpers ────────────────────────────────────────────────────────────────────

const r2  = (v: number) => Math.round(v * 100) / 100;
const pct = (num: number, den: number) => (den > 0 ? r2((num / den) * 100) : 0);

function perMatchView(t: TeamRawStats, matches: number) {
  const dribblesTotal = t.dribblesWon + t.dribblesLost;
  return {
    wins:               t.wins,
    avgGoals:           r2(t.goals   / matches),
    avgShots:           r2(t.shots   / matches),
    avgXg:              r2(t.xg      / matches),
    avgAssists:         r2(t.assists / matches),
    shotConversionPct:  pct(t.goals, t.shots),
    avgPassesAttempted: r2(t.passesAttempted / matches),
    avgPassesCompleted: r2(t.passesCompleted / matches),
    passAccuracyPct:    pct(t.passesCompleted, t.passesAttempted),
    avgTackles:         r2(t.tackles       / matches),
    avgInterceptions:   r2(t.interceptions / matches),
    avgDribblesWon:     r2(t.dribblesWon   / matches),
    avgDribblesLost:    r2(t.dribblesLost  / matches),
    dribbleSuccessPct:  pct(t.dribblesWon, dribblesTotal),
  };
}

// ── Aggregate per pair ─────────────────────────────────────────────────────────

const matchups = results.map((pt) => {
  const n  = pt.matches;
  const fA = pt.formationA;
  const fB = pt.formationB;
  console.error(`  ${fA} vs ${fB}: ${pt.teamA.wins}W / ${pt.draws}D / ${pt.teamB.wins}W (${pt.durationMs}ms)`);
  return {
    formationA: fA, formationB: fB, matches: n, draws: pt.draws,
    teamA: perMatchView(pt.teamA, n),
    teamB: perMatchView(pt.teamB, n),
  };
});

// ── Summary (per formation across all its matchups) ───────────────────────────

type FormationTotals = TeamRawStats & { losses: number; draws: number; games: number };

function emptyFormationTotals(): FormationTotals {
  return {
    wins: 0, losses: 0, draws: 0, games: 0,
    goals: 0, shots: 0, xg: 0, assists: 0,
    passesAttempted: 0, passesCompleted: 0, passesFailed: 0,
    tackles: 0, interceptions: 0, dribblesWon: 0, dribblesLost: 0,
  };
}

function addInto(dst: FormationTotals, src: TeamRawStats, opp: TeamRawStats, draws: number, matches: number): void {
  dst.wins            += src.wins;
  dst.losses          += opp.wins;
  dst.draws           += draws;
  dst.games           += matches;
  dst.goals           += src.goals;
  dst.shots           += src.shots;
  dst.xg              += src.xg;
  dst.assists         += src.assists;
  dst.passesAttempted += src.passesAttempted;
  dst.passesCompleted += src.passesCompleted;
  dst.passesFailed    += src.passesFailed;
  dst.tackles         += src.tackles;
  dst.interceptions   += src.interceptions;
  dst.dribblesWon     += src.dribblesWon;
  dst.dribblesLost    += src.dribblesLost;
}

const formationSummary: Record<string, FormationTotals> = {};
for (const id of formationIds) formationSummary[id] = emptyFormationTotals();

for (const pt of results) {
  addInto(formationSummary[pt.formationA], pt.teamA, pt.teamB, pt.draws, pt.matches);
  addInto(formationSummary[pt.formationB], pt.teamB, pt.teamA, pt.draws, pt.matches);
}

const summary = Object.entries(formationSummary).map(([id, s]) => {
  const dribbles = s.dribblesWon + s.dribblesLost;
  return {
    formation:   id,
    description: ACTIVE_FORMATIONS[id] ?? '',
    games:       s.games,

    // Results
    winRate:   pct(s.wins,   s.games),
    drawRate:  pct(s.draws,  s.games),
    lossRate:  pct(s.losses, s.games),

    // Attacking
    avgGoals:          r2(s.goals   / s.games),
    avgShots:          r2(s.shots   / s.games),
    avgXg:             r2(s.xg      / s.games),
    avgAssists:        r2(s.assists / s.games),
    shotConversionPct: pct(s.goals, s.shots),

    // Passing
    avgPassesAttempted: r2(s.passesAttempted / s.games),
    avgPassesCompleted: r2(s.passesCompleted / s.games),
    passAccuracyPct:    pct(s.passesCompleted, s.passesAttempted),

    // Defending
    avgTackles:       r2(s.tackles       / s.games),
    avgInterceptions: r2(s.interceptions / s.games),

    // Dribbling
    avgDribblesWon:    r2(s.dribblesWon  / s.games),
    avgDribblesLost:   r2(s.dribblesLost / s.games),
    dribbleSuccessPct: pct(s.dribblesWon, dribbles),
  };
}).sort((a, b) => b.winRate - a.winRate);

const result = {
  totalDurationMs: Math.round(performance.now() - totalStart),
  matchesPerPair,
  statLevel,
  formations: formationIds,
  summary,
  matchups,
};

// ── Output ─────────────────────────────────────────────────────────────────────

const json = pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result);

if (outFile) {
  await mkdir(dirname(outFile), { recursive: true });
  await Bun.write(outFile, json);
  console.error(`Written to ${outFile} (${Math.round(json.length / 1024)}KB) in ${result.totalDurationMs}ms`);
} else {
  process.stdout.write(json + '\n');
  console.error(`Done in ${result.totalDurationMs}ms`);
}
