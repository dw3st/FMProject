import type { FacilityItemId, StandId } from "@/types/facilityTypes";

/** The painted club complex (Club → Facilities, new visual): 1600 × 700, game art (`GAME_ART_FILES`). */
export const CLUB_MAP_FILE = "club/club-map-1.webp";
export const CLUB_MAP_W = 1600;
export const CLUB_MAP_H = 700;

/** Where each item sits on the painting, in pixels of the 1600 × 700 image (mock `club_map_mock.py`). */
const ITEM_PX: Record<FacilityItemId, [number, number]> = {
  stadiumPitch: [800, 445],
  seats: [655, 318],
  stadiumStructure: [1092, 505],
  trainingPitches: [215, 425],
  gym: [300, 228],
  pool: [300, 548],
  physio: [392, 418],
  canteen: [500, 206],
  academyPitches: [1310, 420],
  academyLodging: [1330, 250],
};

/** The stand capacity pills, in pixels of the image. */
const STAND_PX: Record<StandId, [number, number]> = {
  north: [800, 262],
  south: [800, 545],
  west: [548, 380],
  east: [1050, 380],
};

/** Percent of the image, for absolutely positioned HTML over it. */
const pct = ([x, y]: [number, number]) => ({ left: (x / CLUB_MAP_W) * 100, top: (y / CLUB_MAP_H) * 100 });

export const ITEM_POS = Object.fromEntries(
  (Object.entries(ITEM_PX) as [FacilityItemId, [number, number]][]).map(([id, p]) => [id, pct(p)]),
) as Record<FacilityItemId, { left: number; top: number }>;

export const STAND_POS = Object.fromEntries(
  (Object.entries(STAND_PX) as [StandId, [number, number]][]).map(([id, p]) => [id, pct(p)]),
) as Record<StandId, { left: number; top: number }>;
