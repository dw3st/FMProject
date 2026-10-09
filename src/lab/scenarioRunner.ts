/**
 * Scenario Runner — orchestrates a BalanceScenario across worker pool.
 *
 * - Computes all unordered pairs from the variants list (no self-pairs).
 * - Spawns one Worker per pair (parallel).
 * - Streams progress via the optional onProgress callback.
 * - Aggregates raw totals into PairResult + per-variant VariantSummary.
 */

import { slotViews } from "@/lab/slotStats";
import type {
  BalanceScenario,
  CongestionMatchResult,
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

type ProgressEvent =
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
    extraTimePct: pct(t.extraTimeMatches, matches),
    shootoutWinPct: pct(t.shootoutsWon, matches),
    avgPenaltiesTaken: r2(t.penaltiesTaken / matches),
    penaltyConversionPct: pct(t.penaltiesScored, t.penaltiesTaken),
    avgEndEnergy: r2(t.avgEndEnergySum / matches),
    avgFatigueSubs: r2(t.fatigueSubstitutions / matches),
    avgInjuries: r2(t.injuries / matches),
    avgOutOfPosition: r2(t.outOfPosition / matches),
    avgMorale: r2(t.morale / matches),
    avgTemperament: r2(t.temperament / matches),
    avgPitchCondition: r2(t.pitchCondition / matches),
    avgRefereeStrictness: r2(t.refereeStrictness / matches),
    avgFouls: r2(t.fouls / matches),
    avgYellowCards: r2(t.yellowCards / matches),
    avgRedCards: r2(t.redCards / matches),
    avgPenaltiesAwarded: r2(t.penaltiesAwarded / matches),
    avgPenaltyGoals: r2(t.penaltyGoals / matches),
    avgOffsides: r2(t.offsides / matches),
    avgCrosses: r2(t.crosses / matches),
    crossCompletionPct: pct(t.crossesCompleted, t.crosses),
    avgAerialDuelsWon: r2(t.aerialDuelsWon / matches),
    avgHeaderGoals: r2(t.headerGoals / matches),
    avgLongBalls: r2(t.longBalls / matches),
    avgCorners: r2(t.corners / matches),
    avgFreeKicks: r2(t.freeKicks / matches),
    avgDirectFreeKickShots: r2(t.directFreeKickShots / matches),
    avgDirectFreeKickGoals: r2(t.directFreeKickGoals / matches),
    avgSetPieceGoals: r2(t.setPieceGoals / matches),
    setPieceGoalPct: pct(t.setPieceGoals, t.goals),
    avgMarkedTargetShots: r2(t.markedTargetShots / matches),
    avgMarkedTargetGoals: r2(t.markedTargetGoals / matches),
    slotStats: slotViews(t.slotStats, matches),
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
    extraTimeMatches: 0, shootoutsWon: 0, penaltiesTaken: 0, penaltiesScored: 0,
    avgEndEnergySum: 0, fatigueSubstitutions: 0, injuries: 0, outOfPosition: 0, morale: 0, temperament: 0, pitchCondition: 0, refereeStrictness: 0,
    fouls: 0, yellowCards: 0, redCards: 0, penaltiesAwarded: 0, penaltyGoals: 0, offsides: 0,
    crosses: 0, crossesCompleted: 0, aerialDuels: 0, aerialDuelsWon: 0, headerGoals: 0, longBalls: 0, longBallsCompleted: 0,
    corners: 0, freeKicks: 0, directFreeKickShots: 0, directFreeKickGoals: 0, setPieceGoals: 0,
    markedTargetShots: 0, markedTargetGoals: 0, manMarkedMinutes: 0, slotStats: [],
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
  dst.extraTimeMatches += src.extraTimeMatches;
  dst.shootoutsWon     += src.shootoutsWon;
  dst.penaltiesTaken   += src.penaltiesTaken;
  dst.penaltiesScored  += src.penaltiesScored;
  dst.avgEndEnergySum      += src.avgEndEnergySum;
  dst.fatigueSubstitutions += src.fatigueSubstitutions;
  dst.injuries              += src.injuries;
  dst.outOfPosition         += src.outOfPosition;
  dst.morale                += src.morale;
  dst.temperament           += src.temperament;
  dst.pitchCondition        += src.pitchCondition;
  dst.refereeStrictness     += src.refereeStrictness;
  dst.fouls                 += src.fouls;
  dst.yellowCards           += src.yellowCards;
  dst.redCards              += src.redCards;
  dst.penaltiesAwarded      += src.penaltiesAwarded;
  dst.penaltyGoals          += src.penaltyGoals;
  dst.offsides              += src.offsides;
  dst.crosses               += src.crosses;
  dst.crossesCompleted      += src.crossesCompleted;
  dst.aerialDuels           += src.aerialDuels;
  dst.aerialDuelsWon        += src.aerialDuelsWon;
  dst.headerGoals           += src.headerGoals;
  dst.longBalls             += src.longBalls;
  dst.longBallsCompleted    += src.longBallsCompleted;
  dst.corners               += src.corners;
  dst.freeKicks             += src.freeKicks;
  dst.directFreeKickShots   += src.directFreeKickShots;
  dst.directFreeKickGoals   += src.directFreeKickGoals;
  dst.setPieceGoals         += src.setPieceGoals;
  dst.markedTargetShots     += src.markedTargetShots;
  dst.markedTargetGoals     += src.markedTargetGoals;
  dst.manMarkedMinutes      += src.manMarkedMinutes;
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
    extraTimePct: pct(totals.extraTimeMatches, totals.games),
    shootoutWinPct: pct(totals.shootoutsWon, totals.games),
    avgPenaltiesTaken: r2(totals.penaltiesTaken / games),
    penaltyConversionPct: pct(totals.penaltiesScored, totals.penaltiesTaken),
    avgEndEnergy: r2(totals.avgEndEnergySum / games),
    avgFatigueSubs: r2(totals.fatigueSubstitutions / games),
    avgInjuries: r2(totals.injuries / games),
    avgOutOfPosition: r2(totals.outOfPosition / games),
    avgMorale: r2(totals.morale / games),
    avgTemperament: r2(totals.temperament / games),
    avgPitchCondition: r2(totals.pitchCondition / games),
    avgRefereeStrictness: r2(totals.refereeStrictness / games),
    avgFouls: r2(totals.fouls / games),
    avgYellowCards: r2(totals.yellowCards / games),
    avgRedCards: r2(totals.redCards / games),
    avgPenaltiesAwarded: r2(totals.penaltiesAwarded / games),
    avgPenaltyGoals: r2(totals.penaltyGoals / games),
    avgOffsides: r2(totals.offsides / games),
    avgCrosses: r2(totals.crosses / games),
    crossCompletionPct: pct(totals.crossesCompleted, totals.crosses),
    avgAerialDuelsWon: r2(totals.aerialDuelsWon / games),
    avgHeaderGoals: r2(totals.headerGoals / games),
    avgLongBalls: r2(totals.longBalls / games),
    avgCorners: r2(totals.corners / games),
    avgFreeKicks: r2(totals.freeKicks / games),
    avgDirectFreeKickShots: r2(totals.directFreeKickShots / games),
    avgDirectFreeKickGoals: r2(totals.directFreeKickGoals / games),
    avgSetPieceGoals: r2(totals.setPieceGoals / games),
    setPieceGoalPct: pct(totals.setPieceGoals, totals.goals),
    avgMarkedTargetShots: r2(totals.markedTargetShots / games),
    avgMarkedTargetGoals: r2(totals.markedTargetGoals / games),
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
      {
        variantA: p.variantA,
        variantB: p.variantB,
        matches: scenario.matchesPerPair,
        simEngine: scenario.simEngine ?? "full",
        knockout: scenario.knockout ?? false,
        ...(scenario.congestion ? { congestion: scenario.congestion } : {}),
      },
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
    ...(r.congestionMatches
      ? {
          congestion: r.congestionMatches.map(
            (cm): CongestionMatchResult => ({
              matchIndex: cm.matchIndex,
              matches: cm.matches,
              draws: cm.draws,
              teamA: perMatchView(cm.teamA, cm.matches),
              teamB: perMatchView(cm.teamB, cm.matches),
            }),
          ),
        }
      : {}),
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
