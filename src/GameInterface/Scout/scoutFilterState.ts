import { ATTRIBUTE_LIST, type AttributeId } from "@/GameInterface/AttributeLabels";

export interface ScoutFilterState {
  name: string;
  position: string;
  minAge: number;
  maxAge: number;
  minAvg: number;
  maxAvg: number;
  /** Market value range, millions of £ (same scale as engine `Player.valueMillions`). */
  minPriceM: number;
  maxPriceM: number;
  league: string;
  nationality: string;
  /** Per-stat min/max (0–10). Full span 0–10 means no extra constraint for that stat. */
  attributeRanges: Record<AttributeId, { min: number; max: number }>;
  /** When true, only show players who appear on any team's sell list. */
  onlyForSale: boolean;
}

export function defaultAttributeRanges(): Record<AttributeId, { min: number; max: number }> {
  const o = {} as Record<AttributeId, { min: number; max: number }>;
  for (const a of ATTRIBUTE_LIST) {
    o[a.id] = { min: 0, max: 10 };
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
    maxPriceM: 200,
    league: "all",
    nationality: "all",
    attributeRanges: defaultAttributeRanges(),
    onlyForSale: false,
  };
}
