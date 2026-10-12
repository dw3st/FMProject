/**
 * Favourite competitions of the Stats rankings (#150): shortcuts shown as chips next to the
 * competition selector. Kept per viewer in the browser (the UI wraps the storage); this module is
 * the pure list logic.
 */
export const MAX_FAVORITE_COMPETITIONS = 6;

/** Adds the slug (at the end) or removes it; past the limit the oldest favourite leaves. */
export function toggleFavoriteCompetition(list: readonly string[], slug: string): string[] {
  if (list.includes(slug)) return list.filter((s) => s !== slug);
  return [...list, slug].slice(-MAX_FAVORITE_COMPETITIONS);
}

/** Reads a stored list: strings only, no duplicates, only `known` slugs when given, at most the limit. */
export function parseFavoriteCompetitions(raw: string | null, known?: ReadonlySet<string>): string[] {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== "string" || out.includes(v)) continue;
    if (known && !known.has(v)) continue;
    out.push(v);
  }
  return out.slice(0, MAX_FAVORITE_COMPETITIONS);
}
