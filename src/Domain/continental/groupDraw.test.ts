import { describe, expect, test } from "bun:test";
import { drawGroups, type DrawClub } from "@/Domain/continental/groupDraw";
import { mulberry32 } from "@/Domain/rng";

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
});

describe("drawGroups — heavy country, strict rule still satisfiable", () => {
  // "Big" has exactly 8 clubs, 2 per pot — forces exactly one Big club per group (8 groups, 8 clubs),
  // which is only solvable if backtracking actually explores placements rather than a greedy first-fit.
  const OTHER_COUNTRIES = ["C1", "C2", "C3", "C4", "Q5", "Q6"];
  const heavy: DrawClub[] = [];
  let level = 32;
  for (let pot = 0; pot < 4; pot++) {
    heavy.push({ id: `big_${pot}_a`, country: "Big", level: level-- });
    heavy.push({ id: `big_${pot}_b`, country: "Big", level: level-- });
    for (const c of OTHER_COUNTRIES) heavy.push({ id: `${c}_${pot}`, country: c, level: level-- });
  }

  test("still one club per pot, no two same country per group, even under 8 solid Big clubs", () => {
    const groups = drawGroups(heavy, mulberry32(3));
    expect(groups).toHaveLength(8);
    const country = new Map(heavy.map((c) => [c.id, c.country]));
    for (const g of groups) {
      expect(g.clubs).toHaveLength(4);
      expect(new Set(g.clubs.map((id) => country.get(id))).size).toBe(4);
    }
    // Exactly one "Big" club per group.
    const bigCounts = groups.map((g) => g.clubs.filter((id) => country.get(id) === "Big").length);
    expect(bigCounts).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  });

  test("holds across several seeds (backtracking, not luck)", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const groups = drawGroups(heavy, mulberry32(seed));
      const country = new Map(heavy.map((c) => [c.id, c.country]));
      for (const g of groups) expect(new Set(g.clubs.map((id) => country.get(id))).size).toBe(4);
    }
  });
});

describe("drawGroups — impossible country rule falls back but keeps one club per pot", () => {
  // "Mono" has 9 clubs (3 in pot0, 2 each in pots 1-3) — pigeonholed into only 8 groups, so by pot 3
  // the strict rule is unsatisfiable and the relaxed fallback must kick in for that pot only.
  const mono: DrawClub[] = [];
  let level = 32;
  const push = (country: string) => mono.push({ id: `${country}_${mono.length}`, country, level: level-- });
  // pot 0: 3 Mono + 5 others
  push("Mono"); push("Mono"); push("Mono");
  for (let i = 0; i < 5; i++) push(`O${i}`);
  // pot 1: 2 Mono + 6 others
  push("Mono"); push("Mono");
  for (let i = 0; i < 6; i++) push(`P${i}`);
  // pot 2: 2 Mono + 6 others
  push("Mono"); push("Mono");
  for (let i = 0; i < 6; i++) push(`Q${i}`);
  // pot 3: 2 Mono + 6 others
  push("Mono"); push("Mono");
  for (let i = 0; i < 6; i++) push(`R${i}`);

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

  test("9 Mono clubs into 8 groups must double up in exactly one group", () => {
    const groups = drawGroups(mono, mulberry32(9));
    const country = new Map(mono.map((c) => [c.id, c.country]));
    const counts = groups.map((g) => g.clubs.filter((id) => country.get(id) === "Mono").length);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(9);
    expect(counts.every((n) => n >= 1)).toBe(true);
    expect(counts.filter((n) => n === 2)).toHaveLength(1);
  });
});
