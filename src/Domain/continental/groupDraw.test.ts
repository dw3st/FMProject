import { describe, expect, test } from "bun:test";
import { drawGroups, type DrawClub, type DrawnGroup } from "@/Domain/continental/groupDraw";
import { mulberry32 } from "@/Domain/rng";

/** Total same-country clashes across all groups (0 = a fully clean draw). */
function countClashes(groups: DrawnGroup[], countryOf: Map<string, string>): number {
  let clashes = 0;
  for (const g of groups) {
    const counts = new Map<string, number>();
    for (const id of g.clubs) {
      const country = countryOf.get(id)!;
      counts.set(country, (counts.get(country) ?? 0) + 1);
    }
    for (const n of counts.values()) clashes += Math.max(0, n - 1);
  }
  return clashes;
}

const clubs: DrawClub[] = Array.from({ length: 32 }, (_, i) => ({
  id: `c${i}`,
  country: ["England", "Spain", "Italy", "Germany", "France", "Portugal", "Netherlands", "Turkey"][i % 8]!,
  level: 6 - i * 0.05,
}));

describe("drawGroups", () => {
  const groups = drawGroups(clubs, mulberry32(1));

  test("8 groups of 4, every club once", () => {
    expect(groups).toHaveLength(8);
    expect(groups.every((g) => g.clubs.length === 4)).toBe(true);
    expect(new Set(groups.flatMap((g) => g.clubs)).size).toBe(32);
  });

  test("one club per pot per group (pot = rank by level / 8)", () => {
    const rank = new Map([...clubs].sort((a, b) => b.level - a.level).map((c, i) => [c.id, Math.floor(i / 8)]));
    for (const g of groups) expect(g.clubs.map((id) => rank.get(id)).sort()).toEqual([0, 1, 2, 3]);
  });

  test("no two clubs of the same country in a group", () => {
    const country = new Map(clubs.map((c) => [c.id, c.country]));
    for (const g of groups) expect(new Set(g.clubs.map((id) => country.get(id))).size).toBe(4);
  });

  test("deterministic", () => {
    expect(drawGroups(clubs, mulberry32(7))).toEqual(drawGroups(clubs, mulberry32(7)));
  });

  test("different seeds usually give different draws", () => {
    expect(drawGroups(clubs, mulberry32(1))).not.toEqual(drawGroups(clubs, mulberry32(2)));
  });

  test("fewer than 32 clubs throws", () => {
    expect(() => drawGroups(clubs.slice(0, 31), mulberry32(1))).toThrow();
  });

  test("stays fast", () => {
    const t0 = performance.now();
    drawGroups(clubs, mulberry32(42));
    expect(performance.now() - t0).toBeLessThan(50);
  });
});

describe("drawGroups — heavy country, strict rule still satisfiable", () => {
  // "Big" has exactly 8 clubs, 2 per pot — forces exactly one Big club per group (8 groups, 8 clubs),
  // which is only solvable if the search actually explores placements rather than a greedy first-fit.
  const OTHER_COUNTRIES = ["C1", "C2", "C3", "C4", "Q5", "Q6"];
  const heavy: DrawClub[] = [];
  let level = 32;
  for (let pot = 0; pot < 4; pot++) {
    heavy.push({ id: `big_${pot}_a`, country: "Big", level: level-- });
    heavy.push({ id: `big_${pot}_b`, country: "Big", level: level-- });
    for (const c of OTHER_COUNTRIES) heavy.push({ id: `${c}_${pot}`, country: c, level: level-- });
  }
  const country = new Map(heavy.map((c) => [c.id, c.country]));

  test("still one club per pot, no two same country per group, even under 8 solid Big clubs", () => {
    const groups = drawGroups(heavy, mulberry32(3));
    expect(groups).toHaveLength(8);
    for (const g of groups) {
      expect(g.clubs).toHaveLength(4);
      expect(new Set(g.clubs.map((id) => country.get(id))).size).toBe(4);
    }
    const bigCounts = groups.map((g) => g.clubs.filter((id) => country.get(id) === "Big").length);
    expect(bigCounts).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  });

  test("holds across several seeds (real search, not luck)", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const groups = drawGroups(heavy, mulberry32(seed));
      expect(countClashes(groups, country)).toBe(0);
    }
  });
});

