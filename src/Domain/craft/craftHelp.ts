// src/Domain/craft/craftHelp.ts
import { COMPONENTS, CRAFT } from "@/Domain/craft/craftConfig";
import { materialTotal, materialsShort } from "@/Domain/craft/shortfall";
import type { ComponentId, CraftStock, MaterialCounts, MaterialId } from "@/types/craftTypes";
import type { FacilityItemId } from "@/types/facilityTypes";

/** A works that asks for a component: enlarging a stand, upgrading the workshop or the works of one item. */
export type CraftUse = { kind: "stand" } | { kind: "workshop" } | { kind: "item"; item: FacilityItemId };

/** The works whose mix has `id` (stand, workshop, then the items in config order). Comfort, turf and the group works use the item mixes. */
export function componentUses(id: ComponentId): CraftUse[] {
  const out: CraftUse[] = [];
  if ((CRAFT.STAND_MIX[id] ?? 0) > 0) out.push({ kind: "stand" });
  for (const [item, mix] of Object.entries(CRAFT.ITEM_MIX) as [FacilityItemId, Partial<Record<ComponentId, number>>][]) {
    if ((mix[id] ?? 0) > 0) out.push({ kind: "item", item });
  }
  if ((CRAFT.WORKSHOP_MIX[id] ?? 0) > 0) out.push({ kind: "workshop" });
  return out;
}

export interface ComponentHelp {
  id: ComponentId;
  /** Each material of one unit, with what the stock has (both suppliers). */
  materials: { material: MaterialId; per: number; have: number }[];
  /** Bench days per lot of `lot` units (before the workshop level and the foreman). */
  days: number;
  lot: number;
  minLevel: number;
  /** The workshop's level is below `minLevel`. */
  locked: boolean;
  uses: CraftUse[];
}

/** What the "?" of a component says: its recipe against the stock, bench time, the workshop level and the works that use it. */
export function componentHelp(id: ComponentId, stock: CraftStock | null, workshop: number): ComponentHelp {
  const r = CRAFT.RECIPES[id];
  return {
    id,
    materials: (Object.entries(r.materials) as [MaterialId, number][]).map(([material, per]) => ({
      material, per, have: stock ? materialTotal(stock, material) : 0,
    })),
    days: r.days,
    lot: CRAFT.LOT,
    minLevel: r.minLevel,
    locked: r.minLevel > workshop,
    uses: componentUses(id),
  };
}

/** The components whose recipe has material `m`, with the units of it each one takes. */
export function materialUses(m: MaterialId): { component: ComponentId; per: number }[] {
  return COMPONENTS.flatMap((component) => {
    const per = CRAFT.RECIPES[component].materials[m] ?? 0;
    return per > 0 ? [{ component, per }] : [];
  });
}

/** Most units of `id` the stock's materials can make (0 when a material is missing). */
export function maxMakeable(id: ComponentId, stock: CraftStock): number {
  let max = Infinity;
  for (const [m, per] of Object.entries(CRAFT.RECIPES[id].materials) as [MaterialId, number][]) {
    max = Math.min(max, Math.floor(materialTotal(stock, m) / per));
  }
  return Number.isFinite(max) ? max : 0;
}

export type MakeState =
  | { kind: "locked"; minLevel: number }
  | { kind: "short"; short: MaterialCounts }
  | { kind: "ok"; max: number };

/**
 * Whether the workshop can make `id` now: locked by the level, short of materials (with what to buy for `qty`
 * units, the shop cart) or fine up to `max` units.
 */
export function makeState(id: ComponentId, stock: CraftStock, workshop: number, qty: number = CRAFT.LOT): MakeState {
  const minLevel = CRAFT.RECIPES[id].minLevel;
  if (minLevel > workshop) return { kind: "locked", minLevel };
  const max = maxMakeable(id, stock);
  if (max < 1) return { kind: "short", short: materialsShort({ [id]: Math.max(1, qty) }, stock) };
  return { kind: "ok", max };
}

/** Materials of `qty` units of `id` still to buy (the shop cart of a new order). */
export function orderShort(id: ComponentId, qty: number, stock: CraftStock): MaterialCounts {
  return materialsShort({ [id]: qty }, stock);
}

