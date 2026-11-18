// src/types/craftTypes.ts
/** Craft of the club's facilities (`docs/superpowers/specs/2026-11-18-club-craft-design.md`). Human club only. */
export type MaterialId = "concrete" | "steel" | "wood" | "grass" | "fabric" | "electronics";
export type ComponentId = "beam" | "slab" | "turfPanel" | "seat" | "floodlight" | "gymKit" | "medKit" | "furniture";
export type Supplier = "standard" | "good";
export type CraftQuality = "common" | "good" | "excellent";

export type ComponentCounts = Partial<Record<ComponentId, number>>;
export type MaterialCounts = Partial<Record<MaterialId, number>>;

export interface CraftStock {
  materials: Record<MaterialId, Record<Supplier, number>>;
  components: Record<ComponentId, Record<CraftQuality, number>>;
}

/** One order on the workshop queue: `qty` units of a component, materials already taken from the stock. */
export interface CraftJob {
  id: string;
  component: ComponentId;
  qty: number;
  /** Share (0..1) of the materials that came from the good supplier. */
  goodShare: number;
  /** Good-supplier units taken per material (for refunds). */
  goodTaken: MaterialCounts;
  /** Bench days the order takes (fixed when it is queued). */
  days: number;
  startedOn?: string;
  doneOn?: string;
}

export interface ClubCraft {
  /** Workshop level 1..5. */
  workshop: number;
  stock: CraftStock;
  queue: CraftJob[];
  nextId: number;
  /** "YYYY-MM" of the last monthly allowance (idempotent day). */
  allowanceMonth?: string;
}
