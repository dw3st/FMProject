/**
 * Formation matrix runner (Etapa 19): splits the pairs into small tasks and plays them on a pool of
 * Bun workers (`formationMatrixWorker.ts`). Shared by `scripts/formation-matrix.ts` and the lab's
 * "Formation matrix" page. Each worker has its own engine stores, so pairs never collide.
 */
import { addPair, type PairRaw } from "@/lab/formationMatrix";

export interface MatrixTask { league: string; x: string; y: string; matches: number; offset: number }

export interface MatrixPlan {
  league: string;
  /** Formations tested against every reference. */
  rows: string[];
  /** Reference formations (the columns). */
  refs: string[];
  /** Matches per pair. */
  matches: number;
  /** Also play every row against itself (goal volume of the mirror match). */
  mirror: boolean;
  /** Only the mirror matches. */
  mirrorOnly?: boolean;
}

/** Matches per task: small enough to spread the pairs over the pool, big enough to amortise. */
const CHUNK = 25;

/** Unordered pairs of the plan (a reference pair is played once), then cut into tasks. */
export function buildMatrixTasks(plan: MatrixPlan, offsetBase = 0): MatrixTask[] {
  const seen = new Set<string>();
  const pairs: [string, string][] = [];
  const add = (x: string, y: string) => {
    const k = [x, y].sort().join("|");
    if (seen.has(k)) return;
    seen.add(k);
    pairs.push([x, y]);
  };
  if (!plan.mirrorOnly) for (const x of plan.rows) for (const y of plan.refs) if (x !== y) add(x, y);
  if (plan.mirror || plan.mirrorOnly) for (const x of plan.rows) add(x, x);
  return pairs.flatMap(([x, y]) =>
    Array.from({ length: Math.ceil(plan.matches / CHUNK) }, (_, c) => ({
      league: plan.league, x, y,
      matches: Math.min(CHUNK, plan.matches - c * CHUNK),
      offset: offsetBase + c * CHUNK,
    })));
}

/** Plays the tasks on `workers` workers; `onTask` after each finished task (done, total). */
export async function runMatrixPool(
  tasks: MatrixTask[],
  workers: number,
  onTask?: (done: number, total: number, pairs: PairRaw[]) => void,
): Promise<PairRaw[]> {
  const url = new URL("./formationMatrixWorker.ts", import.meta.url).href;
  const results = new Map<string, PairRaw>();
  let next = 0;
  let done = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(workers, tasks.length)) }, () =>
    new Promise<void>((resolve, reject) => {
      const w = new Worker(url, { type: "module" });
      const feed = () => {
        if (next >= tasks.length) { w.terminate(); resolve(); return; }
        w.postMessage(tasks[next++]);
      };
      w.onmessage = (e: MessageEvent<PairRaw>) => {
        const p = e.data;
        const k = `${p.x}|${p.y}`;
        results.set(k, results.has(k) ? addPair(results.get(k)!, p) : p);
        done++;
        onTask?.(done, tasks.length, [...results.values()]);
        feed();
      };
      w.onerror = (e) => { w.terminate(); reject(new Error(e.message)); };
      feed();
    })));
  return [...results.values()];
}
