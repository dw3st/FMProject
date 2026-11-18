// src/Domain/craft/shortfall.ts
import { CRAFT, MATERIALS } from "@/Domain/craft/craftConfig";
import { materialsFor } from "@/Domain/craft/workshop";
import type { ComponentCounts, ComponentId, CraftStock, MaterialCounts, MaterialId } from "@/types/craftTypes";

/** The missing components the workshop can make at its level (the locked ones stay out). */
export function craftableMissing(missing: ComponentCounts, workshop: number): ComponentCounts {
  const out: ComponentCounts = {};
  for (const [id, n] of Object.entries(missing) as [ComponentId, number][]) {
    if (n > 0 && CRAFT.RECIPES[id].minLevel <= workshop) out[id] = n;
  }
  return out;
}

/** Materials in the stock, both suppliers together. */
export function materialTotal(stock: CraftStock, m: MaterialId): number {
  const s = stock.materials[m];
  return (s?.standard ?? 0) + (s?.good ?? 0);
}

/** Materials the workshop needs to make `components` (their recipes summed). */
export function materialsNeeded(components: ComponentCounts): MaterialCounts {
  const need: MaterialCounts = {};
  for (const [id, n] of Object.entries(components) as [ComponentId, number][]) {
    for (const [m, k] of Object.entries(materialsFor(id, n)) as [MaterialId, number][]) need[m] = (need[m] ?? 0) + k;
  }
  return need;
}

/** Materials to buy so the workshop can make `components`: their recipes minus what the stock already has. */
export function materialsShort(components: ComponentCounts, stock: CraftStock): MaterialCounts {
  const need = materialsNeeded(components);
  const out: MaterialCounts = {};
  for (const m of MATERIALS) {
    const short = (need[m] ?? 0) - materialTotal(stock, m);
    if (short > 0) out[m] = short;
  }
  return out;
}
