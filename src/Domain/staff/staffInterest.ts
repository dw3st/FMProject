import { STAFF } from "@/Domain/staff/staffConfig";
import type { StaffRole } from "@/Domain/staff/staffTypes";
import { staffWageFor } from "@/Domain/staff/staff";
import { clamp } from "@/Domain/math";

/** How a free professional sees the human club (tester report e6707450). */
export type StaffInterest = "interested" | "hesitant" | "refuses";

export interface StaffInterestView {
  interest: StaffInterest;
  /** Extra over the market wage a hesitant one asks (0.2 = +20%); 0 otherwise. */
  premium: number;
}

/**
 * Stars of staff the club attracts: the tier's implied stars, minus `DIVISION_STEP` per division below the first,
 * plus up to `REP_BONUS` by the manager's reputation.
 */
export function clubAttractionStars(tierStars: number, division: number, reputation: number): number {
  const c = STAFF.INTEREST;
  const rep = clamp((reputation - c.REP_FROM) / (c.REP_TO - c.REP_FROM), 0, 1) * c.REP_BONUS;
  return Math.max(c.MIN_ATTRACTION, tierStars - c.DIVISION_STEP * Math.max(0, division - 1) + rep);
}

/** Interest of a professional of `stars` in a club that attracts `attraction` stars. */
export function staffInterestOf(stars: number, attraction: number): StaffInterestView {
  const c = STAFF.INTEREST;
  const gap = stars - attraction;
  if (gap <= c.OPEN_GAP + 1e-9) return { interest: "interested", premium: 0 };
  if (gap > c.REFUSE_GAP + 1e-9) return { interest: "refuses", premium: 0 };
  const t = (gap - c.OPEN_GAP) / (c.REFUSE_GAP - c.OPEN_GAP);
  return { interest: "hesitant", premium: Math.round((c.PREMIUM_MIN + t * (c.PREMIUM_MAX - c.PREMIUM_MIN)) * 100) / 100 };
}

/**
 * What he asks: interested = the usual wage (revenue ceiling included); hesitant = the market wage (no revenue
 * ceiling) × (1 + premium). A refusing one is priced like a hesitant one at the top premium (shown, never signed).
 */
export function interestWage(role: StaffRole, stars: number, clubFactor: number, revenue: number | undefined, view: StaffInterestView): number {
  if (view.interest === "interested") return staffWageFor(role, stars, clubFactor, revenue);
  const premium = view.interest === "hesitant" ? view.premium : STAFF.INTEREST.PREMIUM_MAX;
  return Math.round(staffWageFor(role, stars, clubFactor) * (1 + premium));
}
