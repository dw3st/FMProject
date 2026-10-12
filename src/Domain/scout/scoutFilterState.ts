import { ATTRIBUTE_LIST, type AttributeId } from "@/Domain/attributes";

/**
 * Default top of the price filter (Mâ‚¬). A value at or above it means no upper limit: the market value grows
 * exponentially with the rating (`Player.valueMillions`), and the middle of a little-known star's value range can
 * pass any round number.
 */
export const PRICE_FILTER_NO_LIMIT_M = 1000;

export interface ScoutFilterState {
  name: string;
  position: string;
  minAge: number;
  maxAge: number;
  minAvg: number;
  maxAvg: number;
  /** Market value range, millions of € (same scale as engine `Player.valueMillions`). */
  minPriceM: number;
  /** Upper price (Mâ‚¬); `PRICE_FILTER_NO_LIMIT_M` or more = no upper limit. */
  maxPriceM: number;
  league: string;
  nationality: string;
  /** Per-stat min/max on the displayed 0–100 scale (integers). Full span 0–100 means no extra constraint for that stat. */
  attributeRanges: Record<AttributeId, { min: number; max: number }>;
  /** When true, only show players who appear on any team's sell list. */
  onlyForSale: boolean;
  /** When true, only the free-agent pool (and never club players). */
  onlyFree: boolean;
  /** Only players on the user's shortlist (`.claude/rules/game/scouting.md`). */
  onlyShortlist?: boolean;
  /** Only players known at least this well (0 = everyone). */
  minKnowledge?: number;
  /** Only players with a season award in their history (`.claude/rules/game/awards.md`). */
  onlyAwarded?: boolean;
  /**
   * Only players the user's club can afford (#123): estimated fee within the balance and the
   * estimated asking wage within the wage cap (`fitsScoutBudget`, computed on the server).
   */
  onlyAffordable?: boolean;
}

/** Attribute groups of the search filters (#147); every listed attribute (`ATTRIBUTE_LIST`) is in exactly one. */
export type AttributeGroupId = "physical" | "attack" | "defense" | "goalkeeper";

export const ATTRIBUTE_GROUPS: { id: AttributeGroupId; attributes: AttributeId[] }[] = [
  { id: "physical", attributes: ["speed", "acceleration", "strength", "stamina"] },
  { id: "attack", attributes: ["finishing", "dribbling", "passing", "vision"] },
  { id: "defense", attributes: ["tackling", "pressing", "heading"] },
  { id: "goalkeeper", attributes: ["reflex", "jump"] },
];

/** Lowest and highest value typed in an attribute field (the screen's 1–100 scale). */
export const ATTR_INPUT_MIN = 1;
export const ATTR_INPUT_MAX = 100;

/**
 * A typed attribute bound: empty or invalid = no limit on that side (0 for the minimum, 100 for
 * the maximum); a number is rounded and clamped to 1–100.
 */
export function parseAttrBound(text: string, side: "min" | "max"): number {
  const trimmed = text.trim();
  const n = trimmed === "" ? NaN : Number(trimmed);
  if (!Number.isFinite(n)) return side === "min" ? 0 : 100;
  return Math.min(ATTR_INPUT_MAX, Math.max(ATTR_INPUT_MIN, Math.round(n)));
}

/** A min/max pair in order (the fields can be typed the wrong way round). */
export function orderedRange(min: number, max: number): { min: number; max: number } {
  return min <= max ? { min, max } : { min: max, max: min };
}

/** True when the range limits nothing (0–100). */
export function isAnyRange(r: { min: number; max: number }): boolean {
  return r.min <= 0 && r.max >= 100;
}

export function defaultAttributeRanges(): Record<AttributeId, { min: number; max: number }> {
  const o = {} as Record<AttributeId, { min: number; max: number }>;
  for (const a of ATTRIBUTE_LIST) {
    o[a.id] = { min: 0, max: 100 };
  }
  return o;
}

export function createDefaultScoutFilters(): ScoutFilterState {
  return {
    name: "",
    position: "all",
    minAge: 16,
    maxAge: 40,
    minAvg: 0,
    maxAvg: 10,
    minPriceM: 0,
    maxPriceM: PRICE_FILTER_NO_LIMIT_M,
    league: "all",
    nationality: "all",
    attributeRanges: defaultAttributeRanges(),
    onlyForSale: false,
    onlyFree: false,
    onlyShortlist: false,
    minKnowledge: 0,
    onlyAwarded: false,
    onlyAffordable: false,
  };
}
