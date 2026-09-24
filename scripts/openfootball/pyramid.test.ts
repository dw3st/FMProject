import { describe, expect, spyOn, test } from "bun:test";
import { buildPyramid, zonesFromPyramid, type PyramidLeague } from "@/../scripts/openfootball/pyramid";
import type { CountryPyramid } from "@/types/pyramidTypes";

const L = (slug: string, country: string, clubs: number, tier: number): PyramidLeague => ({ slug, country, clubs, tier });

const counts = (p: CountryPyramid) =>
  p.levels.map((lv) => lv.groups.map((g) => `${g.leagueSlug}:${g.promote}/${g.relegate}`));

function expectCoherent(p: CountryPyramid) {
  for (let i = 0; i + 1 < p.levels.length; i++) {
    const down = p.levels[i]!.groups.reduce((s, g) => s + g.relegate, 0);
    const up = p.levels[i + 1]!.groups.reduce((s, g) => s + g.promote, 0);
    expect(down).toBe(up);
  }
  expect(p.levels[0]!.groups.every((g) => g.promote === 0)).toBe(true);
  expect(p.levels.at(-1)!.groups.every((g) => g.relegate === 0)).toBe(true);
}

describe("buildPyramid", () => {
  test("par simples 20/19 → 3/3", () => {
    const p = buildPyramid([L("pl", "England", 20, 1), L("ch", "England", 19, 2)]).England!;
    expect(counts(p)).toEqual([["pl:0/3"], ["ch:3/0"]]);
    expectCoherent(p);
  });

  test("par 17/10 (Colômbia) → 2/2", () => {
    const p = buildPyramid([L("c1", "Colombia", 17, 1), L("c2", "Colombia", 10, 2)]).Colombia!;
    expect(counts(p)).toEqual([["c1:0/2"], ["c2:2/0"]]);
    expectCoherent(p);
  });

  test("Itália: B rebaixa 3, cada grupo C sobe 1; grupos em ordem de slug", () => {
    const p = buildPyramid([
      L("sa", "Italy", 20, 1), L("sb", "Italy", 20, 2),
      L("sc_c", "Italy", 19, 3), L("sc_a", "Italy", 19, 3), L("sc_b", "Italy", 18, 3),
    ]).Italy!;
    expect(counts(p)).toEqual([["sa:0/3"], ["sb:3/3"], ["sc_a:1/0", "sc_b:1/0", "sc_c:1/0"]]);
    expectCoherent(p);
  });

  test("Rússia com overrides: 1ª rebaixa 2; nível 3 rebaixa 3 como 2 e 1", () => {
    const p = buildPyramid([
      L("rpl", "Russia", 16, 1), L("r1", "Russia", 18, 2),
      L("a_gold", "Russia", 10, 3), L("a_silver", "Russia", 8, 3),
      L("b_2", "Russia", 10, 4), L("b_3", "Russia", 9, 4), L("b_4", "Russia", 8, 4),
    ]).Russia!;
    expect(counts(p)).toEqual([
      ["rpl:0/3"], ["r1:3/2"], ["a_gold:1/2", "a_silver:1/1"], ["b_2:1/0", "b_3:1/0", "b_4:1/0"],
    ]);
    expectCoherent(p);
  });

  test("Brasil C (último nível) rebaixa 0", () => {
    const p = buildPyramid([L("a", "Brazil", 20, 1), L("b", "Brazil", 20, 2), L("c", "Brazil", 20, 3)]).Brazil!;
    expect(counts(p)).toEqual([["a:0/3"], ["b:3/3"], ["c:3/0"]]);
    expectCoherent(p);
  });

  test("override de fronteira: Brasil 4/4 em A↔B e B↔C", () => {
    const leagues = [L("a", "Brazil", 20, 1), L("b", "Brazil", 20, 2), L("c", "Brazil", 20, 3), L("pl", "England", 20, 1), L("ch", "England", 19, 2)];
    const ps = buildPyramid(leagues, { boundaries: { Brazil: { "1-2": 4, "2-3": 4 } } });
    expect(counts(ps.Brazil!)).toEqual([["a:0/4"], ["b:4/4"], ["c:4/0"]]);
    expectCoherent(ps.Brazil!);
    expect(counts(ps.England!)).toEqual([["pl:0/3"], ["ch:3/0"]]);
  });

  test("override de fronteira ainda respeita o limite de metade dos clubes", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const p = buildPyramid([L("big", "X", 20, 1), L("small", "X", 6, 2)], { boundaries: { X: { "1-2": 5 } } }).X!;
    expect(counts(p)).toEqual([["big:0/3"], ["small:3/0"]]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test("override numa fronteira K≥2: igual a K funciona, diferente lança erro", () => {
    const italy = [
      L("sa", "Italy", 20, 1), L("sb", "Italy", 20, 2),
      L("sc_a", "Italy", 19, 3), L("sc_b", "Italy", 18, 3), L("sc_c", "Italy", 19, 3),
    ];
    expect(counts(buildPyramid(italy, { boundaries: { Italy: { "2-3": 3 } } }).Italy!)[2])
      .toEqual(["sc_a:1/0", "sc_b:1/0", "sc_c:1/0"]);
    expect(() => buildPyramid(italy, { boundaries: { Italy: { "2-3": 4 } } })).toThrow(/Italy.*2-3.*3 groups/);
  });

  test("override de fronteira inexistente lança erro", () => {
    const br = [L("a", "Brazil", 20, 1), L("b", "Brazil", 20, 2)];
    expect(() => buildPyramid(br, { boundaries: { Brazil: { "2-3": 4 } } })).toThrow(/Brazil.*2-3/);
    expect(() => buildPyramid(br, { boundaries: { Narnia: { "1-2": 4 } } })).toThrow(/Narnia/);
  });

  test("país com um nível fica fora", () => {
    const ps = buildPyramid([L("x", "Germany", 18, 1), L("y", "Chile", 16, 1), L("z", "Chile", 12, 1)]);
    expect(ps).toEqual({});
  });

  test("limite de metade dos clubes: par com grupo pequeno reduz e avisa", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const p = buildPyramid([L("big", "X", 20, 1), L("tiny", "X", 3, 2)]).X!;
    expect(counts(p)).toEqual([["big:0/1"], ["tiny:1/0"]]);
    expectCoherent(p);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test("limite de metade dos clubes: grupo de cima pequeno com vários grupos abaixo", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const p = buildPyramid([
      L("top", "Y", 20, 1), L("mid", "Y", 2, 2),
      L("g1", "Y", 10, 3), L("g2", "Y", 10, 3), L("g3", "Y", 10, 3),
    ]).Y!;
    // mid can promote at most 1 and relegate at most 1 → only g1 promotes.
    expect(counts(p)).toEqual([["top:0/1"], ["mid:1/1"], ["g1:1/0", "g2:0/0", "g3:0/0"]]);
    expectCoherent(p);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test("soma rebaixada = soma promovida em toda fronteira (vários formatos)", () => {
    const ps = buildPyramid([
      L("a1", "A", 30, 1), L("a2", "A", 18, 2), L("a3", "A", 18, 3),
      L("b1", "B", 20, 1), L("b2x", "B", 12, 2), L("b2y", "B", 14, 2), L("b3", "B", 9, 3),
      L("c1", "C", 8, 1), L("c2", "C", 16, 2), L("c3a", "C", 8, 3), L("c3b", "C", 8, 3), L("c3c", "C", 8, 3), L("c3d", "C", 8, 3),
    ]);
    for (const p of Object.values(ps)) expectCoherent(p);
    expect(Object.keys(ps).sort()).toEqual(["A", "B", "C"]);
  });
});

describe("zonesFromPyramid", () => {
  test("preserva ucl/lib e troca só prom/rel", () => {
    const existing = [
      { id: "lib", label: "Libertadores", color: "blue", from: 1, to: 6 },
      { id: "sud", label: "Sudamericana", color: "orange", from: 7, to: 12 },
      { id: "rel", label: "Relegation", color: "red", fromEnd: 4 },
    ];
    expect(zonesFromPyramid({ leagueSlug: "brazil_serie_a", promote: 0, relegate: 3 }, existing)).toEqual([
      { id: "lib", label: "Libertadores", color: "blue", from: 1, to: 6 },
      { id: "sud", label: "Sudamericana", color: "orange", from: 7, to: 12 },
      { id: "rel", label: "Relegation", color: "red", fromEnd: 3 },
    ]);
    const ucl = [{ id: "ucl", label: "Champions League", color: "blue", from: 1, to: 4 }];
    expect(zonesFromPyramid({ leagueSlug: "pl", promote: 0, relegate: 3 }, ucl)[0]).toEqual(ucl[0]!);
  });

  test("meio de pirâmide ganha prom e rel; último nível sem rel", () => {
    expect(zonesFromPyramid({ leagueSlug: "b", promote: 3, relegate: 3 })).toEqual([
      { id: "prom", label: "Promotion", color: "green", from: 1, to: 3 },
      { id: "rel", label: "Relegation", color: "red", fromEnd: 3 },
    ]);
    expect(zonesFromPyramid({ leagueSlug: "c", promote: 1, relegate: 0 }, [
      { id: "prom", label: "Promotion", color: "green", from: 1, to: 4 },
      { id: "rel", label: "Relegation", color: "red", fromEnd: 4 },
    ])).toEqual([{ id: "prom", label: "Promotion", color: "green", from: 1, to: 1 }]);
    expect(zonesFromPyramid({ leagueSlug: "g2", promote: 0, relegate: 0 })).toEqual([]);
  });
});
