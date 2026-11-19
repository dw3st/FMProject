/**
 * Bun Worker of the match pool (`matchPool.ts`): runs full-engine club matches one at a time. A worker has its own
 * engine globals (gameBus, tactic configs per team, Statistics, PlayerRating), like the live match worker
 * (`h2h/h2hWorker.ts`), so matches in different workers never touch each other.
 *
 * In : `{ id, job }`. Out: `{ id, ok: true, result, ms }` or `{ id, ok: false, error }`.
 */
import { runFullMatchJob, type FullMatchJob } from "@/backend/matchPoolJob";

declare const self: Worker;

self.onmessage = (e: MessageEvent<{ id: number; job: FullMatchJob }>) => {
  const { id, job } = e.data;
  try {
    const { result, ms } = runFullMatchJob(job);
    postMessage({ id, ok: true, result, ms });
  } catch (err) {
    postMessage({ id, ok: false, error: err instanceof Error ? (err.stack ?? err.message) : String(err) });
  }
};
