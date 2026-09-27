import type { ContinentalSlug } from "@/types/calendarTypes";

export interface ContinentalCompetition {
  slug: ContinentalSlug;
  continent: "Europe" | "South America";
  /** The first-tier competition of the continent (true) or the second (false). */
  primary: boolean;
  /** 0=Sun … 6=Sat. */
  weekday: number;
  /** Zone id in leagueData that grants a place. */
  zoneIds: string[];
}

export const CONTINENTAL: Record<ContinentalSlug, ContinentalCompetition> = {
  ucl: { slug: "ucl", continent: "Europe", primary: true, weekday: 2, zoneIds: ["ucl"] },
  uel: { slug: "uel", continent: "Europe", primary: false, weekday: 4, zoneIds: ["uel", "uecl"] },
  lib: { slug: "lib", continent: "South America", primary: true, weekday: 3, zoneIds: ["lib"] },
  sud: { slug: "sud", continent: "South America", primary: false, weekday: 4, zoneIds: ["sud"] },
};

export const CONTINENTAL_SLUGS = Object.keys(CONTINENTAL) as ContinentalSlug[];

export function isContinentalSlug(slug: string): slug is ContinentalSlug {
  return slug in CONTINENTAL;
}

/** Competitions of a continent, primary first. */
export function competitionsOf(continent: "Europe" | "South America"): ContinentalCompetition[] {
  return CONTINENTAL_SLUGS.map((s) => CONTINENTAL[s]).filter((c) => c.continent === continent)
    .sort((a, b) => Number(b.primary) - Number(a.primary));
}
