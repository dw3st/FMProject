import { describe, expect, test } from "bun:test";
import {
  applyClubName, applyStandingsNames, locateSquads, parseClubNameCorrections,
} from "@/../scripts/curated/clubNames";

describe("parseClubNameCorrections", () => {
  test("accepts name and an optional shortName", () => {
    expect(parseClubNameCorrections({ "126": { name: "São Paulo" }, "1062": { name: "Atlético Mineiro", shortName: "Atlético-MG" } }))
      .toEqual({ "126": { name: "São Paulo" }, "1062": { name: "Atlético Mineiro", shortName: "Atlético-MG" } });
  });
  test("rejects non-objects, unknown fields and empty or padded names", () => {
    expect(() => parseClubNameCorrections([])).toThrow();
    expect(() => parseClubNameCorrections({ a: "São Paulo" })).toThrow();
    expect(() => parseClubNameCorrections({ a: { name: "X", slug: "x" } })).toThrow(/unknown field/);
    expect(() => parseClubNameCorrections({ a: {} })).toThrow();
    expect(() => parseClubNameCorrections({ a: { name: "" } })).toThrow();
    expect(() => parseClubNameCorrections({ a: { name: " São Paulo" } })).toThrow();
    expect(() => parseClubNameCorrections({ a: { name: "X", shortName: 3 } })).toThrow();
    expect(() => parseClubNameCorrections({ a: { name: "S&atilde;o Paulo" } })).toThrow(/entity/);
  });
});

describe("locateSquads", () => {
  const files = new Map([["a/126.json", { id: "126" }], ["b/130.json", { id: "130" }]]);
  test("finds each id", () => {
    expect(locateSquads(files, ["130", "126"])).toEqual(new Map([["130", "b/130.json"], ["126", "a/126.json"]]));
  });
  test("throws on a missing or duplicated id", () => {
    expect(() => locateSquads(files, ["999"])).toThrow(/999/);
    const dup = new Map([...files, ["c/126.json", { id: "126" }]]);
    expect(() => locateSquads(dup, ["126"])).toThrow(/126/);
  });
});

describe("applyClubName", () => {
  test("renames and keeps every other field", () => {
    const squad = { id: "126", slug: "sao_paulo", name: "Sao Paulo", code: "PAU", players: [] };
    const r = applyClubName(squad, { name: "São Paulo" });
    expect(r.changed).toBe(true);
    expect(r.before).toBe("Sao Paulo");
    expect(r.squad).toEqual({ ...squad, name: "São Paulo" });
    expect(squad.name).toBe("Sao Paulo");
  });
  test("sets shortName only when given", () => {
    const r = applyClubName<{ id: string; name: string; shortName?: string }>({ id: "1", name: "Atletico-MG" }, { name: "Atlético Mineiro", shortName: "Atlético-MG" });
    expect(r.squad).toEqual({ id: "1", name: "Atlético Mineiro", shortName: "Atlético-MG" });
  });
  test("is idempotent", () => {
    const once = applyClubName({ id: "1", name: "Sao Paulo" }, { name: "São Paulo" }).squad;
    const twice = applyClubName(once, { name: "São Paulo" });
    expect(twice.changed).toBe(false);
    expect(twice.squad).toBe(once);
  });
});

describe("applyStandingsNames", () => {
  const leagues = () => [
    { slug: "brazil_serie_a", standings: [{ squadId: "126", name: "Sao Paulo" }, { squadId: "127", name: "Flamengo" }] },
    { slug: "x", standings: [{ squadId: "130", name: "Gremio", shortName: "Gremio" }] },
  ];
  test("renames the matching entries only", () => {
    const r = applyStandingsNames(leagues(), { "126": { name: "São Paulo" }, "130": { name: "Grêmio", shortName: "Grêmio" } });
    expect(r.changed).toBe(2);
    expect(r.leagues[0]!.standings).toEqual([{ squadId: "126", name: "São Paulo" }, { squadId: "127", name: "Flamengo" }]);
    expect(r.leagues[1]!.standings).toEqual([{ squadId: "130", name: "Grêmio", shortName: "Grêmio" }]);
  });
  test("does not add a shortName the entry did not have, and is idempotent", () => {
    const first = applyStandingsNames(leagues(), { "126": { name: "São Paulo", shortName: "SPFC" } });
    expect(first.leagues[0]!.standings[0]).toEqual({ squadId: "126", name: "São Paulo" });
    expect(applyStandingsNames(first.leagues, { "126": { name: "São Paulo", shortName: "SPFC" } }).changed).toBe(0);
  });
});
