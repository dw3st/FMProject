/**
 * Pool of Bun Workers for the day's full-engine club matches (engine rebuild, stage 1). Only the matches of clubs with
 * a human seat run in the full engine; with several seats they no longer run one after the other on the main thread:
 * each goes to a worker (`matchPoolWorker.ts`) and the day awaits them all. A match result is the same as in series:
 * the worker runs the same `buildMatchEvent` on the same inputs (structured clones), with its own engine globals.
 *
 * Size: `MATCH_WORKERS` (env; `0` = in process, no workers), else 2–4 by the cores (`defaultPoolSize`). Workers start on
 * the first job and stay; an idle worker never keeps the process alive (`unref`).
 */
import { runPoolJob, type FullMatchJob, type PoolJob, type PoolResult, type RecordingJob } from "@/backend/matchPoolJob";
import type { MatchSimResult, PlayedMatchRecording } from "@/Domain/advanceDay/matches";
import { logError } from "@/Logger";

type Reply = { id: number; ok: true; result: PoolResult; ms: number } | { id: number; ok: false; error: string };
type Pending = { id: number; job: PoolJob; resolve: (r: PoolResult) => void; reject: (e: unknown) => void };
/** Bun's Worker also has `ref` / `unref` (the DOM type does not). */
type PoolWorker = Worker & { ref(): void; unref(): void };
type Slot = { worker: PoolWorker; busy: Pending | null };

/** 2–4 workers: a third of the cores, at least 2, at most 4. */
export function defaultPoolSize(cores: number): number {
  return Math.min(4, Math.max(2, Math.floor(cores / 3)));
}

function configuredSize(): number {
  const raw = process.env.MATCH_WORKERS;
  if (raw !== undefined && raw.trim() !== "") {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0) return Math.min(16, n);
  }
  const cores = typeof navigator !== "undefined" && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
  return defaultPoolSize(cores);
}

const slots: Slot[] = [];
const queue: Pending[] = [];
let nextId = 1;
let size: number | null = null;
const stats = { jobs: 0, busyMs: 0 };

/** Jobs run and engine time spent (sum over workers), since the process started. For benches. */
export function matchPoolStats(): { jobs: number; busyMs: number; size: number } {
  return { ...stats, size: size ?? configuredSize() };
}

/** Tests: a pool size for the next jobs (`0` = in process); idle workers are closed. */
export function setMatchPoolSize(n: number | null): void {
  size = n;
  for (const s of slots.splice(0)) {
    if (!s.busy) s.worker.terminate();
    else slots.push(s);
  }
}

function spawn(): Slot {
  const worker = new Worker(new URL("./matchPoolWorker.ts", import.meta.url)) as PoolWorker;
  worker.unref();
  const slot: Slot = { worker, busy: null };
  worker.onmessage = (e: MessageEvent<Reply>) => {
    const job = slot.busy;
    if (!job || job.id !== e.data.id) return;
    slot.busy = null;
    worker.unref();
    if (e.data.ok) {
      stats.jobs++;
      stats.busyMs += e.data.ms;
      job.resolve(e.data.result);
    } else {
      job.reject(new Error(`match pool: ${job.job.fixture.id} failed in a worker\n${e.data.error}`));
    }
    pump();
  };
  worker.onerror = (e) => {
    // The worker died: its job fails (the day fails, as in series), a new worker takes its place.
    const job = slot.busy;
    slot.busy = null;
    worker.terminate();
    const i = slots.indexOf(slot);
    if (i !== -1) slots.splice(i, 1);
    logError("matchPool", `worker crashed${job ? ` on ${job.job.fixture.id}` : ""}`, e);
    job?.reject(new Error(`match pool: worker crashed on ${job.job.fixture.id}: ${e.message}`));
    pump();
  };
  return slot;
}

function pump(): void {
  const want = size ?? configuredSize();
  while (queue.length > 0) {
    let slot = slots.find((s) => !s.busy);
    if (!slot && slots.length < want) {
      slot = spawn();
      slots.push(slot);
    }
    if (!slot) return;
    const job = queue.shift()!;
    slot.busy = job;
    slot.worker.ref();
    slot.worker.postMessage({ id: job.id, job: job.job });
  }
}

function runJob(job: PoolJob): Promise<PoolResult> {
  if ((size ?? configuredSize()) === 0) {
    try {
      const { result, ms } = runPoolJob(job);
      stats.jobs++;
      stats.busyMs += ms;
      return Promise.resolve(result);
    } catch (err) {
      return Promise.reject(err);
    }
  }
  return new Promise<PoolResult>((resolve, reject) => {
    queue.push({ id: nextId++, job, resolve, reject });
    pump();
  });
}

/** Runs one full-engine club match in the pool (or in process with `MATCH_WORKERS=0`). */
export function runFullMatch(job: FullMatchJob): Promise<MatchSimResult> {
  return runJob(job) as Promise<MatchSimResult>;
}

/** A human manager's simulated national game in the pool (stage 22): its recording. */
export function runRecording(job: Omit<RecordingJob, "kind">): Promise<PlayedMatchRecording> {
  return runJob({ kind: "recording", ...job }) as Promise<PlayedMatchRecording>;
}
