// Season smoke, "Instalações": a works built through the craft path (spec 2026-11-18-club-craft), driven one day
// at a time. Ask the works; on 409 `missingComponents` buy the materials of what is missing in the shop, queue the
// components on the workshop, wait for the queue, ask again. Checks the ledger line of every purchase and that
// every order leaves the queue on its `doneOn` day.
import { materialsFor } from "@/Domain/craft/workshop";
import type { ComponentCounts, ComponentId, MaterialCounts, MaterialId } from "@/types/craftTypes";
import type { LedgerEntry } from "@/Domain/finance/ledger";

type Handler = (r: Request) => Promise<Response>;

export interface CraftBuild {
  label: string;
  request: Record<string, unknown>;
  status: "start" | "waiting" | "built" | "failed";
  attempts: number;
  /** Purchases: total EUR the route charged and the ledger line found for it. */
  purchases: { date: string; total: number; ledger: number }[];
  /** Orders queued: id → last `doneOn` seen. */
  jobs: Map<string, string | null>;
  queuedUnits: number;
  /** Orders that left the queue on another day than their `doneOn` (or stayed after it). */
  wrongDay: string[];
  finishedJobs: number;
  /** Days the request waited for another works of its area. */
  busyDays: number;
  builtOn: string | null;
  project: { id: string; cost: number; end: string } | null;
  quality: string | null;
  error: string | null;
}

export const newCraftBuild = (label: string, request: Record<string, unknown>): CraftBuild => ({
  label, request, status: "start", attempts: 0, purchases: [], jobs: new Map(), queuedUnits: 0, wrongDay: [],
  finishedJobs: 0, busyDays: 0, builtOn: null, project: null, quality: null, error: null,
});

export interface CraftCtx {
  saveId: string;
  session: string;
  /** Today (the seat's current date, the day the routes act on). */
  today: string;
  /** Last day the advance played (orders with `doneOn` up to it must be out of the queue). */
  played: string | null;
  routes: Record<string, unknown>;
  ledgerOf: (date: string) => Promise<LedgerEntry[]>;
}

async function call(ctx: CraftCtx, path: string, method: "GET" | "POST", body?: unknown, params: Record<string, string> = {}) {
  const handler = ctx.routes[path] as Handler;
  const url = `http://localhost${path.replace(":saveId", ctx.saveId).replace(/:(\w+)/g, (_m, k: string) => params[k] ?? "")}`;
  const res = await handler(Object.assign(new Request(url, {
    method, headers: { cookie: `fs_session=${ctx.session}`, "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }), { params: { saveId: ctx.saveId, ...params } }));
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

interface QueueJob { id: string; doneOn?: string }

/** One day of the build. Call it after each advanced day (and once before the run). */
export async function craftBuildStep(b: CraftBuild, ctx: CraftCtx): Promise<void> {
  if (b.status === "built" || b.status === "failed") return;
  const craft = await call(ctx, "/api/saves/:saveId/craft", "GET");
  if (craft.status !== 200) { b.status = "failed"; b.error = `GET craft ${craft.status}`; return; }
  const queue = craft.body.queue as QueueJob[];
  // Orders: out of the queue exactly on their done day.
  for (const [id, doneOn] of b.jobs) {
    const job = queue.find((j) => j.id === id);
    if (job) {
      b.jobs.set(id, job.doneOn ?? null);
      if (ctx.played && job.doneOn && job.doneOn <= ctx.played) b.wrongDay.push(`${id} still queued on ${ctx.played} (done ${job.doneOn})`);
    } else {
      if (ctx.played && doneOn && doneOn > ctx.played) b.wrongDay.push(`${id} left on ${ctx.played} before ${doneOn}`);
      if (ctx.played && doneOn === null) b.wrongDay.push(`${id} left the queue without starting`);
      b.finishedJobs++;
      b.jobs.delete(id);
    }
  }
  if (b.status === "waiting" && b.jobs.size > 0) return;

  const res = await call(ctx, "/api/saves/:saveId/facilities/request", "POST", b.request);
  if (res.status === 200 && res.body.built === true) {
    b.status = "built";
    b.builtOn = ctx.today;
    b.project = res.body.project as CraftBuild["project"];
    b.quality = (res.body.quality as string | null) ?? null;
    return;
  }
  // One works per group (#152): another works of the same area running — wait and ask again tomorrow.
  if (res.status === 409 && res.body.error === "busy") { b.busyDays++; return; }
  if (res.status !== 409 || res.body.error !== "missingComponents" || ++b.attempts > 4) {
    b.status = "failed";
    b.error = `request ${res.status} ${JSON.stringify(res.body.error)} after ${b.attempts} attempt(s)`;
    return;
  }
  const missing = res.body.missing as ComponentCounts;
  const need: MaterialCounts = {};
  for (const [id, n] of Object.entries(missing) as [ComponentId, number][]) {
    for (const [m, q] of Object.entries(materialsFor(id, n)) as [MaterialId, number][]) need[m] = (need[m] ?? 0) + q;
  }
  const items = (Object.entries(need) as [MaterialId, number][]).filter(([, q]) => q > 0)
    .flatMap(([material, qty]) => { const out = []; for (let left = qty; left > 0; left -= 10_000) out.push({ material, supplier: "standard", qty: Math.min(10_000, left) }); return out; });
  if (items.length > 0) {
    const materialLines = async () => (await ctx.ledgerOf(ctx.today))
      .filter((e) => e.kind === "facilities" && e.ref?.facility === "materials").reduce((s, e) => s - e.amount, 0);
    const before = await materialLines();
    const buy = await call(ctx, "/api/saves/:saveId/craft/buy", "POST", { items });
    if (buy.status !== 200) { b.status = "failed"; b.error = `buy ${buy.status} ${JSON.stringify(buy.body.error)}`; return; }
    b.purchases.push({ date: ctx.today, total: buy.body.total as number, ledger: (await materialLines()) - before });
  }
  for (const [component, n] of Object.entries(missing) as [ComponentId, number][]) {
    for (let left = n; left > 0; left -= 500) {
      const qty = Math.min(500, left);
      const q = await call(ctx, "/api/saves/:saveId/craft/queue", "POST", { component, qty });
      if (q.status !== 200) { b.status = "failed"; b.error = `queue ${component} ×${qty} → ${q.status} ${JSON.stringify(q.body.error)}`; return; }
      const job = (q.body.queue as QueueJob[]).at(-1)!;
      b.jobs.set(job.id, job.doneOn ?? null);
      b.queuedUnits += qty;
    }
  }
  b.status = "waiting";
}
