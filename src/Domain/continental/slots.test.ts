import { describe, expect, test } from "bun:test";
import { allocateSlots, type CountrySlotInput } from "@/Domain/continental/slots";

const europe: CountrySlotInput[] = [
  { country: "England", coefficient: 5.2, clubs: 20, zoneSlots: { primary: 4, secondary: 2 } },
  { country: "Germany", coefficient: 5.1, clubs: 18, zoneSlots: { primary: 4, secondary: 2 } },
  { country: "Spain", coefficient: 5.1, clubs: 20, zoneSlots: { primary: 4, secondary: 2 } },
  { country: "Italy", coefficient: 5.0, clubs: 20, zoneSlots: { primary: 4, secondary: 2 } },
  { country: "France", coefficient: 4.9, clubs: 18, zoneSlots: { primary: 3, secondary: 2 } },
  ...Array.from({ length: 28 }, (_, i) => ({ country: `C${String(i).padStart(2, "0")}`, coefficient: 4.5 - i * 0.05, clubs: 12 })),
];

describe("allocateSlots — Europe", () => {
  const s = allocateSlots("Europe", europe);

  test("32 per competition", () => {
    const sum = (k: "primary" | "secondary") => Object.values(s).reduce((n, v) => n + v[k], 0);
    expect(sum("primary")).toBe(32);
    expect(sum("secondary")).toBe(32);
  });

  test("zones respected; 13 best others get one primary each", () => {
    expect(s.England).toEqual({ primary: 4, secondary: 2 });
    expect(s.Germany).toEqual({ primary: 4, secondary: 2 });
    expect(s.Spain).toEqual({ primary: 4, secondary: 2 });
    expect(s.Italy).toEqual({ primary: 4, secondary: 2 });
    expect(s.France).toEqual({ primary: 3, secondary: 2 });
    // 5 grandes = 19 primary places; 13 more go to the best-coefficient "others" (C00..C12).
    for (let i = 0; i <= 12; i++) {
      expect(s[`C${String(i).padStart(2, "0")}`]!.primary).toBe(1);
    }
    expect(s.C13!.primary).toBe(0);
    expect(s.C27!.primary).toBe(0);
  });

  test("Europa League secondary: countries with a Champions place get 1 first, then countries without one by coefficient, and only after everyone has 1 does anyone get a 2nd", () => {
    // Pool for the 28 non-zone countries: 32 - 10 (5 grandes zone) = 22.
    // 13 countries with a Champions place (C00..C12) each get 1 -> 13 used.
    // Remaining 9 go to the best-coefficient countries WITHOUT a Champions place (C13..C21).
    // C22..C27 (worst coefficient, still without a Champions place) get 0 — the pool ran out
    // before everyone without a place had 1, so nobody gets a 2nd secondary place here.
    for (let i = 0; i <= 12; i++) {
      expect(s[`C${String(i).padStart(2, "0")}`]!.secondary).toBe(1);
    }
    for (let i = 13; i <= 21; i++) {
      expect(s[`C${String(i).padStart(2, "0")}`]!.secondary).toBe(1);
    }
    for (let i = 22; i <= 27; i++) {
      expect(s[`C${String(i).padStart(2, "0")}`]!.secondary).toBe(0);
    }
    const othersSecondaryTotal = Array.from({ length: 28 }, (_, i) => s[`C${String(i).padStart(2, "0")}`]!.secondary)
      .reduce((n, v) => n + v, 0);
    expect(othersSecondaryTotal).toBe(22);
    // Nobody among the non-zone countries has a 2nd secondary place while any of them still has 0.
    const anyWithZero = Array.from({ length: 28 }, (_, i) => s[`C${String(i).padStart(2, "0")}`]!.secondary).some((v) => v === 0);
    const anyWithTwo = Array.from({ length: 28 }, (_, i) => s[`C${String(i).padStart(2, "0")}`]!.secondary).some((v) => v >= 2);
    expect(anyWithZero && anyWithTwo).toBe(false);
  });
});

