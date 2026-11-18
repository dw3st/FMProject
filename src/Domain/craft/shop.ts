// src/Domain/craft/shop.ts
import { CRAFT } from "@/Domain/craft/craftConfig";
import { addDays } from "@/Domain/dates";
import { mulberry32, seedFrom } from "@/Domain/rng";
import type { MaterialId, Supplier } from "@/types/craftTypes";

/** The Monday on or before `date` (YYYY-MM-DD). */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((d + 6) % 7));
}

/** Price of one unit this week (before supplier and discount). */
export function weekPrice(saveId: string, material: MaterialId, date: string, revenue: number): number {
  const u = mulberry32(seedFrom(`craft:${saveId}:${material}:${mondayOf(date)}`))() * 2 - 1;
  return Math.max(1, Math.round(Math.max(0, revenue) * CRAFT.MATERIAL_SHARE[material] * (1 + CRAFT.PRICE_NOISE * u)));
}

export function unitPrice(week: number, supplier: Supplier, board: number): number {
  const s = supplier === "good" ? CRAFT.GOOD_SUPPLIER_MULT : 1;
  const d = board >= CRAFT.DISCOUNT_BOARD ? 1 - CRAFT.DISCOUNT : 1;
  return Math.round(week * s * d);
}

export interface OrderLine { material: MaterialId; supplier: Supplier; qty: number }

export function orderTotal(lines: OrderLine[], saveId: string, date: string, revenue: number, board: number): number {
  return lines.reduce((sum, l) => sum + l.qty * unitPrice(weekPrice(saveId, l.material, date, revenue), l.supplier, board), 0);
}
