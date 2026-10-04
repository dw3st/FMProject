import { FITNESS } from "@/Domain/fitness/fitnessConfig";

/** Capitalizes an injury severity string ("light" → "Light") for i18n key lookup. */
export function capitalizeSeverity(severity: "light" | "medium" | "severe"): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

/** Threshold for the "high load" UI indicator — 70% of `FITNESS.LOAD_HIGH` (see `game/fitness.md`). */
const HIGH_LOAD_THRESHOLD = FITNESS.LOAD_HIGH * 0.7;

/** Whether a player's accumulated `load` warrants the high-load icon (slower recovery, faster in-match drain). */
export function isHighLoad(load: number): boolean {
  return load >= HIGH_LOAD_THRESHOLD;
}
