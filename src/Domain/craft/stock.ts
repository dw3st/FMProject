// src/Domain/craft/stock.ts
import { COMPONENTS, CRAFT, MATERIALS } from "@/Domain/craft/craftConfig";
import type { ComponentCounts, ComponentId, CraftQuality, CraftStock, MaterialCounts, Supplier } from "@/types/craftTypes";

export function emptyStock(): CraftStock {
  return {
    materials: Object.fromEntries(MATERIALS.map((m) => [m, { standard: 0, good: 0 }])) as CraftStock["materials"],
    components: Object.fromEntries(COMPONENTS.map((c) => [c, { common: 0, good: 0, excellent: 0 }])) as CraftStock["components"],
  };
}

export function addMaterials(s: CraftStock, supplier: Supplier, add: MaterialCounts): CraftStock {
  const materials = { ...s.materials };
  for (const [m, n] of Object.entries(add) as [keyof MaterialCounts, number][]) {
    if (!n) continue;
    materials[m] = { ...materials[m], [supplier]: materials[m][supplier] + n };
  }
  return { ...s, materials };
}

/** Takes the materials (standard first); null when short. `goodShare` = good units / all units taken. */
export function takeMaterials(s: CraftStock, need: MaterialCounts): { stock: CraftStock; goodShare: number; good: MaterialCounts } | null {
  const materials = { ...s.materials };
  let good = 0;
  const goodBy: MaterialCounts = {};
  let all = 0;
  for (const [m, n] of Object.entries(need) as [keyof MaterialCounts, number][]) {
    if (!n) continue;
    const have = materials[m];
    if (have.standard + have.good < n) return null;
    const fromStd = Math.min(have.standard, n);
    materials[m] = { standard: have.standard - fromStd, good: have.good - (n - fromStd) };
    good += n - fromStd;
    if (n - fromStd > 0) goodBy[m] = n - fromStd;
    all += n;
  }
  return { stock: { ...s, materials }, goodShare: all > 0 ? good / all : 0, good: goodBy };
}

export function addComponents(s: CraftStock, id: ComponentId, add: Partial<Record<CraftQuality, number>>): CraftStock {
  const cur = s.components[id];
  return {
    ...s,
    components: {
      ...s.components,
      [id]: { common: cur.common + (add.common ?? 0), good: cur.good + (add.good ?? 0), excellent: cur.excellent + (add.excellent ?? 0) },
    },
  };
}

export const componentTotal = (s: CraftStock, id: ComponentId): number => {
  const c = s.components[id];
  return c.common + c.good + c.excellent;
};

export function missingComponents(s: CraftStock, need: ComponentCounts): ComponentCounts {
  const out: ComponentCounts = {};
  for (const [id, n] of Object.entries(need) as [ComponentId, number][]) {
    const short = n - componentTotal(s, id);
    if (short > 0) out[id] = short;
  }
  return out;
}

export const hasComponents = (s: CraftStock, need: ComponentCounts): boolean =>
  Object.keys(missingComponents(s, need)).length === 0;

/** Takes the components, best quality first; null when short. `taken` sums the qualities used. */
export function takeComponents(s: CraftStock, need: ComponentCounts): { stock: CraftStock; taken: Record<CraftQuality, number> } | null {
  if (!hasComponents(s, need)) return null;
  const components = { ...s.components };
  const taken = { common: 0, good: 0, excellent: 0 };
  for (const [id, n] of Object.entries(need) as [ComponentId, number][]) {
    let left = n;
    const c = { ...components[id] };
    for (const q of ["excellent", "good", "common"] as const) {
      const use = Math.min(c[q], left);
      c[q] -= use;
      taken[q] += use;
      left -= use;
    }
    components[id] = c;
  }
  return { stock: { ...s, components }, taken };
}

export function worksQuality(taken: Record<CraftQuality, number>): CraftQuality {
  const n = taken.common + taken.good + taken.excellent;
  if (n === 0) return "common";
  const mean = (taken.good + 2 * taken.excellent) / n;
  return mean >= CRAFT.QUALITY_EXCELLENT_FROM ? "excellent" : mean >= CRAFT.QUALITY_GOOD_FROM ? "good" : "common";
}
