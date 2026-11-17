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

// `lib` plays Tuesday, not the Wednesday the design doc originally specified: every national cup
// in the world plays on a fixed Wednesday (`cupDates.ts`'s `WEDNESDAY`), so a Wednesday Libertadores
// would collide, same-day, with any country's cup on that exact date — impossible to avoid, not
// just hard to schedule around (see continentalWorld.ts's busy-set comment). Real Copa Libertadores
// fixtures do run Tuesday-Thursday, so this is also closer to the real competition, not only a
// scheduling workaround.
export const CONTINENTAL: Record<ContinentalSlug, ContinentalCompetition> = {
  ucl: { slug: "ucl", continent: "Europe", primary: true, weekday: 2, zoneIds: ["ucl"] },
  uel: { slug: "uel", continent: "Europe", primary: false, weekday: 4, zoneIds: ["uel", "uecl"] },
  lib: { slug: "lib", continent: "South America", primary: true, weekday: 2, zoneIds: ["lib"] },
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

/** Format of a newly generated season: the league phase in Europe (UCL/UEL, the real format since 2024), groups in South America. */
export function continentalFormatOf(continent: "Europe" | "South America"): "league" | "groups" {
  return continent === "Europe" ? "league" : "groups";
}

/** Clubs of a competition's season per format: 36 in the league phase, 32 with groups. */
export function continentalClubCount(format: "league" | "groups"): number {
  return format === "league" ? 36 : 32;
}

/** Every club in a continental season, whatever the format (group members, or the league-phase pots). */
export function continentalClubIds(cont: { groups: { clubs: string[] }[]; pots?: string[][] }): string[] {
  return cont.pots ? cont.pots.flat() : cont.groups.flatMap((g) => g.clubs);
}

/** Whether a club takes part in this continental season. */
export function inContinental(cont: { groups: { clubs: string[] }[]; pots?: string[][] }, clubId: string): boolean {
  return cont.pots ? cont.pots.some((p) => p.includes(clubId)) : cont.groups.some((g) => g.clubs.includes(clubId));
}
