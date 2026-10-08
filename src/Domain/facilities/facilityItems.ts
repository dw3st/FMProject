import { FACILITIES as F } from "@/Domain/facilities/facilityConfig";
import { clamp } from "@/Domain/math";
import { mulberry32, seedFrom } from "@/Domain/rng";
import type { ClubFacilities, FacilityGroup, FacilityItem, FacilityItemId } from "@/types/facilityTypes";

/**
 * Living facilities (`docs/superpowers/specs/2026-10-08-living-facilities-design.md`): the ten items
 * of the human club, their condition (derived from the wear), the daily wear, the threshold crossings
 * and the group levels 1..5 derived from the item levels 1..10. Pure, no I/O.
 */

const W = F.WEAR;

export type FacilityItems = Record<FacilityItemId, FacilityItem>;

/** The items in the order of the spec table (stadium, training ground, academy). */
export const FACILITY_ITEMS: readonly FacilityItemId[] = [
  "stadiumPitch", "seats", "stadiumStructure",
  "trainingPitches", "gym", "pool", "physio", "canteen",
  "academyPitches", "academyLodging",
];

export const ITEM_GROUP: Record<FacilityItemId, FacilityGroup> = Object.fromEntries(
  FACILITY_ITEMS.map((id) => [id, F.ITEMS[id].group]),
) as Record<FacilityItemId, FacilityGroup>;

export function itemsOfGroup(g: FacilityGroup): FacilityItemId[] {
  return FACILITY_ITEMS.filter((id) => ITEM_GROUP[id] === g);
}

export function isFacilityItemId(v: unknown): v is FacilityItemId {
  return typeof v === "string" && (FACILITY_ITEMS as readonly string[]).includes(v);
}

// ── Condition ─────────────────────────────────────────────────────────────────

/** Condition 0..100 (condemned: 0). */
export function conditionOf(it: Pick<FacilityItem, "wear" | "condemned">): number {
  if (it.condemned) return 0;
  return 100 * (1 - Math.pow(clamp(it.wear, 0, 1), W.POWER));
}

/** Wear that gives `condition` (inverse of `conditionOf`). */
export const wearFor = (condition: number): number => Math.pow(1 - clamp(condition, 0, 100) / 100, 1 / W.POWER);

/** Life multiplier of a level (level 5 = 1). */
export const lifeScale = (level: number): number => W.LIFE_BASE + W.LIFE_STEP * clamp(level, 1, F.ITEM_MAX_LEVEL);

/** 0 from 40% up, 1 at 0% (or condemned). */
export const penalty = (condition: number): number => clamp((W.WARN_BELOW - condition) / W.WARN_BELOW, 0, 1);

/** Multiplier `1 → atZero` as the condition goes 40% → 0%. */
export const effectAt = (atZero: number, condition: number): number => 1 + (atZero - 1) * penalty(condition);

/** Condition of an item of the club's facilities. */
export const itemCondition = (f: ClubFacilities, id: FacilityItemId): number => conditionOf(f.items[id]);

// ── Daily wear ────────────────────────────────────────────────────────────────

export interface WearDayInput {
  /** Home games of the human club today. */
  homeGames: number;
  /** Training today (null: match, rest, no club). */
  session: "light" | "normal" | "heavy" | null;
  /** Groundskeeper (`staffEffectsOf().pitchWearMult`). */
  pitchWearMult: number;
}

/** Wear one item takes today. */
export function itemWearToday(id: FacilityItemId, level: number, d: WearDayInput): number {
  const c = F.ITEMS[id];
  const session = d.session ? W.SESSION[d.session] : 0;
  const share = c.time / 365 + (c.matches * d.homeGames) / W.HOME_GAMES_REF + (c.training * session) / W.TRAINING_DAYS_REF;
  const keeper = c.pitch > 0 ? 1 + (d.pitchWearMult - 1) * c.pitch : 1;
  return (share / (c.life * lifeScale(level))) * keeper;
}

export type CrossingKind = "worn" | "condemned";
export interface FacilityCrossing {
  item: FacilityItemId;
  kind: CrossingKind;
  condition: number;
}

/**
 * Threshold warnings: below 15% the item becomes condemned (`condemned` message, once); below 40%
 * a `worn` message (once); back at or above 40% the warning re-arms. Returns the same object when
 * nothing changes.
 */
