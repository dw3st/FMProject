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
});
