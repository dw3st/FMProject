/**
 * Where the page loads the highlights Worker from (stage 19, `live-modes.md`). The server bundles
 * `GameEngine/Support/forecastWorker.ts` on the first request (`backend/forecastWorkerAsset.ts`); the game version in the
 * path makes a deployed bundle safe to cache forever.
 */
import { GAME_VERSION } from "@/Domain/saveVersion";

export const FORECAST_WORKER_ROUTE = "/assets/forecast-worker/:ver";

export function forecastWorkerUrl(): string {
  return `/assets/forecast-worker/${encodeURIComponent(GAME_VERSION)}.js`;
}
