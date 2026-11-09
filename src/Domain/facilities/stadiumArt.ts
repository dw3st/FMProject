import type { FacilityItemId } from "@/types/facilityTypes";

/** The stadium items (`facilityItems.ts`): their levels pick the painted ground of the Club screen (4.47.14). */
export const STADIUM_ART_ITEMS: readonly FacilityItemId[] = ["stadiumPitch", "seats", "stadiumStructure"];

/** Painted ground 1..5 of the Club screen: the mean level (1..10) of the stadium items, two levels per painting. */
export function stadiumArtLevel(levels: readonly number[]): 1 | 2 | 3 | 4 | 5 {
  if (levels.length === 0) return 1;
  const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
  return Math.min(5, Math.max(1, Math.ceil(mean / 2))) as 1 | 2 | 3 | 4 | 5;
}

/** The ground seen from above, phase 1..5 by the same level (the stand map of the Club screen, 8.8.26). */
export const stadiumMapFile = (level: number) => `club/stadium-map-${level}.webp`;

/** The file of a painted ground (game art, `GAME_ART_FILES`). */
export const stadiumArtFile = (level: number) => `club/stadium-lv-${level}.webp`;
