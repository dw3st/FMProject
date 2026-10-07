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
  };
}
