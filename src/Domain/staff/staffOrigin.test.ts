import { describe, expect, test } from "bun:test";
import { buildStaffNameBook, drawStaffOrigin, STAFF_ORIGIN, type StaffNameBook } from "@/Domain/staff/staffOrigin";
import { initialStaff, makeProfessional } from "@/Domain/staff/staff";
import { generatePool } from "@/Domain/staff/staffPool";
import { mulberry32, seedFrom } from "@/Domain/rng";
import countriesRaw from "@/Data/countries.json";
import type { Squad } from "@/types/playerTypes";

const COUNTRIES = countriesRaw as Record<string, { continent?: string }>;

function names(prefix: string, n: number) {
  const tag = (i: number) => String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26));
  return Array.from({ length: n }, (_, i) => ({ name: `${prefix}F${tag(i)} ${prefix}L${tag(i)}`, nationality: prefix }));
}

/** A book with every game country, England far bigger. */
function fullBook(): StaffNameBook {
  const book: StaffNameBook = {};
  for (const c of Object.keys(COUNTRIES)) book[c] = { first: [`${c}First`], last: [`${c}Last`], clubs: c === "England" ? 100 : 4 };
  return book;
}

describe("staff origin", () => {
  test("the name book reads first names and surnames of each nationality, sorted", () => {
    const book = buildStaffNameBook([
      { country: "England", players: [{ name: "H. Kane", fullName: "Harry Edward Kane", nationality: "England" }, { name: "Jude Bellingham", nationality: "England" }] },
      { country: "England", players: [{ name: "Bukayo Saka", nationality: "England" }, ...names("Eng", 20).map((p) => ({ ...p, nationality: "England" }))] },
      { country: "Spain", players: [{ name: "X. Ünknown", nationality: "Atlantis" }, { name: "Pedri González", nationality: "England" }] },
    ]);
    expect(book.England!.first.slice(0, 3)).toEqual(["Bukayo", "EngFaa", "EngFba"]);
    expect(book.England!.first).toContain("Harry");
    expect(book.England!.first).toContain("Pedri");
    expect(book.England!.last).toContain("Kane");
    expect([...book.England!.last].sort()).toEqual(book.England!.last);
    expect(book.England!.clubs).toBe(2);
    expect(book.England!.last).not.toContain("Ünknown");
    expect(book.Atlantis).toBeUndefined();
  });

  test("a nationality with few players borrows the names of the country's clubs", () => {
    const book = buildStaffNameBook([{ country: "Turkey", players: names("Turk", 30).map((p) => ({ ...p, nationality: "Türkiye" })) }]);
    expect(book.Turkey!.last.length).toBeGreaterThanOrEqual(STAFF_ORIGIN.MIN_NAMES);
  });

  test("a club's staff is mostly from home, the rest from its continent", () => {
    const book = fullBook();
    let home = 0;
    let continent = 0;
    for (let i = 0; i < 2000; i++) {
      const o = drawStaffOrigin(book, mulberry32(seedFrom(`k${i}`)), "Kenya")!;
      if (o.nationality === "Kenya") home++;
      else if (COUNTRIES[o.nationality]?.continent === "Africa") continent++;
      expect(o.name).toBe(`${o.nationality}First ${o.nationality}Last`);
    }
    expect(home / 2000).toBeGreaterThan(0.76);
    expect(home / 2000).toBeLessThan(0.84);
    expect(home + continent).toBe(2000);
  });

  test("the free pool draws every country, bigger football countries more often", () => {
    const book = fullBook();
    const seen = new Map<string, number>();
    for (let i = 0; i < 6000; i++) {
      const o = drawStaffOrigin(book, mulberry32(seedFrom(`p${i}`)))!;
      seen.set(o.nationality, (seen.get(o.nationality) ?? 0) + 1);
    }
    expect(seen.size).toBe(Object.keys(COUNTRIES).length);
    expect(seen.get("England")!).toBeGreaterThan(3 * seen.get("Kenya")!);
  });

  test("makeProfessional: same attributes with or without a book; deterministic", () => {
    const book = fullBook();
    const plain = makeProfessional("key", "scout", 3);
    const local = makeProfessional("key", "scout", 3, { book, home: "Japan" });
    expect(local.attributes).toEqual(plain.attributes);
    expect(local.age).toBe(plain.age);
    expect(local.id).toBe(plain.id);
    expect(makeProfessional("key", "scout", 3, { book, home: "Japan" })).toEqual(local);
    expect(makeProfessional("key", "scout", 3, { book: {} })).toEqual(plain);
  });

  test("initial staff of a Japanese club and a pool from the book", () => {
    const book = fullBook();
    const squad = { id: "jp", name: "Club", colors: ["#000", "#fff"], money: 0, players: [] } as unknown as Squad;
    let japanese = 0;
    let total = 0;
    for (let i = 0; i < 30; i++) {
      const staff = initialStaff(`save${i}:jp`, squad, { date: "2027-02-05", seasonEnd: "2027-11-30" }, { book, home: "Japan" });
      expect(staff.members.every((m) => m.nationality === "Japan" || COUNTRIES[m.nationality]?.continent === "Asia")).toBe(true);
      japanese += staff.members.filter((m) => m.nationality === "Japan").length;
      total += staff.members.length;
    }
    expect(japanese / total).toBeGreaterThan(0.72);
    const pool = generatePool("save", "2027", "2027-02-05", book);
    expect(new Set(pool.members.map((m) => m.nationality)).size).toBeGreaterThan(40);
    expect(generatePool("save", "2027", "2027-02-05", book)).toEqual(pool);
  });
});

test("nationalities spelled differently from the game country count for it", () => {
  const book = buildStaffNameBook([{ country: "", players: names("Cz", 20).map((p) => ({ ...p, nationality: "Czechia" })) }]);
  expect(book["Czech Republic"]!.first.length).toBe(20);
});
