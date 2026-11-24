import { cupSlugOf } from "@/Domain/cups/cupIds";
import { competitionsOf } from "@/Domain/continental/competitions";
import type { ManagerRecord } from "@/types/managerTypes";

/** One trophy of a country's gallery (tester report b920ecec): a division, the national cup or a continental cup. */
export interface GalleryTrophy {
  slug: string;
  kind: "league" | "cup" | "continental";
  count: number;
}

interface GalleryLeague { slug: string; country: string }

/**
 * Every trophy a manager can win in one country, in order: the leagues of the country as the catalog lists them
 * (top division first), the national cup, then the continental cups of its continent (and the Intercontinental).
 * `count` = titles of that competition in the manager's record (promotions and national-team titles left out).
 */
export function trophyGallery(
  country: string,
  continent: string | null,
  leagues: GalleryLeague[],
  titles: ManagerRecord["titles"],
): GalleryTrophy[] {
  const won = new Map<string, number>();
  for (const ti of titles) {
    if (ti.kind !== "league" && ti.kind !== "cup" && ti.kind !== "continental") continue;
    won.set(ti.competition, (won.get(ti.competition) ?? 0) + 1);
  }
  const out: GalleryTrophy[] = leagues
    .filter((l) => l.country === country)
    .map((l) => ({ slug: l.slug, kind: "league" as const, count: won.get(l.slug) ?? 0 }));
  if (out.length === 0) return out;
  const cup = cupSlugOf(country);
  out.push({ slug: cup, kind: "cup", count: won.get(cup) ?? 0 });
  if (continent === "Europe" || continent === "South America") {
    for (const c of competitionsOf(continent)) out.push({ slug: c.slug, kind: "continental", count: won.get(c.slug) ?? 0 });
    out.push({ slug: "icc", kind: "continental", count: won.get("icc") ?? 0 });
  }
  return out;
}

/** Countries where the manager has a league or cup title, most titles first (ties by name). */
export function countriesWithTitles(leagues: GalleryLeague[], titles: ManagerRecord["titles"]): string[] {
  const countryOf = new Map<string, string>();
  for (const l of leagues) {
    countryOf.set(l.slug, l.country);
    countryOf.set(cupSlugOf(l.country), l.country);
  }
  const n = new Map<string, number>();
  for (const ti of titles) {
    const c = countryOf.get(ti.competition);
    if (c && (ti.kind === "league" || ti.kind === "cup")) n.set(c, (n.get(c) ?? 0) + 1);
  }
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
}
