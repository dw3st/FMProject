import { afterEach, describe, expect, test } from "bun:test";
import { clubSurnames, drawAcademyName, setAcademyNameBook, surnameOf } from "@/Domain/youth/academyNames";
import { buildStaffNameBook } from "@/Domain/staff/staffOrigin";

const many = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}son`);

afterEach(() => setAcademyNameBook(null));

describe("academy names (11.1)", () => {
  test("no book for the nationality: null (the caller falls back)", () => {
    expect(drawAcademyName({ seed: "s", slot: 0, nationality: "England", surnames: new Set() })).toBeNull();
    setAcademyNameBook({ England: { first: ["John"], last: ["Smith"] } });
    expect(drawAcademyName({ seed: "s", slot: 0, nationality: "Spain", surnames: new Set() })).toBeNull();
    expect(drawAcademyName({ seed: "s", slot: 0, nationality: null, surnames: new Set() })).toBeNull();
  });

  test("deterministic, and the surname comes from the youth list when it is long enough", () => {
    const youth = many("Y", 30);
    setAcademyNameBook({ England: { first: ["John", "Mark"], last: [...youth, "Kane", "Saka"], lastYouth: youth } });
    const a = drawAcademyName({ seed: "s", slot: 1, nationality: "England", surnames: new Set() });
    expect(a).toBe(drawAcademyName({ seed: "s", slot: 1, nationality: "England", surnames: new Set() }));
    for (let i = 0; i < 300; i++) {
      const name = drawAcademyName({ seed: "x", slot: i, nationality: "England", surnames: new Set() })!;
      expect(youth.map((y) => y.toLowerCase())).toContain(surnameOf(name));
    }
  });

  test("a short youth list is ignored (small countries keep every surname)", () => {
    setAcademyNameBook({ Malta: { first: ["John"], last: ["Borg", "Camilleri", "Vella"], lastYouth: ["Vella"] } });
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(surnameOf(drawAcademyName({ seed: "m", slot: i, nationality: "Malta", surnames: new Set() })!));
    expect(seen.size).toBe(3);
  });

  test("never a surname already at the club, nor twice in the same intake", () => {
    const last = many("S", 40);
    setAcademyNameBook({ England: { first: ["John", "Mark", "Luke"], last } });
    const squad = { players: last.slice(0, 20).map((l) => ({ name: `A. ${l}` })), youth: last.slice(20, 30).map((l) => ({ name: `B. ${l}` })) };
    const surnames = clubSurnames(squad);
    const taken = new Set<string>();
    const drawn: string[] = [];
    for (let i = 0; i < 6; i++) drawn.push(drawAcademyName({ seed: "club:2030", slot: i, nationality: "England", surnames, taken })!);
    for (const n of drawn) expect(surnames.has(surnameOf(n))).toBe(false);
    expect(new Set(drawn.map(surnameOf)).size).toBe(drawn.length);
    expect(taken.size).toBe(drawn.length);
  });
});

describe("name book: surnames of well-known players stay out of the academy list", () => {
  test("lastYouth drops a surname any known player of the world carries", () => {
    const players = [
      ...many("S", 20).map((l) => ({ name: `A. ${l}`, fullName: `Adam ${l}`, nationality: "England" })),
      { name: "H. Kane", fullName: "Harry Kane", nationality: "England", known: true },
      // The same surname on an unknown player of another country still counts as known.
      { name: "B. Saka", fullName: "Bukayo Saka", nationality: "England" },
      { name: "X. Saka", fullName: "Xavi Saka", nationality: "Spain", known: true },
    ];
    const book = buildStaffNameBook([{ country: "England", players }]);
    expect(book.England!.last).toContain("Kane");
    expect(book.England!.lastYouth).toBeDefined();
    expect(book.England!.lastYouth).not.toContain("Kane");
    expect(book.England!.lastYouth).not.toContain("Saka");
    expect(book.England!.lastYouth!.length).toBe(20);
  });
});
