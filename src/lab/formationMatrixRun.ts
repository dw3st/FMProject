/**
 * Lab "Formation matrix" runs (Etapa 19): one background run at a time per request, progress kept
 * in memory (polled by the page), finished runs saved under `debug/balance/lab/matrix/`.
 */
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { buildMatrixTasks, runMatrixPool, type MatrixPlan } from "@/lab/formationMatrixPool";
import type { PairRaw } from "@/lab/formationMatrix";

const ROOT = "debug/balance/lab/matrix";
/** Worker cap: the engine is memory-hungry, the lab machine shares the CPU with the game server. */
export const MATRIX_MAX_WORKERS = 4;

export interface MatrixRun {
  id: string;
  plan: MatrixPlan;
  startedAt: string;
  completedAt?: string;
  error?: string;
  done: number;
  total: number;
  pairs: PairRaw[];
}

const runs = new Map<string, MatrixRun>();

export function startMatrixRun(plan: MatrixPlan, workers: number): MatrixRun {
  const id = `matrix_${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const tasks = buildMatrixTasks(plan, Math.floor(Math.random() * 1000) * 2);
  const run: MatrixRun = { id, plan, startedAt: new Date().toISOString(), done: 0, total: tasks.length, pairs: [] };
  runs.set(id, run);
  void (async () => {
    try {
      run.pairs = await runMatrixPool(tasks, Math.min(MATRIX_MAX_WORKERS, workers), (done, total, pairs) => {
        run.done = done; run.total = total; run.pairs = pairs;
      });
      await mkdir(ROOT, { recursive: true });
      await Bun.write(join(ROOT, `${id}.json`), JSON.stringify({ ...run, completedAt: new Date().toISOString() }));
    } catch (err) {
      run.error = err instanceof Error ? err.message : String(err);
    } finally {
      run.completedAt = new Date().toISOString();
    }
  })();
  return run;
}

/** In-flight or finished run of this process, else a saved one. */
export async function getMatrixRun(id: string): Promise<MatrixRun | null> {
  const live = runs.get(id);
  if (live) return live;
  if (!/^matrix_[\w-]+$/.test(id)) return null;
  const file = Bun.file(join(ROOT, `${id}.json`));
  return (await file.exists()) ? ((await file.json()) as MatrixRun) : null;
}

/** Saved and live runs, newest first (without the pairs). */
export async function listMatrixRuns(): Promise<Omit<MatrixRun, "pairs">[]> {
  await mkdir(ROOT, { recursive: true });
  const saved = (await readdir(ROOT)).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
  const ids = [...new Set([...runs.keys(), ...saved])];
  const out: Omit<MatrixRun, "pairs">[] = [];
  for (const id of ids) {
    const r = await getMatrixRun(id);
    if (!r) continue;
    const { pairs: _pairs, ...meta } = r;
    out.push(meta);
  }
  return out.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}
