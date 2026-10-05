/**
 * Lab "/matrix" — Instructions mode (Etapa 27): one background run of the instruction matrix,
 * progress in memory (polled by the page), finished runs saved under
 * `debug/balance/lab/instructions/`. Same shape as `formationMatrixRun.ts`.
 */
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { buildInstrTasks, runInstrPool, type InstrPlan } from "@/lab/instructionMatrixPool";
import type { InstrPairRaw } from "@/lab/instructionMatrixSummary";

const ROOT = "debug/balance/lab/instructions";
/** Worker cap: the engine is memory-hungry. */
const MAX_WORKERS = 3;

export interface InstrMatrixRun {
  id: string;
  plan: InstrPlan;
  startedAt: string;
  completedAt?: string;
  error?: string;
  done: number;
  total: number;
  pairs: InstrPairRaw[];
}

const runs = new Map<string, InstrMatrixRun>();

export function startInstrMatrixRun(plan: InstrPlan, workers: number): InstrMatrixRun {
  const id = `instr_${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const tasks = buildInstrTasks(plan, Math.floor(Math.random() * 1000) * 2);
  const run: InstrMatrixRun = { id, plan, startedAt: new Date().toISOString(), done: 0, total: tasks.length, pairs: [] };
  runs.set(id, run);
  void (async () => {
    try {
      run.pairs = await runInstrPool(tasks, Math.min(MAX_WORKERS, workers), (done, total, pairs) => {
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

export async function getInstrMatrixRun(id: string): Promise<InstrMatrixRun | null> {
  const live = runs.get(id);
  if (live) return live;
  if (!/^instr_[\w-]+$/.test(id)) return null;
  const file = Bun.file(join(ROOT, `${id}.json`));
  return (await file.exists()) ? ((await file.json()) as InstrMatrixRun) : null;
}

export async function listInstrMatrixRuns(): Promise<Omit<InstrMatrixRun, "pairs">[]> {
  await mkdir(ROOT, { recursive: true });
  const saved = (await readdir(ROOT)).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
  const ids = [...new Set([...runs.keys(), ...saved])];
  const out: Omit<InstrMatrixRun, "pairs">[] = [];
  for (const id of ids) {
    const r = await getInstrMatrixRun(id);
    if (!r) continue;
    const { pairs: _pairs, ...meta } = r;
    out.push(meta);
  }
  return out.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}
