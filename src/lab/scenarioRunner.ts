/**
 * Scenario Runner — orchestrates a BalanceScenario across worker pool.
 *
 * - Computes all unordered pairs from the variants list (no self-pairs).
 * - Spawns one Worker per pair (parallel).
 * - Streams progress via the optional onProgress callback.
 * - Aggregates raw totals into PairResult + per-variant VariantSummary.
 */

import type {
  BalanceScenario,
  PairRaw,
  PairResult,
  PerMatchView,
  ScenarioResult,
  TeamRawStats,
  Variant,
  VariantSummary,
  WorkerInput,
  WorkerMessage,
} from "@/lab/types";


const WORKER_URL = new URL("./balanceWorker.ts", import.meta.url);

export type ProgressEvent =
  | { type: "pair-start"; variantAId: string; variantBId: string }
  | { type: "pair-progress"; variantAId: string; variantBId: string; done: number; total: number }
  | { type: "pair-done"; variantAId: string; variantBId: string; durationMs: number }
  | { type: "pair-error"; variantAId: string; variantBId: string; message: string };

export interface RunScenarioOptions {
  onProgress?: (event: ProgressEvent) => void;
  /** Max workers to run concurrently. Defaults to pair count (full parallel). */
  concurrency?: number;
}

// ── Pair list construction ───────────────────────────────────────────────────

interface PairKey {
  variantA: Variant;
  variantB: Variant;
}

export function buildPairs(scenario: BalanceScenario): PairKey[] {
  const { variants } = scenario;
  const pairs: PairKey[] = [];
  for (let i = 0; i < variants.length; i++) {
    for (let j = i + 1; j < variants.length; j++) {
      const a = variants[i];
      const b = variants[j];
      if (a && b) pairs.push({ variantA: a, variantB: b });
    }
  }
  return pairs;
}

// ── Worker invocation ────────────────────────────────────────────────────────

function runOnePair(
  input: WorkerInput,
  onProgress?: (event: ProgressEvent) => void,
): Promise<PairRaw> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_URL.href, { type: "module" });
    let settled = false;

    onProgress?.({
      type: "pair-start",
      variantAId: input.variantA.id,
      variantBId: input.variantB.id,
    });

    worker.onmessage = (e: MessageEvent<WorkerMessage | { type: "error"; message: string }>) => {
      const msg = e.data;
      if (msg.type === "progress") {
        onProgress?.({
          type: "pair-progress",
          variantAId: msg.variantAId,
          variantBId: msg.variantBId,
          done: msg.done,
          total: msg.total,
        });
      } else if (msg.type === "result") {
        settled = true;
        worker.terminate();
        onProgress?.({
          type: "pair-done",
          variantAId: msg.result.variantAId,
          variantBId: msg.result.variantBId,
          durationMs: msg.result.durationMs,
        });
        resolve(msg.result);
      } else if ((msg as { type: string }).type === "error") {
        settled = true;
        worker.terminate();
        const m = (msg as { message: string }).message;
        onProgress?.({
          type: "pair-error",
          variantAId: input.variantA.id,
          variantBId: input.variantB.id,
          message: m,
        });
        reject(new Error(m));
      }
    };

    worker.onerror = (e) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      const m = e.message ?? "unknown worker error";
      onProgress?.({
        type: "pair-error",
        variantAId: input.variantA.id,
        variantBId: input.variantB.id,
        message: m,
      });
      reject(new Error(`Worker for ${input.variantA.id} vs ${input.variantB.id}: ${m}`));
    };

    worker.postMessage(input);
  });
}

// ── Concurrency-limited scheduler ────────────────────────────────────────────

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      const item = items[i];
      if (item === undefined) return;
      results[i] = await fn(item);
    }
  }
  const pool = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(pool);
  return results;
}

// ── Aggregation ──────────────────────────────────────────────────────────────

const r2 = (v: number) => Math.round(v * 100) / 100;
const pct = (num: number, den: number) => (den > 0 ? r2((num / den) * 100) : 0);

function perMatchView(t: TeamRawStats, matches: number): PerMatchView {
  const dribblesTotal = t.dribblesWon + t.dribblesLost;
  return {
    wins: t.wins,
    avgGoals: r2(t.goals / matches),
    avgShots: r2(t.shots / matches),
    avgXg: r2(t.xg / matches),
    avgAssists: r2(t.assists / matches),
    shotConversionPct: pct(t.goals, t.shots),
    avgPassesAttempted: r2(t.passesAttempted / matches),
    avgPassesCompleted: r2(t.passesCompleted / matches),
    passAccuracyPct: pct(t.passesCompleted, t.passesAttempted),
    avgTackles: r2(t.tackles / matches),
    avgInterceptions: r2(t.interceptions / matches),
    avgDribblesWon: r2(t.dribblesWon / matches),
    avgDribblesLost: r2(t.dribblesLost / matches),
    dribbleSuccessPct: pct(t.dribblesWon, dribblesTotal),
    avgThroughBalls: r2(t.throughBallsAttempted / matches),
    throughBallCompletionPct: pct(t.throughBallsCompleted, t.throughBallsAttempted),
    avgLooseBallsWon: r2(t.looseBallsWon / matches),
    avgSwitchPlays: r2(t.switchPlays / matches),
  };
}

interface VariantTotals extends TeamRawStats {
  losses: number;
  draws: number;
  games: number;
  goalsConceded: number;
  shotsConceded: number;
  xgConceded: number;
  assistsConceded: number;
}

