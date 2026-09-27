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

/**
 * Places per country for the continent's two competitions (32 each). Zone countries keep their
 * zone places; the rest go by coefficient (desc, then name). A country never gets more places
 * (primary + secondary) than clubs in its top league; leftovers go to the next country in order.
 */
export function allocateSlots(continent: "Europe" | "South America", countries: CountrySlotInput[]): SlotTable {
  const out: SlotTable = {};
  for (const c of countries) out[c.country] = { primary: c.zoneSlots?.primary ?? 0, secondary: c.zoneSlots?.secondary ?? 0 };
  const others = countries.filter((c) => !c.zoneSlots)
    .sort((a, b) => b.coefficient - a.coefficient || a.country.localeCompare(b.country));
  const room = (c: CountrySlotInput) => c.clubs - out[c.country]!.primary - out[c.country]!.secondary;
  const used = (k: "primary" | "secondary") => Object.values(out).reduce((n, v) => n + v[k], 0);

  const give = (k: "primary" | "secondary", c: CountrySlotInput, n: number) => {
    const g = Math.max(0, Math.min(n, room(c), PER_COMPETITION - used(k)));
    out[c.country]![k] += g;
  };
  /** Fill `k` to 32 walking `order` round-robin, one place at a time, respecting room. */
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
    fill("primary", others);
    // Secondary: one each (by coefficient) to countries with a primary place first, then to those without.
    const noPrimary = others.filter((c) => out[c.country]!.primary === 0);
    const withPrimary = others.filter((c) => out[c.country]!.primary > 0);
    for (const c of [...withPrimary, ...noPrimary]) { if (used("secondary") >= PER_COMPETITION) break; give("secondary", c, 1); }
    fill("secondary", others);
  } else {
    const arg = others.find((c) => c.country === "Argentina");
    const rest = others.filter((c) => c !== arg);
    for (const k of ["primary", "secondary"] as const) {
      if (arg) give(k, arg, ARGENTINA_SA);
      rest.forEach((c, i) => give(k, c, SA_OTHERS_PATTERN[i] ?? 0));
      fill(k, arg ? [arg, ...rest] : rest);
    }
  }
  return out;
}