export function crossings(items: FacilityItems): { items: FacilityItems; crossings: FacilityCrossing[] } {
  let out: FacilityItems | null = null;
  const events: FacilityCrossing[] = [];
  for (const id of FACILITY_ITEMS) {
    const it = items[id];
    if (!it) continue;
    const cond = conditionOf(it);
    let next: FacilityItem = it;
    if (!it.condemned && cond < W.CONDEMN_BELOW) {
      next = { ...it, condemned: true, alert: 15 };
      events.push({ item: id, kind: "condemned", condition: cond });
    } else if (!it.condemned && cond < W.WARN_BELOW && it.alert === undefined) {
      next = { ...it, alert: 40 };
      events.push({ item: id, kind: "worn", condition: cond });
    } else if (!it.condemned && cond >= W.WARN_BELOW && it.alert !== undefined) {
      const { alert: _a, ...rest } = it;
      next = rest;
    }
    if (next !== it) {
      out ??= { ...items };
      out[id] = next;
    }
  }
  return { items: out ?? items, crossings: events };
}

/** One day of wear on every item, then the threshold crossings. */
export function wearDay(items: FacilityItems, d: WearDayInput): { items: FacilityItems; crossings: FacilityCrossing[] } {
  const worn = { ...items };
  for (const id of FACILITY_ITEMS) {
    const it = items[id];
    if (!it) continue;
    const dw = itemWearToday(id, it.level, d);
    if (dw > 0) worn[id] = { ...it, wear: it.wear + dw };
  }
  return crossings(worn);
}

// ── Levels ────────────────────────────────────────────────────────────────────

/** Level that counts in the group (condemned: 1). */
export const effectiveLevel = (it: FacilityItem): number => (it.condemned ? 1 : it.level);

/** Group level 1..5 (continuous) = mean of the item levels / 2. */
export function groupLevel(f: ClubFacilities, g: FacilityGroup): number {
  const ids = itemsOfGroup(g);
  return ids.reduce((s, id) => s + effectiveLevel(f.items[id]), 0) / ids.length / 2;
}

/** Comfort level (ticket price) = seats level / 2. */
export const comfortLevel = (f: ClubFacilities): number => effectiveLevel(f.items.seats) / 2;

/** Value of a 1..5 table at a (fractional) level, linear between the entries; clamped at the ends. */
export function lerpLevel(arr: readonly number[], level: number): number {
  const x = clamp(level, 1, arr.length) - 1;
  const lo = Math.floor(x);
  const hi = Math.min(arr.length - 1, lo + 1);
  return arr[lo]! + (arr[hi]! - arr[lo]!) * (x - lo);
}

// ── Setup ─────────────────────────────────────────────────────────────────────

/**
 * Starting items of a human club: level 2 × implied tier level (seats 2 = comfort 1), wear drawn
 * per club and item (pitches 0.05..0.25, the rest 0.05..0.45 → condition 100%..80%).
 */
export function initialItems(squadId: string, impliedLevel: number): FacilityItems {
  const out = {} as FacilityItems;
  for (const id of FACILITY_ITEMS) {
    const rng = mulberry32(seedFrom(`fac:${squadId}:${id}`));
    const [lo, hi] = F.ITEMS[id].pitch > 0 ? W.START_PITCH : W.START_OTHER;
    const level = id === "seats" ? 2 * F.MIN_LEVEL : clamp(2 * impliedLevel, 1, F.ITEM_MAX_LEVEL);
    out[id] = { level, wear: lo + (hi - lo) * rng() };
  }
  return out;
}

/** Physio: × days out of a new injury (condition and level against the tier's starting level). */
export function physioDurationMult(physio: FacilityItem, impliedLevel: number): number {
  const byLevel = clamp(
    1 - W.PHYSIO_DURATION_LEVEL_STEP * (effectiveLevel(physio) - 2 * impliedLevel),
    W.PHYSIO_DURATION_LEVEL_MIN, W.PHYSIO_DURATION_LEVEL_MAX,
  );
  return byLevel * effectAt(W.PHYSIO_DURATION_MAX, conditionOf(physio));
}

/** The facilities with every item of a group at 2 × `level` (comfort: the seats), condition kept (tests, scripts). */
export function withGroupLevel(f: ClubFacilities, g: FacilityGroup | "comfort", level: number): ClubFacilities {
  const ids = g === "comfort" ? (["seats"] as const) : itemsOfGroup(g);
  const items = { ...f.items };
  for (const id of ids) items[id] = { ...items[id], level: clamp(2 * level, 1, F.ITEM_MAX_LEVEL) };
  return { ...f, items };
}
