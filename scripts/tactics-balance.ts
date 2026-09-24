/**
 * Tactics Balance CLI
 *
 * Runs every tactical-style pair with identical 10/10 squads on the same
 * formation (4-3-3) and writes the result JSON to stdout or a file.
 *
 * Architecture: spawns one Bun Worker per style pair, runs IN PARALLEL.
 * Each worker has its own module registry, so per-team config mutations
 * (applyTeamTacticsConfig / applyTeamAttackConfig) never leak across pairs.
 *
 * The 5 styles produce 10 unordered cross-pairs (no self-pairs).
 *
 * Usage:
 *   bun scripts/tactics-balance.ts [options]
 *
 * Options:
 *   --matches <n>     Games per pair (default: 10)
 *   --stat-level <n>  Player attribute level 1..10 applied to every stat (default: 10)
 *   --out <path>      Write JSON to this file (default: debug/balance/tactics-balance.json)
 *   --pretty          Pretty-print the JSON (default: compact)
 *
 * Examples:
 *   bun scripts/tactics-balance.ts --matches 200 --pretty
 *   bun scripts/tactics-balance.ts --matches 200 --stat-level 5 --pretty
 *   bun scripts/tactics-balance.ts --matches 500 --out debug/balance/custom.json --pretty
 */

import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { TACTICAL_STYLE_OPTIONS } from '@/types/tacticsTypes';
import type { TacticalStyle }     from '@/types/tacticsTypes';

// ── CLI argument parsing ───────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(flag: string, defaultValue: string): string {
  const idx = args.indexOf(flag);
  return (idx !== -1 ? args[idx + 1] : undefined) || defaultValue;
}

const matchesPerPair = parseInt(getArg('--matches', '10'), 10);
const statLevel      = parseInt(getArg('--stat-level', '10'), 10);
const outFile        = getArg('--out', `debug/balance/tactics-balance_${statLevel}_${statLevel}.json`);
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

const STYLES: TacticalStyle[] = TACTICAL_STYLE_OPTIONS.map((o) => o.value);

const STYLE_META: Record<TacticalStyle, { label: string; description: string }> = Object.fromEntries(
  TACTICAL_STYLE_OPTIONS.map((o) => [o.value, { label: o.label, description: o.description }]),
) as Record<TacticalStyle, { label: string; description: string }>;

const FORMATION = '4-3-3';

// Unordered cross-pairs only (i < j) → 5 * 4 / 2 = 10 pairs.
const pairs: [TacticalStyle, TacticalStyle][] = [];
for (let i = 0; i < STYLES.length; i++) {
  for (let j = i + 1; j < STYLES.length; j++) {
    pairs.push([STYLES[i]!, STYLES[j]!]);
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
  styleA:     TacticalStyle;
  styleB:     TacticalStyle;
  matches:    number;
  draws:      number;
  durationMs: number;
  teamA:      TeamRawStats;
  teamB:      TeamRawStats;
};

type WorkerMessage =
  | { type: 'progress'; styleA: TacticalStyle; styleB: TacticalStyle; done: number; total: number }
  | { type: 'result';   result: BatchRaw };

const WORKER_URL = new URL('./tactics-balance-worker.ts', import.meta.url);

console.error(`Tactics balance: ${FORMATION}, ${STYLES.join(' / ')} — ${matchesPerPair} matches/pair @ ${statLevel}/10 attrs (${pairs.length} workers, parallel)`);

function runPair([styleA, styleB]: [TacticalStyle, TacticalStyle]): Promise<BatchRaw> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_URL.href, { type: 'module' });
    worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        console.error(`[${msg.styleA} vs ${msg.styleB}] ${msg.done}/${msg.total}`);
      } else if (msg.type === 'result') {
        worker.terminate();
        resolve(msg.result);
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(`Worker for ${styleA} vs ${styleB} failed: ${e.message ?? 'unknown error'}`));
    };
    worker.postMessage({ styleA, styleB, matches: matchesPerPair, statLevel });
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
    wins:              t.wins,
    avgGoals:          r2(t.goals   / matches),
    avgShots:          r2(t.shots   / matches),
    avgXg:             r2(t.xg      / matches),
    avgAssists:        r2(t.assists / matches),
    shotConversionPct: pct(t.goals, t.shots),             // goals per shot
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
  const sA = pt.styleA;
  const sB = pt.styleB;
  console.error(`  ${sA} vs ${sB}: ${pt.teamA.wins}W / ${pt.draws}D / ${pt.teamB.wins}W (${pt.durationMs}ms)`);
  return {
    styleA: sA, styleB: sB, matches: n, draws: pt.draws,
    teamA: perMatchView(pt.teamA, n),
    teamB: perMatchView(pt.teamB, n),
  };
});

// ── Summary (per style across all its matchups) ───────────────────────────────

type StyleTotals = TeamRawStats & {
  losses:          number;
  draws:           number;
  games:           number;
  goalsConceded:   number;
  shotsConceded:   number;
  xgConceded:      number;
  assistsConceded: number;
};

function emptyStyleTotals(): StyleTotals {
  return {
    wins: 0, losses: 0, draws: 0, games: 0,
    goals: 0, shots: 0, xg: 0, assists: 0,
    passesAttempted: 0, passesCompleted: 0, passesFailed: 0,
    tackles: 0, interceptions: 0, dribblesWon: 0, dribblesLost: 0,
    goalsConceded: 0, shotsConceded: 0, xgConceded: 0, assistsConceded: 0,
  };
}

function addInto(dst: StyleTotals, src: TeamRawStats, opp: TeamRawStats, draws: number, matches: number): void {
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
  dst.goalsConceded   += opp.goals;
  dst.shotsConceded   += opp.shots;
  dst.xgConceded      += opp.xg;
  dst.assistsConceded += opp.assists;
}

const styleSummary: Record<TacticalStyle, StyleTotals> = Object.fromEntries(
  STYLES.map((s) => [s, emptyStyleTotals()]),
) as Record<TacticalStyle, StyleTotals>;

for (const pt of results) {
  addInto(styleSummary[pt.styleA], pt.teamA, pt.teamB, pt.draws, pt.matches);
  addInto(styleSummary[pt.styleB], pt.teamB, pt.teamA, pt.draws, pt.matches);
}

const summary = (Object.entries(styleSummary) as Array<[TacticalStyle, StyleTotals]>).map(([id, s]) => {
  const dribbles = s.dribblesWon + s.dribblesLost;
  return {
    style:       id,
    label:       STYLE_META[id].label,
    description: STYLE_META[id].description,
    games:       s.games,

    // Results
    winRate:     pct(s.wins,   s.games),
    drawRate:    pct(s.draws,  s.games),
    lossRate:    pct(s.losses, s.games),

    // Attacking
    avgGoals:          r2(s.goals   / s.games),
    avgShots:          r2(s.shots   / s.games),
    avgXg:             r2(s.xg      / s.games),
    avgAssists:        r2(s.assists / s.games),
    shotConversionPct: pct(s.goals, s.shots),

    // Defending (what the opponent produced against this style)
    avgGoalsConceded:    r2(s.goalsConceded   / s.games),
    avgShotsConceded:    r2(s.shotsConceded   / s.games),
    avgXgConceded:       r2(s.xgConceded      / s.games),
    avgAssistsConceded:  r2(s.assistsConceded / s.games),
    oppShotConversionPct: pct(s.goalsConceded, s.shotsConceded),

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
  formation: FORMATION,
  styles:    STYLES,
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
