/**
 * Reduced motion and graphics quality of the live pitch (art plan phase 8). `calm` = the viewer asked for reduced
 * motion, or the pitch runs in light quality: no fireworks, flares, camera flashes, phone lights, crowd wave or sway,
 * no weather particles, the camera stays on the whole pitch and there is no goal replay. Drawing only.
 */
export type PitchQuality = "high" | "light";

/** The viewer's `prefers-reduced-motion` (false where it cannot be read). */
export function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Automatic quality: frames per second under this, for AUTO_CHECKS checks in a row, switch the match to light. */
export const AUTO_QUALITY = { MIN_FPS: 40, CHECKS: 3, INTERVAL_MS: 2000 } as const;

/** The next automatic-quality state after a reading of the frame rate. */
export function nextAutoQuality(state: { quality: PitchQuality; slow: number }, fps: number): { quality: PitchQuality; slow: number } {
  if (state.quality === "light") return state;
  const slow = fps > 0 && fps < AUTO_QUALITY.MIN_FPS ? state.slow + 1 : 0;
  return { quality: slow >= AUTO_QUALITY.CHECKS ? "light" : "high", slow };
}
