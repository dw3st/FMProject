import realLegendsData from "@/Data/realLegends.json";
import { clamp } from "@/Domain/math";
import { statsFor } from "@/Domain/youth/youth";
import type { RetiredPlayer } from "@/types/playerTypes";

/**
 * Real football legends (8.9.26, user request): Ballon d'Or winners, World Cup winners since 1930 and footballers
 * capped by their country with a Wikipedia article in 40+ languages, from Wikidata (CC0;
 * `scripts/fetchWikidataLegends.ts`). The achievements shop offers them instead of the world's own retirees. Each one
 * comes back once per world: the one brought back is written into `retired.json` with `legendBy`, and that record wins.
 */
export interface RealLegendEntry {
  id: string;
  wikidata: string;
  name: string;
  birthYear: number;
  nationality: string | null;
  line: "GK" | "DEF" | "MID" | "FWD";
  position: string;
  ballonDor: number;
  worldCups: number[];
  /** Wikipedia languages with an article about him (fame). */
  fame: number;
}

export const REAL_LEGEND_ENTRIES = realLegendsData as RealLegendEntry[];

/** "Retired" long before any world starts: always known to the shop's season filter. */
const RETIRED_ON = "1990-01-01";

/** The strongest: a Ballon d'Or, a World Cup with real fame, or very famous. */
export function realWorldClass(e: RealLegendEntry): boolean {
  return e.ballonDor > 0 || (e.worldCups.length > 0 && e.fame >= 60) || e.fame >= 90;
}

/** Level of the stats kept for him (only the shape counts: a reborn starts from his club's level). */
export function realLegendLevel(e: RealLegendEntry): number {
  return clamp(4.8 + (e.fame - 40) / 60 + 0.3 * Math.min(e.ballonDor, 2) + 0.15 * Math.min(e.worldCups.length, 2), 4.8, 7.2);
}

export function realLegendRetiree(e: RealLegendEntry): RetiredPlayer {
  return {
    id: e.id, name: e.name, nationality: e.nationality, positions: [e.position], preferredFoot: "right",
    profile: { summary: "", archetype: "Legend" }, retiredOn: RETIRED_ON, squadId: "", age: 36,
    wasWorldClass: realWorldClass(e), statsAtRetirement: statsFor(e.id, e.position, realLegendLevel(e)),
    appearances: 0, goals: 0,
    real: { wikidata: e.wikidata, birthYear: e.birthYear, ballonDor: e.ballonDor, worldCups: e.worldCups },
  };
}

let cache: RetiredPlayer[] | null = null;
function allRealLegends(): RetiredPlayer[] {
  cache ??= REAL_LEGEND_ENTRIES.map(realLegendRetiree);
  return cache;
}

/** The real legends as the world sees them: the record in `retired.json` (brought back, `legendBy`) wins. */
export function realLegendPool(retired: readonly RetiredPlayer[]): RetiredPlayer[] {
  const stored = new Map(retired.filter((r) => r.real).map((r) => [r.id, r]));
  return allRealLegends().map((r) => stored.get(r.id) ?? r);
}
