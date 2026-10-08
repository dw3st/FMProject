import { describe, expect, test } from "bun:test";
import { generatePool, refreshPool, returnToPool, searchPool, takeFromPool } from "@/Domain/staff/staffPool";
import { STAFF } from "@/Domain/staff/staffConfig";
import { memberStars } from "@/Domain/staff/staff";

describe("staff pool", () => {
  const pool = generatePool("save1", "2027", "2027-02-05");
  test("300, deterministic, by role, no contracts", () => {
    expect(pool.members.length).toBe(STAFF.POOL.SIZE);
    expect(generatePool("save1", "2027", "2027-02-05")).toEqual(pool);
    expect(pool.members.filter((m) => m.role === "coach").length).toBe(90);
    expect(pool.members.every((m) => !m.contract)).toBe(true);
    expect(new Set(pool.members.map((m) => m.id)).size).toBe(300);
  });
  test("star bands: some 4.5+, most 2.5-3", () => {
    const top = pool.members.filter((m) => memberStars(m) >= 4.5).length;
    expect(top).toBeGreaterThan(5);
    expect(top).toBeLessThan(60);
  });
  test("search filters, sorts and pages; asking wage at the club factor", () => {
    const r = searchPool(pool, { role: "medic", minStars: 3, sort: "stars", limit: 5 }, 1);
    expect(r.items.length).toBeLessThanOrEqual(5);
    expect(r.items.every((m) => m.role === "medic" && m.stars >= 3)).toBe(true);
    for (let i = 1; i < r.items.length; i++) expect(r.items[i - 1]!.stars).toBeGreaterThanOrEqual(r.items[i]!.stars);
    const cheap = searchPool(pool, { maxWage: 1000 }, 1);
    expect(cheap.items.every((m) => m.askingWage <= 1000)).toBe(true);
    const page2 = searchPool(pool, { offset: 50, limit: 50 }, 1);
    expect(page2.total).toBe(300);
    expect(page2.items.length).toBe(50);
  });
  test("sorts by every column, both directions, ids breaking ties", () => {
    for (const sort of ["name", "role", "age", "stars", "wage"] as const) {
      const asc = searchPool(pool, { sort, dir: "asc", limit: 100 }, 1).items;
      const desc = searchPool(pool, { sort, dir: "desc", offset: 200, limit: 100 }, 1).items.reverse();
      expect(asc.length).toBe(100);
      // The bottom of the descending list is the top of the ascending one, by the column's value.
      const v = (m: (typeof asc)[number]) => (sort === "name" ? m.name : sort === "role" ? m.role : sort === "age" ? m.age : sort === "stars" ? m.stars : m.askingWage);
      expect(desc.map(v)).toEqual(asc.map(v));
    }
    const byName = searchPool(pool, { sort: "name", limit: 100 }, 1).items;
    for (let i = 1; i < byName.length; i++) expect(byName[i - 1]!.name.localeCompare(byName[i]!.name)).toBeLessThanOrEqual(0);
    // No direction: stars open best first.
    expect(searchPool(pool, { sort: "stars", limit: 1 }, 1).items[0]!.stars).toBe(Math.max(...pool.members.map(memberStars)));
  });
  test("take and return", () => {
    const id = pool.members[0]!.id;
    const t = takeFromPool(pool, id)!;
    expect(t.pool.members.length).toBe(299);
    expect(takeFromPool(pool, "nope")).toBeNull();
    const back = returnToPool(t.pool, { ...t.member, contract: { until: "x", wage: 1, signed: "y" } }, "2027-06-01");
    expect(back.members.find((m) => m.id === id)!.contract).toBeUndefined();
    expect(back.members.find((m) => m.id === id)!.since).toBe("2027-06-01");
    expect(returnToPool(back, t.member, "2027-06-02").members.length).toBe(300);
  });
  test("refresh: retires 68+, swaps a third, back to 300, everyone a year older", () => {
    const next = refreshPool(pool, "save1", "2028", "2028-01-10");
    expect(next.members.length).toBe(300);
    expect(next.members.every((m) => m.age < STAFF.POOL.RETIRE_AGE)).toBe(true);
    const kept = next.members.filter((m) => pool.members.some((o) => o.id === m.id));
    expect(kept.length).toBeLessThanOrEqual(200);
    for (const m of kept) expect(m.age).toBe(pool.members.find((o) => o.id === m.id)!.age + 1);
    expect(new Set(next.members.map((m) => m.id)).size).toBe(300);
    for (const [role, n] of Object.entries(STAFF.POOL.BY_ROLE)) {
      expect(next.members.filter((m) => m.role === role).length).toBe(n);
    }
    expect(refreshPool(next, "save1", "2028", "2028-01-10")).toBe(next); // same date: no-op
  });
  test("refresh is keyed by the rollover date, not the season label (club switched leagues)", () => {
    const first = refreshPool(pool, "save1", "2028", "2028-01-10");
    // A later rollover of another country under the same year label still renews the pool.
    const second = refreshPool(first, "save1", "2028", "2028-06-01");
    expect(second).not.toBe(first);
    expect(second.refreshedOn).toBe("2028-06-01");
    expect(second.members.some((m) => !first.members.some((o) => o.id === m.id))).toBe(true);
    expect(new Set(second.members.map((m) => m.id)).size).toBe(second.members.length);
    // An earlier date (or the generation day) never refreshes again.
    expect(refreshPool(second, "save1", "2029", "2028-05-01")).toBe(second);
    expect(refreshPool(pool, "save1", "2027", "2027-02-05")).toBe(pool);
  });
});
