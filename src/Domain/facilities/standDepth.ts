/**
 * How deep each stand of the human club's ground is drawn (tester report: a stand with 10 000 more seats than the one
 * opposite must look bigger). Each stand's seats are measured against its default share of the ground
 * (`FACILITIES.STAND_SHARE`); the stand with the most seats for its share is drawn at full depth and the others in
 * proportion, never under MIN_DEPTH. A ground built with the default split is drawn as before (every stand at 1).
 */
import type { StadiumStand, StandId } from "@/types/facilityTypes";
import { FACILITIES } from "@/Domain/facilities/facilityConfig";

export const STAND_DEPTH = {
  /** The thinnest a stand is drawn, as a share of the full depth. */
  MIN_DEPTH: 0.45,
  /** Below this difference every stand is drawn at full depth (rounding of the default split). */
  EQUAL_WITHIN: 0.04,
} as const;

export type StandDepths = Record<StandId, number>;

const IDS: StandId[] = ["north", "south", "east", "west"];

/** Depth (0..1) of each stand; null when the stands are missing or all about the same size. */
export function standDepths(stands: readonly StadiumStand[] | undefined): StandDepths | null {
  if (!stands || stands.length === 0) return null;
  const total = stands.reduce((s, x) => s + Math.max(0, x.seats), 0);
  if (total <= 0) return null;
  const ratio = {} as StandDepths;
  for (const id of IDS) {
    const seats = stands.find((s) => s.id === id)?.seats ?? 0;
    ratio[id] = Math.max(0, seats) / (FACILITIES.STAND_SHARE[id] * total);
  }
  const max = Math.max(...IDS.map((id) => ratio[id]));
  const min = Math.min(...IDS.map((id) => ratio[id]));
  if (max <= 0 || (max - min) / max < STAND_DEPTH.EQUAL_WITHIN) return null;
  const out = {} as StandDepths;
  for (const id of IDS) out[id] = Math.max(STAND_DEPTH.MIN_DEPTH, Math.round((ratio[id] / max) * 1000) / 1000);
  return out;
}
