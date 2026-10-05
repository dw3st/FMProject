/**
 * Instruction matrix runner (Etapa 27): builds the tasks of a plan and plays them on a pool of Bun
 * workers (`instructionMatrixWorker.ts`). Shared by `scripts/instruction-matrix.ts` and the lab's
 * `/matrix` "Instructions" mode. Each worker has its own engine stores.
 */
import { ROLE_VARIANT_IDS } from "@/GameEngine/Configs/RoleVariantConfig";
import { addInstrPair, naturalFormation, RANDOM_FORMATIONS, type InstrPairRaw, type InstrSetSpec, type InstrTask } from "@/lab/instructionMatrix";
import type { RoleVariantId } from "@/types/tacticsTypes";

export type InstrPlanPart = "variants" | "press" | "random" | "marking" | "base";

export interface InstrPlan {
  league: string;
  parts: InstrPlanPart[];
  /** Variants to measure (default: all). */
  variants?: RoleVariantId[];
  /** Matches per edge pair (X instructed vs Y default). */
  matches: number;
  /** Matches per mirror pair (both sides instructed); 0 = none. */
  mirrorMatches: number;
  /** Matches per default-mirror baseline formation. */
  baseMatches: number;
}

const CHUNK = 25;

function chunks(league: string, key: string, formation: string, kind: InstrPairRaw["kind"], spec: InstrSetSpec, matches: number, offsetBase: number): InstrTask[] {
  return Array.from({ length: Math.ceil(matches / CHUNK) }, (_, c) => ({
    league, key, formation, kind, spec,
    matches: Math.min(CHUNK, matches - c * CHUNK),
    offset: offsetBase + c * CHUNK,
  }));
}

export function buildInstrTasks(plan: InstrPlan, offsetBase = 0): InstrTask[] {
  const out: InstrTask[] = [];
  const { league } = plan;
  if (plan.parts.includes("variants")) {
    for (const v of plan.variants ?? ROLE_VARIANT_IDS) {
      const f = naturalFormation(v);
      out.push(...chunks(league, v, f, "edge", { type: "variant", variant: v }, plan.matches, offsetBase));
      if (plan.mirrorMatches > 0) out.push(...chunks(league, v, f, "mirror", { type: "variant", variant: v }, plan.mirrorMatches, offsetBase));
    }
  }
  if (plan.parts.includes("press")) {
    for (const level of ["more", "less"] as const) {
      out.push(...chunks(league, `press_${level}`, "4-3-3", "edge", { type: "press", level }, plan.matches, offsetBase));
      if (plan.mirrorMatches > 0) out.push(...chunks(league, `press_${level}`, "4-3-3", "mirror", { type: "press", level }, plan.mirrorMatches, offsetBase));
    }
  }
  if (plan.parts.includes("random")) {
    out.push(...chunks(league, "random", "random", "mirror", { type: "random" }, Math.max(plan.mirrorMatches, plan.baseMatches), offsetBase));
    out.push(...chunks(league, "random", "random", "base", { type: "none" }, Math.max(plan.mirrorMatches, plan.baseMatches), offsetBase));
  }
  if (plan.parts.includes("marking")) {
    for (const by of ["mid", "cb"] as const) {
      for (const markers of [1, 2] as const) {
        out.push(...chunks(league, `mark_${by}_${markers}`, "4-3-3", "edge", { type: "mark", markers, by }, plan.matches, offsetBase));
      }
    }
  }
  if (plan.parts.includes("base")) {
    for (const f of RANDOM_FORMATIONS) out.push(...chunks(league, "default", f, "base", { type: "none" }, plan.baseMatches, offsetBase));
  }
  return out;
}

/** Plays the tasks on `workers` workers; `onTask` after each finished task (done, total, pairs so far). */
export async function runInstrPool(
  tasks: InstrTask[],
  workers: number,
  onTask?: (done: number, total: number, pairs: InstrPairRaw[]) => void,
): Promise<InstrPairRaw[]> {
  const url = new URL("./instructionMatrixWorker.ts", import.meta.url).href;
  const results = new Map<string, InstrPairRaw>();
  let next = 0;
  let done = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(workers, tasks.length)) }, () =>
    new Promise<void>((resolve, reject) => {
      const w = new Worker(url, { type: "module" });
      const feed = () => {
        if (next >= tasks.length) { w.terminate(); resolve(); return; }
        w.postMessage(tasks[next++]);
      };
      w.onmessage = (e: MessageEvent<InstrPairRaw>) => {
        const p = e.data;
        const k = `${p.kind}|${p.key}|${p.formation}`;
        results.set(k, results.has(k) ? addInstrPair(results.get(k)!, p) : p);
        done++;
        onTask?.(done, tasks.length, [...results.values()]);
        feed();
      };
      w.onerror = (e) => { w.terminate(); reject(new Error(e.message)); };
      feed();
    })));
  return [...results.values()];
}
