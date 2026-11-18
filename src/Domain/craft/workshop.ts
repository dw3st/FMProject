// src/Domain/craft/workshop.ts
import { CRAFT } from "@/Domain/craft/craftConfig";
import { addComponents, addMaterials, emptyStock, takeMaterials } from "@/Domain/craft/stock";
import { addDays } from "@/Domain/dates";
import { clamp } from "@/Domain/math";
import { mulberry32, seedFrom } from "@/Domain/rng";
import type { ClubCraft, ComponentCounts, ComponentId, CraftJob, CraftQuality, MaterialCounts, MaterialId } from "@/types/craftTypes";

export interface WorkshopCtx { saveId: string; clubId?: string; foremanStars: number; foremanSpeed: number }

export const newCraft = (): ClubCraft => ({ workshop: 1, stock: emptyStock(), queue: [], nextId: 1 });
export const benchCount = (level: number): number => 1 + clamp(level, 1, CRAFT.MAX_LEVEL);

export function jobDays(component: ComponentId, qty: number, level: number, foremanSpeed: number): number {
  const speed = (1 - CRAFT.SPEED_STEP * (clamp(level, 1, CRAFT.MAX_LEVEL) - 1)) * foremanSpeed;
  return Math.max(1, Math.ceil((CRAFT.RECIPES[component].days * qty / CRAFT.LOT) * speed));
}

export function materialsFor(component: ComponentId, qty: number): MaterialCounts {
  const out: MaterialCounts = {};
  for (const [m, n] of Object.entries(CRAFT.RECIPES[component].materials) as [MaterialId, number][]) out[m] = n * qty;
  return out;
}

export type EnqueueError = "locked" | "invalidQty" | "queueFull" | "missingMaterials";

export function enqueue(c: ClubCraft, req: { component: ComponentId; qty: number; goodShare?: number }, ctx: WorkshopCtx): { craft: ClubCraft } | { error: EnqueueError } {
  if (!Number.isInteger(req.qty) || req.qty < 1 || req.qty > 500) return { error: "invalidQty" };
  if (CRAFT.RECIPES[req.component].minLevel > c.workshop) return { error: "locked" };
  if (c.queue.length >= CRAFT.MAX_QUEUE) return { error: "queueFull" };
  if (req.goodShare !== undefined && !(req.goodShare >= 0 && req.goodShare <= 1)) return { error: "invalidQty" };
  const taken = takeMaterials(c.stock, materialsFor(req.component, req.qty), req.goodShare);
  if (!taken) return { error: "missingMaterials" };
  const job: CraftJob = {
    id: `job_${c.nextId}`, component: req.component, qty: req.qty, goodShare: taken.goodShare, goodTaken: taken.good,
    days: jobDays(req.component, req.qty, c.workshop, ctx.foremanSpeed),
  };
  return { craft: { ...c, stock: taken.stock, queue: [...c.queue, job], nextId: c.nextId + 1 } };
}

export function moveJob(c: ClubCraft, id: string, dir: "up" | "down"): ClubCraft | null {
  const i = c.queue.findIndex((j) => j.id === id);
  const k = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || k < 0 || k >= c.queue.length || c.queue[i]!.startedOn || c.queue[k]!.startedOn) return null;
  const queue = [...c.queue];
  [queue[i], queue[k]] = [queue[k]!, queue[i]!];
  return { ...c, queue };
}

/** Cancels an order: all the materials back before it started, half after. */
export function cancelJob(c: ClubCraft, id: string): ClubCraft | null {
  const job = c.queue.find((j) => j.id === id);
  if (!job) return null;
  const share = job.startedOn ? CRAFT.CANCEL_RETURN : 1;
  const back: MaterialCounts = {};
  for (const [m, n] of Object.entries(materialsFor(job.component, job.qty)) as [MaterialId, number][]) back[m] = Math.floor(n * share);
  let stock = c.stock;
  const goodPart: MaterialCounts = {};
  const stdPart: MaterialCounts = {};
  for (const [m, n] of Object.entries(back) as [MaterialId, number][]) {
    goodPart[m] = Math.min(n, Math.floor((job.goodTaken[m] ?? 0) * share));
    stdPart[m] = n - goodPart[m]!;
  }
  stock = addMaterials(addMaterials(stock, "standard", stdPart), "good", goodPart);
  return { ...c, stock, queue: c.queue.filter((j) => j.id !== id) };
}

export function rollQuality(key: string, goodShare: number, q: { foremanStars: number; level: number }): CraftQuality {
  const Q = CRAFT.QUALITY;
  const score = Q.FOREMAN * (q.foremanStars - 3) + Q.LEVEL * (q.level - 1) + Q.SUPPLIER * goodShare;
  const exc = clamp(Q.EXC_BASE + score, 0, 1);
  const good = clamp(Q.GOOD, 0, 1 - exc);
  const u = mulberry32(seedFrom(key))();
  return u < exc ? "excellent" : u < exc + good ? "good" : "common";
}

/** One day: finished orders go to the stock (each unit with its own quality), then free benches start the next ones. */
export function advanceQueue(c: ClubCraft, date: string, ctx: WorkshopCtx): { craft: ClubCraft; done: ComponentCounts } {
  let stock = c.stock;
  const done: ComponentCounts = {};
  const left: CraftJob[] = [];
  for (const job of c.queue) {
    if (job.doneOn && job.doneOn <= date) {
      const q = { common: 0, good: 0, excellent: 0 };
      for (let u = 0; u < job.qty; u++) q[rollQuality(`craft:${ctx.saveId}:${ctx.clubId ? ctx.clubId + ":" : ""}${job.id}:${u}`, job.goodShare, { foremanStars: ctx.foremanStars, level: c.workshop })]++;
      stock = addComponents(stock, job.component, q);
      done[job.component] = (done[job.component] ?? 0) + job.qty;
    } else left.push(job);
  }
  let busy = left.filter((j) => j.startedOn).length;
  const queue = left.map((j) => {
    if (j.startedOn || busy >= benchCount(c.workshop)) return j;
    busy++;
    return { ...j, startedOn: date, doneOn: addDays(date, j.days) };
  });
  const changed = queue.some((j, i) => j !== left[i]) || queue.length !== c.queue.length;
  return { craft: changed ? { ...c, stock, queue } : c, done };
}

