/**
 * In-memory registry of in-flight runs.
 *
 * The lab server starts a run in the background and streams progress to the
 * UI via SSE. We keep the latest progress for each run here so a freshly
 * connected SSE listener can replay the current state.
 */

import { runScenario, buildPairs } from "@/lab/scenarioRunner";
import { saveScenario } from "@/lab/scenarioStorage";
import type { BalanceScenario, PairProgress, RunStatus } from "@/lab/types";

type Listener = (status: RunStatus) => void;

const runs = new Map<string, RunStatus>();
const listeners = new Map<string, Set<Listener>>();

function notify(runId: string): void {
  const status = runs.get(runId);
  const set = listeners.get(runId);
  if (!status || !set) return;
  for (const l of set) {
    try { l(status); } catch { /* ignore listener errors */ }
  }
}

export function subscribe(runId: string, listener: Listener): () => void {
  let set = listeners.get(runId);
  if (!set) {
    set = new Set();
    listeners.set(runId, set);
  }
  set.add(listener);
  // Replay current state.
  const status = runs.get(runId);
  if (status) listener(status);
  return () => {
    const s = listeners.get(runId);
    if (!s) return;
    s.delete(listener);
    if (s.size === 0) listeners.delete(runId);
  };
}

export function getRun(runId: string): RunStatus | undefined {
  return runs.get(runId);
}

export function listRuns(): RunStatus[] {
  return Array.from(runs.values()).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

export function startRun(scenario: BalanceScenario): string {
  const runId = scenario.id;
  const pairs = buildPairs(scenario);
  const status: RunStatus = {
    runId,
    scenario,
    startedAt: new Date().toISOString(),
    pairs: pairs.map<PairProgress>((p) => ({
      variantAId: p.variantA.id,
      variantBId: p.variantB.id,
      done: 0,
      total: scenario.matchesPerPair,
      status: "queued",
    })),
  };
  runs.set(runId, status);
  notify(runId);

  // Fire and forget — background work.
  (async () => {
    try {
      const result = await runScenario(scenario, {
        onProgress: (event) => {
          const cur = runs.get(runId);
          if (!cur) return;
          const pair = cur.pairs.find(
            (p) => p.variantAId === event.variantAId && p.variantBId === event.variantBId,
          );
          if (!pair) return;
          if (event.type === "pair-start") pair.status = "running";
          else if (event.type === "pair-progress") {
            pair.status = "running";
            pair.done = event.done;
            pair.total = event.total;
          } else if (event.type === "pair-done") {
            pair.status = "done";
            pair.done = pair.total;
          } else if (event.type === "pair-error") {
            pair.status = "error";
          }
          notify(runId);
        },
      });
      const entry = await saveScenario(result);
      const cur = runs.get(runId);
      if (cur) {
        cur.completedAt = new Date().toISOString();
        cur.resultFile = entry.file;
        notify(runId);
      }
    } catch (err) {
      const cur = runs.get(runId);
      if (cur) {
        cur.error = err instanceof Error ? err.message : String(err);
        cur.completedAt = new Date().toISOString();
        notify(runId);
      }
    }
  })();

  return runId;
}
