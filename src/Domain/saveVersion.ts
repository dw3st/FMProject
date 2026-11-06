import PKG from "@/../package.json";

/** Version of the running game (`package.json`, kept equal to the changelog's `CURRENT_VERSION`). */
export const GAME_VERSION: string = PKG.version;

/**
 * The version scheme goes 1.0 … 1.9, 2.0 … (`.claude/rules/changelog.md`). Releases from 2026-10-08 to 2026-11-06 were
 * numbered 4.10 … 4.48 by mistake and were renamed (2026-11-06): 4.(10 + k) is (5 + ⌊k/10⌋).(k mod 10), patches kept
 * (4.41.53 = 8.1.53). Saves and browsers still hold the old names, so every comparison goes through this.
 */
export function canonicalVersion(v: string): string {
  const m = /^4\.(\d+)((?:\.\d+)*)$/.exec(v);
  if (!m) return v;
  const minor = Number.parseInt(m[1]!, 10);
  if (minor < 10) return v;
  const k = minor - 10;
  return `${5 + Math.floor(k / 10)}.${k % 10}${m[2]}`;
}

/**
 * Oldest game version whose saves still load correctly in this build.
 * RAISE IT whenever the save format changes (new required file or field, changed shape):
 * saves created before it are flagged as incompatible on the start screen.
 * 4.22: the national-team state of the player's manager.
 * 6.5 (old name 4.25): the friends league (`SaveMeta.world`) and the group advance state of each seat.
 */
export const MIN_COMPATIBLE_SAVE_VERSION = "6.5";

export type SaveCompatibility = "ok" | "outdated";

/** Numeric, part-by-part comparison ("4.2.2" < "4.3" < "4.3.1", old names renamed first); missing parts count as 0. */
export function compareVersions(a: string, b: string): number {
  a = canonicalVersion(a);
  b = canonicalVersion(b);
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
