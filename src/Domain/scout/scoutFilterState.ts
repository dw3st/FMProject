import { ATTRIBUTE_LIST, type AttributeId } from "@/Domain/attributes";
import type { ScoutGrade } from "@/types/scoutingTypes";

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
  /** Only players who can sign a pre-contract with the user's club now (`preContractEligible`, on the server). */
  onlyPreContract?: boolean;
  /** Only AI clubs' players their club would loan out (`loanAvailability`, on the server; tester report, 4.47.12). */
  onlyLoanable?: boolean;
  /** Grades of the scout's latest report to keep (empty / absent = any, players without a report included). */
  grades?: ScoutGrade[];
  /** Potential range on the 0–100 screen scale (the middle of the shown range; his overall past 23). */
  minPotential?: number;
  maxPotential?: number;
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
    onlyPreContract: false,
    onlyLoanable: false,
    grades: [],
    minPotential: 0,
    maxPotential: 100,
  };
}

/** One − / + step of the price filter (M€): finer for cheap players (tester report, 8.8.2). */
export function stepPriceM(v: number, dir: 1 | -1): number {
  const grid = (x: number) => (x < 1 ? 0.1 : x < 10 ? 0.5 : x < 50 ? 1 : x < 200 ? 5 : 25);
  const size = grid(dir > 0 ? v : Math.max(0, v - 1e-9));
  const next = dir > 0 ? Math.floor(v / size + 1e-9) * size + size : Math.ceil(v / size - 1e-9) * size - size;
  return Math.max(0, Math.min(PRICE_FILTER_NO_LIMIT_M, Math.round(next * 10) / 10));
}

/**
 * A typed price (M€): "20", "20,5", "20M". A number of 100 000 or more is read as euros (the report typed 20000000
 * for €20M). Null when it is not a number.
 */
export function parsePriceM(text: string): number | null {
  const t = text.trim().replace(/\s/g, "").replace(/m$/i, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number.parseFloat(t);
  return n >= 100_000 ? n / 1_000_000 : n;
}
