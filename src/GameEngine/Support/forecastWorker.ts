/**
 * Browser Worker of the highlights mode (engine rebuild stage 19, `live-modes.md`): runs `ForecastCore` off the page's
 * thread. Bundled on its own by the server (`/assets/forecast-worker.js`, `backend/forecastWorkerAsset.ts`).
 *
 * In : `{ type: "start", gen, snap, opts }` (a new forecast, dropping the running one), `{ type: "stop" }`.
 * Out: `{ type: "chunk", gen, chunk }` as windows become final, in slices of `SLICE_MS` so a new start is heard soon.
 */
import { createForecast, type Forecast, type ForecastChunk, type ForecastOptions } from "@/GameEngine/Support/ForecastCore";
import type { LiveSnapshot } from "@/GameEngine/Support/LiveSnapshot";

export type ForecastIn =
  | { type: "start"; gen: number; snap: LiveSnapshot; opts: ForecastOptions }
  | { type: "stop" };
export type ForecastOut = { type: "chunk"; gen: number; chunk: ForecastChunk } | { type: "error"; gen: number; message: string };

const SLICE_MS = 30;
const ctx = self as unknown as { postMessage(m: ForecastOut): void; onmessage: ((e: MessageEvent<ForecastIn>) => void) | null };

let current: { gen: number; fc: Forecast } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function stop(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  current?.fc.dispose();
  current = null;
}

function slice(): void {
  timer = null;
  const run = current;
  if (!run) return;
  try {
    const chunk = run.fc.run(100_000, performance.now() + SLICE_MS);
    // Always posted: the clock it reached feeds the page's timeline ("simulated up to").
    ctx.postMessage({ type: "chunk", gen: run.gen, chunk });
  } catch (e) {
    ctx.postMessage({ type: "error", gen: run.gen, message: e instanceof Error ? e.message : String(e) });
    stop();
    return;
  }
  if (run.fc.done) { stop(); return; }
  timer = setTimeout(slice, 0);
}

ctx.onmessage = (e) => {
  const msg = e.data;
  stop();
  if (msg.type !== "start") return;
  current = { gen: msg.gen, fc: createForecast(msg.snap, msg.opts) };
  timer = setTimeout(slice, 0);
};
