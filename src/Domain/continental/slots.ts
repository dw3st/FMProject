export interface CountrySlotInput {
  country: string;
  /** Mean club level of the country's top league. */
  coefficient: number;
  /** Clubs available in the country's top league. */
  clubs: number;
  /** Fixed places from leagueData zones (the big leagues / Brazil). */
  zoneSlots?: { primary: number; secondary: number };
}

export type SlotTable = Record<string, { primary: number; secondary: number }>;

const PER_COMPETITION = 32;
const SA_OTHERS_PATTERN = [4, 4, 3, 3, 3, 3];
const ARGENTINA_SA = 6;

/** Coefficient desc, then country name by UTF-16 code unit (not locale-aware collation). */
function byCoefficient(a: CountrySlotInput, b: CountrySlotInput): number {
  if (a.coefficient !== b.coefficient) return b.coefficient - a.coefficient;
  return a.country < b.country ? -1 : a.country > b.country ? 1 : 0;
}

/**
 * Places per country for the continent's two competitions (32 each, when there is enough total
 * club capacity across all countries — with too few clubs overall the totals come up short of 32;
 * callers that need exactly 32 should assert on the result). Zone countries (the big leagues /
 * Brazil) keep their zone places, capped to their own club count; anything a zone place cannot
 * use (too few clubs) flows to the other countries through the normal allocation below. The rest
 * go by coefficient (desc, then name); a country never gets more places (primary + secondary)
 * than clubs in its top league. Leftovers — from a capped zone place, from a country too small
 * for its full pattern share, or from a missing country — flow forward to the next country by
 * coefficient, never back up to a country already placed earlier in the order.
 */
export function allocateSlots(continent: "Europe" | "South America", countries: CountrySlotInput[]): SlotTable {
  const out: SlotTable = {};
  for (const c of countries) {
    const primary = Math.min(c.zoneSlots?.primary ?? 0, c.clubs);
    const secondary = Math.min(c.zoneSlots?.secondary ?? 0, c.clubs - primary);
    out[c.country] = { primary, secondary };
  }
  const zoneCountries = countries.filter((c) => c.zoneSlots).sort(byCoefficient);
  const others = countries.filter((c) => !c.zoneSlots).sort(byCoefficient);
  const room = (c: CountrySlotInput) => c.clubs - out[c.country]!.primary - out[c.country]!.secondary;
  const used = (k: "primary" | "secondary") => Object.values(out).reduce((n, v) => n + v[k], 0);

  const give = (k: "primary" | "secondary", c: CountrySlotInput, n: number) => {
    const g = Math.max(0, Math.min(n, room(c), PER_COMPETITION - used(k)));
    out[c.country]![k] += g;
  };
  /**
   * Fill `k` to 32 walking `order` forward, one place at a time per pass, respecting room.
   * A shortfall earlier in `order` is topped up by whoever comes AFTER it in `order` that still
   * has room — never by restarting from the front — because each pass starts over from the same
   * fixed `order` and `give` is a no-op once a country is full. Loops passes until 32 is reached
   * or nobody has room left (in which case the total comes up short of 32).
   */
  const fill = (k: "primary" | "secondary", order: CountrySlotInput[]) => {
    for (let guard = 0; used(k) < PER_COMPETITION && guard < 1000; guard++) {
      const before = used(k);
      for (const c of order) { if (used(k) >= PER_COMPETITION) break; give(k, c, 1); }
      if (used(k) === before) break; // nobody has room
    }
  };

  if (continent === "Europe") {
    // Primary: one place to each of the best others until 32.
    for (const c of others) { if (used("primary") >= PER_COMPETITION) break; give("primary", c, 1); }
    fill("primary", [...others, ...zoneCountries]);
    // Secondary: one each (by coefficient) to countries with a primary place first, then to those without.
    const noPrimary = others.filter((c) => out[c.country]!.primary === 0);
    const withPrimary = others.filter((c) => out[c.country]!.primary > 0);
    for (const c of [...withPrimary, ...noPrimary]) { if (used("secondary") >= PER_COMPETITION) break; give("secondary", c, 1); }
    fill("secondary", [...others, ...zoneCountries]);
  } else {
    const arg = others.find((c) => c.country === "Argentina");
    const rest = others.filter((c) => c !== arg);
    for (const k of ["primary", "secondary"] as const) {
      if (arg) give(k, arg, ARGENTINA_SA);
      rest.forEach((c, i) => give(k, c, SA_OTHERS_PATTERN[i] ?? 0));
      // Leftover (a country too small for its pattern share, or a missing country) flows forward
      // through `rest` first — Argentina only after everyone else has had a chance at it, and the
      // zone country (Brazil) last of all.
      fill(k, [...rest, ...(arg ? [arg] : []), ...zoneCountries]);
    }
  }
  return out;
}
