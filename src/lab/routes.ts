/**
 * Lab API routes — registered by src/lab/server.ts.
 */

import { readdir } from "node:fs/promises";
import {
  deleteScenario,
  listScenarios,
  loadScenario,
  rebuildIndex,
} from "@/lab/scenarioStorage";
import { getRun, listRuns, startRun, subscribe } from "@/lab/runRegistry";
import { SUPPORTED_FORMATIONS } from "@/GameEngine/Domain/SetPieceLayouts";
import type { BalanceScenario } from "@/lab/types";

const FORMATIONS_DIR = new URL("../Data/formations/", import.meta.url).pathname;

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function genId(prefix: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${ts}_${rnd}`;
}

function validateScenario(s: unknown): s is BalanceScenario {
  if (!s || typeof s !== "object") return false;
  const o = s as Partial<BalanceScenario>;
  return (
    typeof o.name === "string" &&
    typeof o.matchesPerPair === "number" &&
    o.matchesPerPair >= 1 &&
    Array.isArray(o.variants) &&
    o.variants.length >= 2
  );
}

export const labApiRoutes = {
  "/api/lab/formations": async () => {
    const files = await readdir(FORMATIONS_DIR);
    const all = files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
    const supported = all.filter((id) => SUPPORTED_FORMATIONS.has(id));
    const unsupported = all.filter((id) => !SUPPORTED_FORMATIONS.has(id));
    return jsonResponse({ supported, unsupported });
  },

  "/api/lab/scenarios": async (req: Request) => {
    if (req.method === "GET") {
      const entries = await listScenarios();
      return jsonResponse(entries);
    }
    return new Response("Method not allowed", { status: 405 });
  },

  "/api/lab/scenarios/:id": async (req: Request) => {
    const { id } = (req as Request & { params: { id: string } }).params;
    if (req.method === "GET") {
      const result = await loadScenario(id);
      if (!result) return jsonResponse({ error: "not_found" }, 404);
      return jsonResponse(result);
    }
    if (req.method === "DELETE") {
      const ok = await deleteScenario(id);
      return jsonResponse({ deleted: ok });
    }
    return new Response("Method not allowed", { status: 405 });
  },

  "/api/lab/scenarios/rebuild-index": async (req: Request) => {
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
    const idx = await rebuildIndex();
    return jsonResponse(idx);
  },

  "/api/lab/run": async (req: Request) => {
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
    const body = (await req.json()) as Partial<BalanceScenario>;
    const scenario: BalanceScenario = {
      id: body.id || genId("scn"),
      name: body.name ?? "Untitled scenario",
      description: body.description,
      matchesPerPair: body.matchesPerPair ?? 50,
      variants: body.variants ?? [],
    };
    if (!validateScenario(scenario)) {
      return jsonResponse({ error: "invalid_scenario" }, 400);
    }
    const runId = startRun(scenario);
    return jsonResponse({ runId });
  },

  "/api/lab/runs": async () => {
    return jsonResponse(listRuns());
  },

  "/api/lab/runs/:id": async (req: Request) => {
    const { id } = (req as Request & { params: { id: string } }).params;
    const status = getRun(id);
    if (!status) return jsonResponse({ error: "not_found" }, 404);
    return jsonResponse(status);
  },

  "/api/lab/runs/:id/stream": async (req: Request) => {
    const { id } = (req as Request & { params: { id: string } }).params;
    if (!getRun(id)) return jsonResponse({ error: "not_found" }, 404);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        const send = (data: unknown) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch {
            // Stream already closed.
          }
        };
        const unsubscribe = subscribe(id, (status) => {
          send(status);
          if (status.completedAt) {
            try { controller.close(); } catch { /* already closed */ }
            unsubscribe();
          }
        });
        // Initial heartbeat in case there are no immediate events.
        send({ runId: id, ping: true });

        const ping = setInterval(() => send({ runId: id, ping: true }), 15_000);
        const cleanup = () => { clearInterval(ping); unsubscribe(); };
        // @ts-expect-error — Bun supports this signal handler shape on streams.
        controller.signal?.addEventListener?.("abort", cleanup);
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        "connection": "keep-alive",
      },
    });
  },
} as const;
