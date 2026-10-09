import { describe, expect, test } from "bun:test";
import { ageOn, buildCountryPool, poolSizeFor, realQuality, renewCountryPool, type RealReferee } from "@/Domain/referees/pool";
import type { StaffNameBook } from "@/Domain/staff/staffOrigin";

const real = (o: Partial<RealReferee>): RealReferee => ({
  id: "ref_Q1", wikidataQid: "Q1", name: "Anthony Taylor", country: "England", birthDate: "1985-01-01", role: "referee",
  gender: "male", fifa: false, sitelinks: 3, ...o,
});
const book: StaffNameBook = { England: { first: ["John", "Mark"], last: ["Smith", "Clarke"], clubs: 90 } };
const DATE = "2026-08-01";

describe("pool size", () => {
  test("1.5 × matches per round, at least 10; two assistants per referee", () => {
    expect(poolSizeFor(22)).toEqual({ referees: 33, assistants: 66 });
    expect(poolSizeFor(4)).toEqual({ referees: 10, assistants: 20 });
  });
});

describe("buildCountryPool", () => {
  const reals = [
    real({ id: "ref_Q1", sitelinks: 30, fifa: true, strictness: 0.6 }),
    real({ id: "ref_Q2", sitelinks: 1 }),
    real({ id: "ref_Q3", sitelinks: 5, gender: "female" }),
    real({ id: "ref_Q4", birthDate: "1970-01-01" }),
    real({ id: "ref_Q5", country: "Spain" }),
  ];
  const pool = buildCountryPool({ country: "England", real: reals, matchesPerRound: 4, book, saveId: "s1", date: DATE });
  test("reals first, the rest generated, sizes right, unique ids", () => {
    expect(pool.filter((r) => r.role === "referee")).toHaveLength(10);
    expect(pool.filter((r) => r.role === "assistant")).toHaveLength(20);
    expect(pool.some((r) => r.id === "ref_Q1")).toBe(true);
    expect(pool.some((r) => r.id === "ref_Q4")).toBe(false); // 56 years old
    expect(pool.some((r) => r.id === "ref_Q5")).toBe(false); // other country
    expect(new Set(pool.map((r) => r.id)).size).toBe(pool.length);
    const gen = pool.filter((r) => r.generated);
    expect(gen.length).toBe(27);
    for (const g of gen) {
      expect(g.country).toBe("England");
      expect(["John Smith", "John Clarke", "Mark Smith", "Mark Clarke"]).toContain(g.name);
      expect(g.quality).toBeGreaterThanOrEqual(15);
      expect(g.quality).toBeLessThanOrEqual(55);
      expect(g.id.startsWith("ref_g_england_2026_")).toBe(true);
    }
  });
  test("real rigor kept, drawn otherwise; women kept", () => {
    const q1 = pool.find((r) => r.id === "ref_Q1")!;
    expect(q1.strictness).toBe(0.6);
    expect(q1.realStrictness).toBe(true);
    expect(pool.find((r) => r.id === "ref_Q2")!.realStrictness).toBeUndefined();
    expect(pool.find((r) => r.id === "ref_Q3")!.gender).toBe("female");
  });
  test("deterministic", () => {
    expect(buildCountryPool({ country: "England", real: reals, matchesPerRound: 4, book, saveId: "s1", date: DATE })).toEqual(pool);
  });
  test("without book: built-in names", () => {
    const p = buildCountryPool({ country: "England", real: [], matchesPerRound: 4, saveId: "s1", date: DATE });
    expect(p).toHaveLength(30);
  });
});

describe("realQuality", () => {
  test("the most famous ≥ 80; fifa +12; within 30..98", () => {
    const rs = [real({ id: "a", sitelinks: 40 }), real({ id: "b", sitelinks: 2 }), real({ id: "c", sitelinks: 2, fifa: true })];
    expect(realQuality(rs[0]!, rs, DATE)).toBeGreaterThanOrEqual(80);
    expect(realQuality(rs[2]!, rs, DATE) - realQuality(rs[1]!, rs, DATE)).toBe(12);
    for (const r of rs) { const q = realQuality(r, rs, DATE); expect(q).toBeGreaterThanOrEqual(30); expect(q).toBeLessThanOrEqual(98); }
  });
});

describe("renewCountryPool", () => {
  test("retires 50+, keeps under 46, refills, other countries untouched", () => {
    const base = buildCountryPool({ country: "England", real: [], matchesPerRound: 4, book, saveId: "s1", date: DATE });
    const spain = buildCountryPool({ country: "Spain", real: [], matchesPerRound: 4, saveId: "s1", date: DATE });
    const old = { ...base[0]!, birthDate: "1975-01-01" };
    const young = { ...base[1]!, birthDate: "1995-01-01", quality: 40 };
    const pool = { referees: [old, young, ...base.slice(2), ...spain], renewed: {} };
    const { pool: next, retired } = renewCountryPool(pool, { country: "England", date: "2027-06-01", saveId: "s1", matchesPerRound: 4, book });
    expect(retired).toContain(old.id);
    expect(retired).not.toContain(young.id);
    expect(next.referees.find((r) => r.id === young.id)!.quality).toBe(42);
    expect(next.referees.filter((r) => r.country === "England" && r.role === "referee")).toHaveLength(10);
    expect(next.referees.filter((r) => r.country === "Spain")).toEqual(spain);
    for (const r of next.referees) expect(ageOn(r.birthDate, "2027-06-01")).toBeLessThan(50);
    expect(new Set(next.referees.map((r) => r.id)).size).toBe(next.referees.length);
    expect(next.renewed.England).toBe("2027-06-01");
  });
  test("a generated referee reaching 80 gets the FIFA badge", () => {
    const base = buildCountryPool({ country: "England", real: [], matchesPerRound: 4, book, saveId: "s1", date: DATE });
    const star = { ...base[0]!, birthDate: "1995-01-01", quality: 79 };
    const { pool } = renewCountryPool({ referees: [star, ...base.slice(1)], renewed: {} }, { country: "England", date: "2027-06-01", saveId: "s1", matchesPerRound: 4, book });
    expect(pool.referees.find((r) => r.id === star.id)!.fifa).toBe(true);
  });
});
