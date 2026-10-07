import { describe, expect, test } from "bun:test";
import {
  parseClubPlayers,
  parseCompetitionClubs,
  parseHeightCm,
  parseMarketValue,
} from "@/../scripts/transfermarkt/api";

describe("parseMarketValue", () => {
  test("número passa", () => expect(parseMarketValue(35000000)).toBe(35000000));
  test("texto com m, k e bn", () => {
    expect(parseMarketValue("€45.00m")).toBe(45e6);
    expect(parseMarketValue("€500k")).toBe(5e5);
    expect(parseMarketValue("€1.20bn")).toBe(1.2e9);
  });
  test("vazio", () => {
    expect(parseMarketValue(null)).toBeNull();
    expect(parseMarketValue("-")).toBeNull();
    expect(parseMarketValue(undefined)).toBeNull();
  });
});

describe("parseHeightCm", () => {
  test("cm, metros e texto", () => {
    expect(parseHeightCm(184)).toBe(184);
    expect(parseHeightCm(1.84)).toBe(184);
    expect(parseHeightCm("1,84 m")).toBe(184);
    expect(parseHeightCm(null)).toBeNull();
  });
});

describe("parseCompetitionClubs", () => {
  test("lê os clubes", () => {
    expect(parseCompetitionClubs({ clubs: [{ id: 281, name: "Manchester City" }] })).toEqual([
      { id: "281", name: "Manchester City" },
    ]);
  });
  test("falha sem clubs ou com clube sem id/name", () => {
    expect(() => parseCompetitionClubs({})).toThrow();
    expect(() => parseCompetitionClubs({ clubs: [{ id: "1" }] })).toThrow();
    expect(() => parseCompetitionClubs({ clubs: [{ name: "x" }] })).toThrow();
  });
});

describe("parseClubPlayers", () => {
  test("lê o jogador", () => {
    const [p] = parseClubPlayers({
      players: [
        {
          id: "503883",
          name: "Senne Lammens",
          position: "Goalkeeper",
          dateOfBirth: "2002-07-07",
          age: 24,
          nationality: ["Belgium", "Spain"],
          height: 193,
          marketValue: 35000000,
        },
      ],
    });
    expect(p).toEqual({
      id: "503883",
      name: "Senne Lammens",
      position: "Goalkeeper",
      birthDate: "2002-07-07",
      age: 24,
      heightCm: 193,
      value: 35000000,
      nationality: "Belgium",
    });
  });
  test("campos ausentes viram null; nationality string", () => {
    const [p] = parseClubPlayers({ players: [{ id: 1, name: "A", nationality: "Peru" }] });
    expect(p).toMatchObject({ id: "1", position: null, birthDate: null, age: null, heightCm: null, value: null, nationality: "Peru" });
  });
  test("falha sem players ou sem id/name", () => {
    expect(() => parseClubPlayers({})).toThrow();
    expect(() => parseClubPlayers({ players: [{ name: "x" }] })).toThrow();
    expect(() => parseClubPlayers({ players: [{ id: "1" }] })).toThrow();
  });
});