function emptyTotals(): VariantTotals {
  return {
    wins: 0, losses: 0, draws: 0, games: 0,
    goals: 0, shots: 0, xg: 0, assists: 0,
    passesAttempted: 0, passesCompleted: 0, passesFailed: 0,
    tackles: 0, interceptions: 0, dribblesWon: 0, dribblesLost: 0,
    throughBallsAttempted: 0, throughBallsCompleted: 0,
    throughBallsLostInFlight: 0, throughBallsLostInRace: 0,
    throughBallsLostInDuel: 0, looseBallsWon: 0,
    switchPlays: 0,
    goalsConceded: 0, shotsConceded: 0, xgConceded: 0, assistsConceded: 0,
  };
}

function addInto(dst: VariantTotals, src: TeamRawStats, opp: TeamRawStats, draws: number, matches: number): void {
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
  dst.throughBallsAttempted    += src.throughBallsAttempted;
  dst.throughBallsCompleted    += src.throughBallsCompleted;
  dst.throughBallsLostInFlight += src.throughBallsLostInFlight;
  dst.throughBallsLostInRace   += src.throughBallsLostInRace;
  dst.throughBallsLostInDuel   += src.throughBallsLostInDuel;
  dst.looseBallsWon            += src.looseBallsWon;
  dst.switchPlays              += src.switchPlays;
  dst.goalsConceded   += opp.goals;
  dst.shotsConceded   += opp.shots;
  dst.xgConceded      += opp.xg;
  dst.assistsConceded += opp.assists;
}

function summarise(variantId: string, label: string, totals: VariantTotals): VariantSummary {
  const dribbles = totals.dribblesWon + totals.dribblesLost;
  const games = totals.games || 1;
  return {
    variantId,
    label,
    games: totals.games,
    winRate: pct(totals.wins, totals.games),
    drawRate: pct(totals.draws, totals.games),
    lossRate: pct(totals.losses, totals.games),
    avgGoals: r2(totals.goals / games),
    avgShots: r2(totals.shots / games),
    avgXg: r2(totals.xg / games),
    avgAssists: r2(totals.assists / games),
    shotConversionPct: pct(totals.goals, totals.shots),
    avgGoalsConceded: r2(totals.goalsConceded / games),
    avgShotsConceded: r2(totals.shotsConceded / games),
    avgXgConceded: r2(totals.xgConceded / games),
    avgAssistsConceded: r2(totals.assistsConceded / games),
    oppShotConversionPct: pct(totals.goalsConceded, totals.shotsConceded),
    avgPassesAttempted: r2(totals.passesAttempted / games),
    avgPassesCompleted: r2(totals.passesCompleted / games),
    passAccuracyPct: pct(totals.passesCompleted, totals.passesAttempted),
    avgTackles: r2(totals.tackles / games),
    avgInterceptions: r2(totals.interceptions / games),
    avgDribblesWon: r2(totals.dribblesWon / games),
    avgDribblesLost: r2(totals.dribblesLost / games),
    dribbleSuccessPct: pct(totals.dribblesWon, dribbles),
    avgThroughBalls: r2(totals.throughBallsAttempted / games),
    throughBallCompletionPct: pct(totals.throughBallsCompleted, totals.throughBallsAttempted),
    avgLooseBallsWon: r2(totals.looseBallsWon / games),
    avgSwitchPlays: r2(totals.switchPlays / games),
  };
}

// ── Public entry ─────────────────────────────────────────────────────────────

export async function runScenario(
  scenario: BalanceScenario,
  opts: RunScenarioOptions = {},
): Promise<ScenarioResult> {
  const startedAt = new Date().toISOString();
  const start = performance.now();

  const pairs = buildPairs(scenario);
  if (pairs.length === 0) {
    throw new Error("Scenario produced 0 pairs — need at least 2 variants.");
  }

  const limit = Math.max(1, opts.concurrency ?? pairs.length);
  const raw = await runWithConcurrency(pairs, limit, (p) =>
    runOnePair(
      { variantA: p.variantA, variantB: p.variantB, matches: scenario.matchesPerPair },
      opts.onProgress,
    ),
  );

  const totalDurationMs = Math.round(performance.now() - start);

  const pairResults: PairResult[] = raw.map((r) => ({
    variantAId: r.variantAId,
    variantBId: r.variantBId,
    matches: r.matches,
    draws: r.draws,
    teamA: perMatchView(r.teamA, r.matches),
    teamB: perMatchView(r.teamB, r.matches),
  }));

  // Build per-variant totals across both A-side and B-side appearances.
  const allVariants = new Map<string, Variant>();
  scenario.variants.forEach((v) => allVariants.set(v.id, v));

  const totalsByVariant = new Map<string, VariantTotals>();
  for (const id of allVariants.keys()) totalsByVariant.set(id, emptyTotals());

  for (const r of raw) {
    const aTotals = totalsByVariant.get(r.variantAId)!;
    const bTotals = totalsByVariant.get(r.variantBId)!;
    addInto(aTotals, r.teamA, r.teamB, r.draws, r.matches);
    addInto(bTotals, r.teamB, r.teamA, r.draws, r.matches);
  }

  const variants: VariantSummary[] = Array.from(allVariants.values())
    .map((v) => summarise(v.id, v.label, totalsByVariant.get(v.id)!))
    .sort((a, b) => b.winRate - a.winRate);

  return {
    scenario,
    startedAt,
    totalDurationMs,
    pairs: pairResults,
    variants,
  };
}
