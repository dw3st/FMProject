/**
 * Env overrides for a tuning config (stage 21 calibration): `NAME='{"KEY":1,"NESTED":{"KEY":2}}'` replaces the numbers
 * of a config object in place, once at load. Only keys that already exist and only numbers are taken; a malformed
 * value is ignored. Scripts and workers read it; the game never sets these variables.
 */
export function applyEnvOverrides(target: object, envName: string): void {
  try {
    const raw = typeof process !== 'undefined' ? process.env?.[envName] : undefined;
    if (!raw) return;
    merge(target as Record<string, unknown>, JSON.parse(raw) as Record<string, unknown>);
  } catch { /* ignore a malformed override */ }
}

function merge(target: Record<string, unknown>, src: Record<string, unknown>): void {
  for (const k of Object.keys(src)) {
    if (!(k in target)) continue;
    const v = src[k];
    const t = target[k];
    if (typeof v === 'number' && typeof t === 'number') target[k] = v;
    else if (v && typeof v === 'object' && t && typeof t === 'object') merge(t as Record<string, unknown>, v as Record<string, unknown>);
  }
}