describe("allocateSlots — South America", () => {
  const sa: CountrySlotInput[] = [
    { country: "Brazil", coefficient: 4.6, clubs: 20, zoneSlots: { primary: 6, secondary: 6 } },
    { country: "Argentina", coefficient: 4.4, clubs: 28 },
    ...["Colombia", "Uruguay", "Chile", "Paraguay", "Peru", "Venezuela"].map((c, i) => ({ country: c, coefficient: 4 - i * 0.1, clubs: 16 })),
  ];
  const s = allocateSlots("South America", sa);

  test("Brazil 6, Argentina 6, others 4,4,3,3,3,3", () => {
    expect(s.Brazil).toEqual({ primary: 6, secondary: 6 });
    expect(s.Argentina).toEqual({ primary: 6, secondary: 6 });
    expect([s.Colombia, s.Uruguay, s.Chile, s.Paraguay, s.Peru, s.Venezuela].map((v) => v!.primary)).toEqual([4, 4, 3, 3, 3, 3]);
    expect([s.Colombia, s.Uruguay, s.Chile, s.Paraguay, s.Peru, s.Venezuela].map((v) => v!.secondary)).toEqual([4, 4, 3, 3, 3, 3]);
  });

  test("32 per competition", () => {
    const sum = (k: "primary" | "secondary") => Object.values(s).reduce((n, v) => n + v[k], 0);
    expect(sum("primary")).toBe(32);
    expect(sum("secondary")).toBe(32);
  });

  test("a country with too few clubs passes its places on", () => {
    const tiny = allocateSlots("South America", sa.map((c) => (c.country === "Venezuela" ? { ...c, clubs: 2 } : c)));
    expect(tiny.Venezuela!.primary + tiny.Venezuela!.secondary).toBeLessThanOrEqual(2);
    expect(Object.values(tiny).reduce((n, v) => n + v.primary, 0)).toBe(32);
    expect(Object.values(tiny).reduce((n, v) => n + v.secondary, 0)).toBe(32);
  });

  test("Colombia short on clubs: Argentina stays 6/6 and the leftover flows to the countries after Colombia in coefficient order", () => {
    const s2 = allocateSlots("South America", sa.map((c) => (c.country === "Colombia" ? { ...c, clubs: 2 } : c)));
    expect(s2.Argentina).toEqual({ primary: 6, secondary: 6 });
    expect(s2.Brazil).toEqual({ primary: 6, secondary: 6 });
    expect(s2.Colombia).toEqual({ primary: 2, secondary: 0 });
    // Leftover (2 primary, 4 secondary) cascades forward to Uruguay, Chile, Paraguay, Peru — never
    // back up to Argentina or Brazil, which come after the "others" in the fill order.
    expect(s2.Uruguay).toEqual({ primary: 5, secondary: 5 });
    expect(s2.Chile).toEqual({ primary: 4, secondary: 4 });
    expect(s2.Paraguay).toEqual({ primary: 3, secondary: 4 });
    expect(s2.Peru).toEqual({ primary: 3, secondary: 4 });
    expect(s2.Venezuela).toEqual({ primary: 3, secondary: 3 });
    expect(Object.values(s2).reduce((n, v) => n + v.primary, 0)).toBe(32);
    expect(Object.values(s2).reduce((n, v) => n + v.secondary, 0)).toBe(32);
  });

  test("a missing country's share flows to the other non-zone countries before Argentina, never to Argentina", () => {
    const noPeru: CountrySlotInput[] = [
      { country: "Brazil", coefficient: 4.6, clubs: 20, zoneSlots: { primary: 6, secondary: 6 } },
      { country: "Argentina", coefficient: 4.4, clubs: 28 },
      ...["Colombia", "Uruguay", "Chile", "Paraguay", "Venezuela"].map((c, i) => ({ country: c, coefficient: 4 - i * 0.1, clubs: 16 })),
    ];
    const s2 = allocateSlots("South America", noPeru);
    expect(s2.Argentina).toEqual({ primary: 6, secondary: 6 });
    expect(s2.Brazil).toEqual({ primary: 6, secondary: 6 });
    expect(Object.values(s2).reduce((n, v) => n + v.primary, 0)).toBe(32);
    expect(Object.values(s2).reduce((n, v) => n + v.secondary, 0)).toBe(32);
  });
});

describe("allocateSlots — zone place capped to a country's own club count", () => {
  test("England with only 3 clubs: {3,0}, and the freed-up places flow to the other countries; totals still 32/32", () => {
    const withTinyEngland = europe.map((c) => (c.country === "England" ? { ...c, clubs: 3 } : c));
    const s = allocateSlots("Europe", withTinyEngland);
    expect(s.England).toEqual({ primary: 3, secondary: 0 });
    const sum = (k: "primary" | "secondary") => Object.values(s).reduce((n, v) => n + v[k], 0);
    expect(sum("primary")).toBe(32);
    expect(sum("secondary")).toBe(32);
    // The freed primary place (England lost 1 of its 4) now reaches one more "other" country
    // than in the full-capacity case (C13, who got 0 in the main Europe test above).
    expect(s.C13!.primary).toBe(1);
  });
});

describe("allocateSlots — zone countries absorb leftover when non-zone capacity is short", () => {
  const tinyOthers: CountrySlotInput[] = [
    { country: "England", coefficient: 5.2, clubs: 20, zoneSlots: { primary: 4, secondary: 2 } },
    { country: "Germany", coefficient: 5.1, clubs: 18, zoneSlots: { primary: 4, secondary: 2 } },
    { country: "Spain", coefficient: 5.1, clubs: 20, zoneSlots: { primary: 4, secondary: 2 } },
    { country: "Italy", coefficient: 5.0, clubs: 20, zoneSlots: { primary: 4, secondary: 2 } },
    { country: "France", coefficient: 4.9, clubs: 18, zoneSlots: { primary: 3, secondary: 2 } },
    { country: "Tiny1", coefficient: 4.5, clubs: 1 },
    { country: "Tiny2", coefficient: 4.4, clubs: 1 },
    { country: "Tiny3", coefficient: 4.3, clubs: 1 },
  ];

  test("with only 3 tiny non-zone countries, the zone countries pick up the rest and totals still reach 32/32", () => {
    const s = allocateSlots("Europe", tinyOthers);
    // Each tiny country only has 1 club total; it gets used as its one primary place, none left for secondary.
    expect(s.Tiny1).toEqual({ primary: 1, secondary: 0 });
    expect(s.Tiny2).toEqual({ primary: 1, secondary: 0 });
    expect(s.Tiny3).toEqual({ primary: 1, secondary: 0 });
    const sum = (k: "primary" | "secondary") => Object.values(s).reduce((n, v) => n + v[k], 0);
    expect(sum("primary")).toBe(32);
    expect(sum("secondary")).toBe(32);
    // The 5 grandes absorbed more than their nominal zone amount (19 primary / 10 secondary)
    // to make up for the 3 tiny countries only supplying 3 primary places between them.
    const zoneCountries = ["England", "Germany", "Spain", "Italy", "France"];
    const zonePrimaryTotal = zoneCountries.reduce((n, c) => n + s[c]!.primary, 0);
    const zoneSecondaryTotal = zoneCountries.reduce((n, c) => n + s[c]!.secondary, 0);
    expect(zonePrimaryTotal).toBeGreaterThan(19);
    expect(zoneSecondaryTotal).toBeGreaterThan(10);
  });
});