describe("drawGroups — two heavy countries spread evenly (pigeonhole, but solvable)", () => {
  // X and Y each have exactly 8 clubs, 2 per pot, plus 4 pot-unique countries filling the rest of
  // each pot. A zero-clash draw always exists here (X and Y can each occupy all 8 groups exactly
  // once, on disjoint pot-pairs) — but a fixed shuffle order with no lookahead across pots regularly
  // dead-ends before finding it (this was the original bug: ~36% of seeds produced a same-country
  // group). The fix must find the zero-clash draw essentially every time, and fast.
  const xyClubs: DrawClub[] = [];
  {
    let lvl = 32;
    for (let pot = 0; pot < 4; pot++) {
      xyClubs.push({ id: `x_${pot}_a`, country: "X", level: lvl-- });
      xyClubs.push({ id: `x_${pot}_b`, country: "X", level: lvl-- });
      xyClubs.push({ id: `y_${pot}_a`, country: "Y", level: lvl-- });
      xyClubs.push({ id: `y_${pot}_b`, country: "Y", level: lvl-- });
      for (let u = 0; u < 4; u++) xyClubs.push({ id: `u${pot}_${u}`, country: `U${pot}_${u}`, level: lvl-- });
    }
  }
  const country = new Map(xyClubs.map((c) => [c.id, c.country]));

  test("zero clashes on seeds 1-200", () => {
    let maxTime = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const t0 = performance.now();
      const groups = drawGroups(xyClubs, mulberry32(seed));
      maxTime = Math.max(maxTime, performance.now() - t0);
      expect(groups).toHaveLength(8);
      expect(groups.every((g) => g.clubs.length === 4)).toBe(true);
      expect(countClashes(groups, country)).toBe(0);
    }
    expect(maxTime).toBeLessThan(50);
  });
});

describe("drawGroups — impossible country rule falls back but minimises clashes", () => {
  // "Mono" has 9 clubs (3 in pot0, 2 each in pots 1-3) — pigeonholed into only 8 groups, so a
  // zero-clash draw is mathematically impossible (9 items, 8 groups, at most 1 per group). The
  // true minimum is exactly 1 clash, and the relaxed path must reach that minimum, not just any
  // clash count — a naive relaxed placement can produce 2 or more.
  const mono: DrawClub[] = [];
  let level = 32;
  const push = (country: string) => mono.push({ id: `${country}_${mono.length}`, country, level: level-- });
  push("Mono"); push("Mono"); push("Mono");
  for (let i = 0; i < 5; i++) push(`O${i}`);
  push("Mono"); push("Mono");
  for (let i = 0; i < 6; i++) push(`P${i}`);
  push("Mono"); push("Mono");
  for (let i = 0; i < 6; i++) push(`Q${i}`);
  push("Mono"); push("Mono");
  for (let i = 0; i < 6; i++) push(`R${i}`);
  const country = new Map(mono.map((c) => [c.id, c.country]));

  test("32 clubs total, 9 of them Mono", () => {
    expect(mono).toHaveLength(32);
    expect(mono.filter((c) => c.country === "Mono")).toHaveLength(9);
  });

  test("relaxed fallback still respects one club per pot per group", () => {
    const groups = drawGroups(mono, mulberry32(9));
    expect(groups).toHaveLength(8);
    expect(groups.every((g) => g.clubs.length === 4)).toBe(true);
    expect(new Set(groups.flatMap((g) => g.clubs)).size).toBe(32);
    const rank = new Map([...mono].sort((a, b) => b.level - a.level).map((c, i) => [c.id, Math.floor(i / 8)]));
    for (const g of groups) expect(g.clubs.map((id) => rank.get(id)).sort()).toEqual([0, 1, 2, 3]);
  });

  test("exactly 1 clash (the true minimum) on seeds 1-50, and it stays fast", () => {
    let maxTime = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const t0 = performance.now();
      const groups = drawGroups(mono, mulberry32(seed));
      maxTime = Math.max(maxTime, performance.now() - t0);
      expect(countClashes(groups, country)).toBe(1);
    }
    expect(maxTime).toBeLessThan(50);
  });
});
