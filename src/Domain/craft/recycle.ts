// src/Domain/craft/recycle.ts
import type { ComponentCounts, ComponentId } from "@/types/craftTypes";

/** `share` of each component of a recipe, rounded down; zeros left out. */
export function shareOf(recipe: ComponentCounts, share: number): ComponentCounts {
  const out: ComponentCounts = {};
  for (const [id, n] of Object.entries(recipe) as [ComponentId, number][]) {
    const k = Math.floor(n * share);
    if (k > 0) out[id] = k;
  }
  return out;
}
