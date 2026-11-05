/**
 * The Club screen's stadium drawing (viewBox 320 × 400, north on top) as the live match draws the ground (tester
 * report: show the current stadium): each stand as deep as its seats make it (`standDepths`, the pitch-side edge fixed)
 * and the bowl around them in the ground's shape. Blocks: no bowl, each stand on its own.
 */
import type { StandId } from "@/types/facilityTypes";
import type { StadiumShape } from "@/Domain/matchday/stadiumShape";
import type { StandDepths } from "@/Domain/facilities/standDepth";

export interface MapRect { x: number; y: number; w: number; h: number }

/** Full-depth stands; the pitch side of each one stays where it is. */
export const STAND_FULL: Record<StandId, MapRect> = {
  north: { x: 96, y: 14, w: 128, h: 54 },
  south: { x: 96, y: 332, w: 128, h: 54 },
  west: { x: 14, y: 80, w: 70, h: 240 },
  east: { x: 236, y: 80, w: 70, h: 240 },
};

const BOWL_PAD = 8;

export interface StadiumMapGeom {
  stands: Record<StandId, MapRect>;
  /** The bowl around the stands; null for a ground of separate stands. */
  bowl: (MapRect & { rx: number; ry: number }) | null;
}

export function stadiumMapGeom(shape: StadiumShape | undefined, depths: StandDepths | null | undefined): StadiumMapGeom {
  const d = (id: StandId) => Math.min(1, Math.max(0, depths?.[id] ?? 1));
  const f = STAND_FULL;
  const stands: Record<StandId, MapRect> = {
    north: { ...f.north, y: f.north.y + f.north.h * (1 - d("north")), h: f.north.h * d("north") },
    south: { ...f.south, h: f.south.h * d("south") },
    west: { ...f.west, x: f.west.x + f.west.w * (1 - d("west")), w: f.west.w * d("west") },
    east: { ...f.east, w: f.east.w * d("east") },
  };
  if (shape === "blocks") return { stands, bowl: null };
  const x0 = stands.west.x - BOWL_PAD, x1 = stands.east.x + stands.east.w + BOWL_PAD;
  const y0 = stands.north.y - BOWL_PAD, y1 = stands.south.y + stands.south.h + BOWL_PAD;
  const w = x1 - x0, h = y1 - y0;
  const m = Math.min(stands.west.w, stands.north.h) + BOWL_PAD;
  const [rx, ry] = shape === "oval" ? [w * 0.42, h * 0.3] : shape === "square" ? [10, 10] : [m, m];
  return { stands, bowl: { x: x0, y: y0, w, h, rx, ry } };
}
