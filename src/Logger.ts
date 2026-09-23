import { debugNamespaces } from "@/config";

/** Namespace string for `debugLog` — add `"season"` to `config.debugNamespaces` for verbose season logs. */
export const LOG_NS_SEASON = "season";

/**
 * Logs only when `namespace` is listed in `config.debugNamespaces`.
 * Prefer short messages; pass objects as extra args for detail.
 */
export function debugLog(namespace: string, ...args: unknown[]): void {
  if (!debugNamespaces.includes(namespace)) return;
  console.log(`[${namespace}]`, ...args);
}

/**
 * Always-on lifecycle log for season rollover (archive, new calendar, money).
 * Use for high-signal events you need in production logs; keep payloads small.
 */
export function logSeason(message: string, detail?: Record<string, unknown>): void {
  if (detail !== undefined && Object.keys(detail).length > 0) {
    console.log("[season]", message, detail);
  } else {
    console.log("[season]", message);
  }
}

/** Always-on error log for server-side failures (e.g. a day that could not be persisted). */
export function logError(scope: string, message: string, detail?: unknown): void {
  if (detail !== undefined) console.error(`[${scope}]`, message, detail);
  else console.error(`[${scope}]`, message);
}
