import PKG from "@/../package.json";

/** Version of the running game (`package.json`, kept equal to the changelog's `CURRENT_VERSION`). */
export const GAME_VERSION: string = PKG.version;

/**
 * Oldest game version whose saves still load correctly in this build.
 * RAISE IT whenever the save format changes (new required file or field, changed shape):
 * saves created before it are flagged as incompatible on the start screen.
 * 4.22: the national-team state of the player's manager.
 */
export const MIN_COMPATIBLE_SAVE_VERSION = "4.22";

export type SaveCompatibility = "ok" | "outdated";

/** Numeric, part-by-part comparison ("4.21.2" < "4.22" < "4.22.1"); missing parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((p) => Number.parseInt(p, 10) || 0);
  const pb = b.split(".").map((p) => Number.parseInt(p, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** A save without a recorded version predates 4.22 and is always outdated. */
export function saveCompatibility(
  gameVersion: string | undefined,
  min: string = MIN_COMPATIBLE_SAVE_VERSION,
): SaveCompatibility {
  if (!gameVersion || !/^\d+(\.\d+)*$/.test(gameVersion)) return "outdated";
  return compareVersions(gameVersion, min) >= 0 ? "ok" : "outdated";
}
