import { createDefaultScoutFilters, type ScoutFilterState } from "@/Domain/scout/scoutFilterState";

/** A named set of scout search filters (#147): no limit on how many, kept per viewer. */
export interface SavedScoutFilter {
  name: string;
  filters: ScoutFilterState;
}

export const SAVED_FILTER_NAME_MAX = 40;

/** The name as stored: trimmed, inner spaces collapsed, at most `SAVED_FILTER_NAME_MAX` characters. */
export function savedFilterName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, SAVED_FILTER_NAME_MAX);
}

/**
 * Adds a saved filter, replacing one with the same name (case-insensitive) in place. An empty name
 * leaves the list unchanged. New names go to the end.
 */
export function addSavedFilter(list: SavedScoutFilter[], rawName: string, filters: ScoutFilterState): SavedScoutFilter[] {
  const name = savedFilterName(rawName);
  if (!name) return list;
  const key = name.toLowerCase();
  const entry = { name, filters };
  const i = list.findIndex((s) => s.name.toLowerCase() === key);
  if (i < 0) return [...list, entry];
  return list.map((s, j) => (j === i ? entry : s));
}

export function removeSavedFilter(list: SavedScoutFilter[], name: string): SavedScoutFilter[] {
  const key = name.toLowerCase();
  return list.filter((s) => s.name.toLowerCase() !== key);
}

/**
 * Saved filters read back from storage: anything malformed is dropped; each entry's filters are
 * completed with the defaults (fields added in later versions).
 */
export function parseSavedFilters(raw: unknown): SavedScoutFilter[] {
  if (!Array.isArray(raw)) return [];
  let out: SavedScoutFilter[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const { name, filters } = e as { name?: unknown; filters?: unknown };
    if (typeof name !== "string" || !filters || typeof filters !== "object") continue;
    const defaults = createDefaultScoutFilters();
    const f = filters as Partial<ScoutFilterState>;
    out = addSavedFilter(out, name, {
      ...defaults,
      ...f,
      attributeRanges: { ...defaults.attributeRanges, ...(f.attributeRanges ?? {}) },
    });
  }
  return out;
}
