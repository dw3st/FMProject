/**
 * One full-engine club match of the day (engine rebuild, stage 1): the job the match pool runs, in a worker or in
 * process. Shared by `matchPool.ts` and `matchPoolWorker.ts`.
 */
import { buildMatchEvent, simulateRecording, type EngineMatchSim, type MatchSimResult, type PlayedMatchRecording } from "@/Domain/advanceDay/matches";
import { mulberry32 } from "@/Domain/rng";
import type { Fixture } from "@/types/calendarTypes";
import type { Squad } from "@/types/playerTypes";

export interface FullMatchJob {
  fixture: Fixture;
  home: Squad;
  away: Squad;
  sim: EngineMatchSim;
  /** Tests only: `Math.random` is mulberry32(seed) for the whole job, so a worker and the main thread draw the same. */
  seed?: number;
}

/** Runs the job in the current thread; `ms` = time spent in the engine and the post-match. */
export function runFullMatchJob(job: FullMatchJob): { result: MatchSimResult; ms: number } {
  const t0 = performance.now();
  const real = Math.random;
  if (job.seed !== undefined) Math.random = mulberry32(job.seed);
  try {
    const result = buildMatchEvent(job.fixture, job.home, job.away, job.sim);
    return { result, ms: performance.now() - t0 };
  } finally {
    Math.random = real;
  }
}

/**
 * A human manager's simulated national game (stage 22): only the recording (the national day applies it). Same pool,
 * so several such games of a day run side by side.
 */
export interface RecordingJob {
  kind: "recording";
  fixture: Fixture;
  home: Squad;
  away: Squad;
  sim: EngineMatchSim;
}

export type PoolJob = FullMatchJob | RecordingJob;
export type PoolResult = MatchSimResult | PlayedMatchRecording;

export const isRecordingJob = (job: PoolJob): job is RecordingJob => (job as RecordingJob).kind === "recording";

/** Runs any pool job in the current thread. */
export function runPoolJob(job: PoolJob): { result: PoolResult; ms: number } {
  if (!isRecordingJob(job)) return runFullMatchJob(job);
  const t0 = performance.now();
  const result = simulateRecording(job.fixture, job.home, job.away, job.sim).recording;
  return { result, ms: performance.now() - t0 };
}
