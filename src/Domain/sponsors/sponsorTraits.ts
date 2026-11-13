import { unitFrom } from "@/Domain/rng";

/**
 * How a sponsor behaves (12.1, `.claude/rules/game/sponsors.md` → "Perfil da empresa"). Derived from the company id
 * (never stored): the same company behaves the same in every career, and its bio (`sponsorBios.json`) hints at it.
 */
export const SPONSOR_TRAITS = ["none", "generous", "stingy", "impatient", "loyal", "haggler", "proud", "longterm", "shortterm"] as const;
export type SponsorTrait = (typeof SPONSOR_TRAITS)[number];

/** Share of the catalog with each trait (sum 1). */
export const SPONSOR_TRAIT_SHARE: Record<SponsorTrait, number> = {
  none: 0.36, generous: 0.08, stingy: 0.08, impatient: 0.08, loyal: 0.08, haggler: 0.08, proud: 0.08, longterm: 0.08, shortterm: 0.08,
};

export const SPONSOR_TRAIT_EFFECTS = {
  /** `generous`: fixed value of every offer. */
  GENEROUS_FIXED: 1.06,
  /** `stingy`: pays less fixed and promises a bigger bonus. */
  STINGY_FIXED: 0.94,
  STINGY_BONUS: 1.3,
  /** `impatient`: leaves early when the position goal is missed by this many places (default 6). */
  IMPATIENT_MISS: 3,
  /** `loyal`: never leaves early for a missed goal (relegation still ends it) and always offers a renewal. */
  /** `haggler`: negotiation chances [raise, keep] (default 0.45 / 0.35; the rest withdraws). */
  HAGGLER_NEGOTIATE: [0.65, 0.25],
  /** `proud`: takes a counter-offer badly. */
  PROUD_NEGOTIATE: [0.25, 0.3],
  /** `longterm` / `shortterm`: years of every offer. */
  LONGTERM_YEARS: 3,
  SHORTTERM_YEARS: 1,
} as const;

export function sponsorTraitOf(companyId: string): SponsorTrait {
  const u = unitFrom(`sponsor-trait:${companyId}`);
  let acc = 0;
  for (const t of SPONSOR_TRAITS) {
    acc += SPONSOR_TRAIT_SHARE[t];
    if (u < acc) return t;
  }
  return "none";
}
