/**
 * Tiny client for the lab API. Same-origin (lab server serves both UI + API).
 */

import type {
  BalanceScenario,
  RunStatus,
  ScenarioIndexEntry,
  ScenarioResult,
} from "@/lab/types";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json() as Promise<T>;
}

export interface FormationCatalog {
  supported: string[];
  unsupported: string[];
}

export const labApi = {
  formations: () => getJson<FormationCatalog>("/api/lab/formations"),
  list:       () => getJson<ScenarioIndexEntry[]>("/api/lab/scenarios"),
  load:       (id: string) => getJson<ScenarioResult>(`/api/lab/scenarios/${id}`),
  delete:     async (id: string) => {
    const res = await fetch(`/api/lab/scenarios/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`DELETE ${id} → ${res.status}`);
    return res.json() as Promise<{ deleted: boolean }>;
  },
  run:        (scenario: Partial<BalanceScenario>) =>
                postJson<{ runId: string }>("/api/lab/run", scenario),
  runStatus:  (runId: string) => getJson<RunStatus>(`/api/lab/runs/${runId}`),
  rebuildIndex: () =>
    fetch("/api/lab/scenarios/rebuild-index", { method: "POST" }).then((r) => r.json()),
};

export function streamRun(
  runId: string,
  onUpdate: (status: RunStatus) => void,
): () => void {
  const url = `/api/lab/runs/${runId}/stream`;
  const es = new EventSource(url);
  es.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (data && !data.ping && data.runId) onUpdate(data as RunStatus);
    } catch {
      // ignore malformed frames
    }
  };
  es.onerror = () => {
    // Browser will retry automatically; nothing to do.
  };
  return () => es.close();
}
