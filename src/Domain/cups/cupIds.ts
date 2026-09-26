/** Cup identity helpers. One national cup per leagueData `country`. */

/** `cup_` + country name lower-cased, accents stripped, non-alphanumerics → `_`. */
export function cupSlugOf(country: string): string {
  const base = country
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `cup_${base}`;
}

export function isCupSlug(slug: string): boolean {
  return slug.startsWith("cup_");
}

/** 32-bit FNV-1a hash of a key — seed for mulberry32 (deterministic draws). */
export function seedFrom(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
