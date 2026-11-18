import { allowanceShare, materialsWorth } from "@/Domain/craft/allowance";
import { CRAFT } from "@/Domain/craft/craftConfig";
import { addMaterials } from "@/Domain/craft/stock";
import { advanceQueue, newCraft } from "@/Domain/craft/workshop";
import { wageRevenueBasisOf } from "@/Domain/finance/wages";
import { foremanSpeedOf, foremanStarsOf } from "@/Domain/staff/staff";
import type { ClubCraft, ComponentCounts } from "@/types/craftTypes";
import type { ClubFacilities } from "@/types/facilityTypes";
import type { Squad } from "@/types/playerTypes";

/** The facilities with a craft state: a new one (workshop 1 and a stock worth `INITIAL_STOCK_SHARE` of the revenue). */
export function ensureCraft(f: ClubFacilities, squad: Squad): ClubFacilities {
  if (f.craft) return f;
  const revenue = wageRevenueBasisOf(squad);
  const c = newCraft();
  const stock = addMaterials(c.stock, "standard", materialsWorth(revenue * CRAFT.INITIAL_STOCK_SHARE, revenue));
  return { ...f, craft: { ...c, stock } };
}

export interface CraftDayResult {
  craft: ClubCraft;
  /** EUR worth of materials the board sent today (0 on other days). */
  allowance: number;
  done: ComponentCounts;
}

/** One day of the human club's workshop: the 1st of the month brings the board's materials, then the queue works. */
export function craftDay(craft: ClubCraft, squad: Squad, args: { saveId: string; date: string; board: number }): CraftDayResult {
  let c = craft;
  let allowance = 0;
  const month = args.date.slice(0, 7);
  if (args.date.endsWith("-01") && c.allowanceMonth !== month) {
    const revenue = wageRevenueBasisOf(squad);
    allowance = Math.round(revenue * allowanceShare(args.board));
    c = { ...c, allowanceMonth: month, ...(allowance > 0 ? { stock: addMaterials(c.stock, "standard", materialsWorth(allowance, revenue)) } : {}) };
  }
  const q = advanceQueue(c, args.date, {
    saveId: args.saveId, clubId: squad.id, foremanStars: foremanStarsOf(squad), foremanSpeed: foremanSpeedOf(squad),
  });
  return { craft: q.craft, allowance, done: q.done };
}
