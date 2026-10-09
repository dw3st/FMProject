/** Cup identity helpers. One national cup per leagueData `country`. */

/** Country name lower-cased, accents stripped, non-alphanumerics → `_` (shared by the cup and youth slugs). */
export function countryKey(country: string): string {
  return country
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** `cup_` + `countryKey(country)`. */
export function cupSlugOf(country: string): string {
  return `cup_${countryKey(country)}`;
}

export function isCupSlug(slug: string): boolean {
  return slug.startsWith("cup_");
}
