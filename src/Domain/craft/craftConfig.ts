// src/Domain/craft/craftConfig.ts
import type { ComponentId, CraftQuality, MaterialId, MaterialCounts } from "@/types/craftTypes";
import type { FacilityItemId } from "@/types/facilityTypes";

export const MATERIALS: readonly MaterialId[] = ["concrete", "steel", "wood", "grass", "fabric", "electronics"];
export const COMPONENTS: readonly ComponentId[] = ["beam", "slab", "turfPanel", "seat", "floodlight", "gymKit", "medKit", "furniture"];
export const QUALITIES: readonly CraftQuality[] = ["common", "good", "excellent"];

export const CRAFT = {
  /**
   * Price of one unit of a material = annual revenue × share (decision 1 of the plan). ×1,5 of the first values after M1
   * (`scripts/craft-measure.ts`): fewer units per works, so a 5000-seat stand is made in about the works time with a
   * level-3 workshop, and the small repairs still cost within ±5% of the old quote.
   */
  MATERIAL_SHARE: {
    concrete: 4.5e-05, steel: 0.00012, wood: 4.5e-05, grass: 9e-05, fabric: 4.5e-05, electronics: 0.00015,
  } as Record<MaterialId, number>,
  /** Weekly price noise: base × (1 + NOISE × u), u in [−1, 1]. */
  PRICE_NOISE: 0.1,
  GOOD_SUPPLIER_MULT: 1.15,
  /** Shop discount with the board at or above `DISCOUNT_BOARD`. */
  DISCOUNT: 0.1,
  DISCOUNT_BOARD: 70,
  RECIPES: {
    beam: { materials: { steel: 3, concrete: 1 }, days: 2, minLevel: 1 },
    slab: { materials: { concrete: 4 }, days: 2, minLevel: 1 },
    turfPanel: { materials: { grass: 3 }, days: 1, minLevel: 1 },
    seat: { materials: { wood: 2, fabric: 1 }, days: 1, minLevel: 1 },
    floodlight: { materials: { steel: 2, electronics: 2 }, days: 3, minLevel: 2 },
    gymKit: { materials: { steel: 2, electronics: 1 }, days: 2, minLevel: 3 },
    medKit: { materials: { fabric: 1, electronics: 2 }, days: 2, minLevel: 3 },
    furniture: { materials: { wood: 3 }, days: 1, minLevel: 1 },
  } as Record<ComponentId, { materials: MaterialCounts; days: number; minLevel: number }>,
  /** Days in the table are per lot of this many units (decision 2). */
  LOT: 5,
  MAX_QUEUE: 10,
  MAX_LEVEL: 5,
  /** Bench days × (1 − SPEED_STEP × (level − 1)). */
  SPEED_STEP: 0.1,
  /** Mixes of each works (relative quantities). */
  STAND_MIX: { slab: 3, beam: 2, seat: 4 } as Partial<Record<ComponentId, number>>,
  WORKSHOP_MIX: { beam: 2, slab: 1, furniture: 1 } as Partial<Record<ComponentId, number>>,
  ITEM_MIX: {
    stadiumPitch: { turfPanel: 1 },
    seats: { seat: 3, furniture: 1 },
    stadiumStructure: { beam: 2, floodlight: 2 },
    trainingPitches: { turfPanel: 1 },
    gym: { gymKit: 2, beam: 1 },
    pool: { slab: 2, beam: 1 },
    physio: { medKit: 2, furniture: 1 },
    canteen: { furniture: 2, slab: 1 },
    academyPitches: { turfPanel: 1 },
    academyLodging: { furniture: 2, slab: 1 },
  } as Record<FacilityItemId, Partial<Record<ComponentId, number>>>,
  /** Workshop upgrade cost as a share of the annual revenue, by the level reached (2..5). */
  WORKSHOP_COST: [0, 0, 0.004, 0.008, 0.014, 0.022],
  /** Quality draw: excellent = EXC_BASE + score, good = GOOD, the rest common. */
  QUALITY: { EXC_BASE: 0.1, GOOD: 0.35, FOREMAN: 0.1, LEVEL: 0.05, SUPPLIER: 0.15 },
  /** Works quality from the mean of its components (common 0, good 1, excellent 2). */
  QUALITY_EXCELLENT_FROM: 1.5,
  QUALITY_GOOD_FROM: 0.75,
  QUALITY_WEAR: { common: 1, good: 0.85, excellent: 0.7 } as Record<CraftQuality, number>,
  /** Foreman's bench speed: [1★, 3★, 5★] (`starCurve`); vacant = 2★. */
  FOREMAN_SPEED: [1.15, 1, 0.85] as [number, number, number],
  /** Monthly board allowance: share of the annual revenue by the board meter. */
  ALLOWANCE: { NONE_BELOW: 35, LOW_AT: 50, LOW: 0.003, HIGH_AT: 85, HIGH: 0.01 },
  /** Stock given to a club the first time it gets the craft (old saves, new careers, a new club). */
  INITIAL_STOCK_SHARE: 0.02,
  /** Cancelling a started order or a running works gives back this share. */
  CANCEL_RETURN: 0.5,
  RECYCLE_RETURN: 0.4,
  REBUILD_RETURN: 0.25,
} as const;
