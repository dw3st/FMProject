// src/Domain/craft/recipes.ts
import { CRAFT } from "@/Domain/craft/craftConfig";
import { itemsOfGroup } from "@/Domain/facilities/facilityItems";
import type { ComponentCounts, ComponentId, MaterialId } from "@/types/craftTypes";
import type { FacilityItemId, FacilityKind } from "@/types/facilityTypes";

/** Value of one component at the base prices (EUR). */
export function componentValue(id: ComponentId, revenue: number): number {
  const mats = CRAFT.RECIPES[id].materials;
  let v = 0;
  for (const [m, n] of Object.entries(mats) as [MaterialId, number][]) v += n * Math.max(0, revenue) * CRAFT.MATERIAL_SHARE[m];
  return Math.round(v);
}

export function recipeValue(r: ComponentCounts, revenue: number): number {
  return (Object.entries(r) as [ComponentId, number][]).reduce((s, [id, n]) => s + n * componentValue(id, revenue), 0);
}

function sumMix(...mixes: ComponentCounts[]): ComponentCounts {
  const out: ComponentCounts = {};
  for (const m of mixes) for (const [id, n] of Object.entries(m) as [ComponentId, number][]) out[id] = (out[id] ?? 0) + n;
  return out;
}

/** Relative mix of a works (spec §2). */
export function mixFor(w: { kind: FacilityKind | "workshop"; item?: FacilityItemId }): ComponentCounts {
  if (w.kind === "stand") return { ...CRAFT.STAND_MIX };
  if (w.kind === "workshop") return { ...CRAFT.WORKSHOP_MIX };
  if (w.kind === "comfort") return { ...CRAFT.ITEM_MIX.seats };
  if (w.kind === "turf") return { ...CRAFT.ITEM_MIX.stadiumPitch };
  if (w.kind === "training" || w.kind === "academy") return sumMix(...itemsOfGroup(w.kind).map((id) => CRAFT.ITEM_MIX[id]));
  return w.item ? { ...CRAFT.ITEM_MIX[w.item] } : {};
}

/** Components a works of `cost` EUR asks: the mix scaled to the cost, at least one of each. */
export function recipeFor(w: { kind: FacilityKind | "workshop"; item?: FacilityItemId }, cost: number, revenue: number): ComponentCounts {
  const mix = mixFor(w);
  const unit = recipeValue(mix, revenue);
  // Exact (not rounded) number of mixes, each component rounded on its own: closer to the cost than whole mixes.
  const units = unit > 0 ? Math.max(1, cost / unit) : 1;
  const out: ComponentCounts = {};
  for (const [id, n] of Object.entries(mix) as [ComponentId, number][]) out[id] = Math.max(1, Math.round(n * units));
  return out;
}
