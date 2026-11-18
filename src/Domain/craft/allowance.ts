// src/Domain/craft/allowance.ts
import { CRAFT, MATERIALS } from "@/Domain/craft/craftConfig";
import type { MaterialCounts } from "@/types/craftTypes";

/** Share of the annual revenue the board sends as materials each month (spec §7). Between 35 and 50: the low share. */
export function allowanceShare(board: number): number {
  const A = CRAFT.ALLOWANCE;
  if (board < A.NONE_BELOW) return 0;
  if (board <= A.LOW_AT) return A.LOW;
  if (board >= A.HIGH_AT) return A.HIGH;
  return A.LOW + (A.HIGH - A.LOW) * (board - A.LOW_AT) / (A.HIGH_AT - A.LOW_AT);
}

/** Equal value of each of the six materials, at the base price, for `value` EUR. */
export function materialsWorth(value: number, revenue: number): MaterialCounts {
  const part = Math.max(0, value) / MATERIALS.length;
  const out: MaterialCounts = {};
  for (const m of MATERIALS) {
    const unit = Math.max(1, revenue * CRAFT.MATERIAL_SHARE[m]);
    out[m] = Math.floor(part / unit);
  }
  return out;
}
