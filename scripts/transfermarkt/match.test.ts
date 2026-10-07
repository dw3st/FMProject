import { describe, expect, test } from "bun:test";
import { matchClubs, matchPlayers } from "@/../scripts/transfermarkt/match";

const ours = [
  { squadId: "33", name: "Manchester United" },
  { squadId: "50", name: "Manchester City" },
  { squadId: "40", name: "Liverpool" },
];

describe("matchClubs", () => {
  test("exact, then override; ambiguous loose keys never match", () => {
    const tm = [
      { id: "985", name: "Manchester United" },
      { id: "281", name: "Man City" },
      { id: "31", name: "Liverpool FC" },
    ];
    const r = matchClubs(ours, tm, { "50": "281" });
    expect(r.get("33")).toBe("985");
    expect(r.get("50")).toBe("281");
    expect(r.get("40")).toBe("31");
  });
  test("a Transfermarkt club claimed twice matches nobody", () => {
    const r = matchClubs([{ squadId: "a", name: "Sporting" }, { squadId: "b", name: "Sporting" }], [{ id: "1", name: "Sporting" }], {});
    expect(r.size).toBe(0);
  });
});

describe("matchPlayers", () => {
  const world = [
    { id: "p1", name: "Bruno Fernandes", fullName: "Bruno Miguel Borges Fernandes", age: 32 },
    { id: "p2", name: "D. Dalot", fullName: "Diogo Dalot Teixeira", age: 27 },
    { id: "p3", name: "Pedro", fullName: "Pedro", age: 22 },
    { id: "p4", name: "Pedro", fullName: "Pedro", age: 30 },
  ];
  const tm = [
    { id: "t1", name: "Bruno Fernandes", age: 31 },
    { id: "t2", name: "Diogo Dalot", age: 27 },
    { id: "t3", name: "Pedro", age: 22 },
  ];
  test("name + age within one year, unique on both sides", () => {
    const r = matchPlayers(world, tm, {});
    expect(r.get("p1")).toBe("t1");
    expect(r.get("p3")).toBe("t3");
    expect(r.has("p4")).toBe(false);
  });
  test("abbreviated first name matches by surname + initial", () => {
    expect(matchPlayers(world, tm, {}).get("p2")).toBe("t2");
  });
  test("override wins", () => {
    expect(matchPlayers(world, tm, { p4: "t3" }).get("p4")).toBe("t3");
  });
  test('override "none" leaves the player unmatched and never name-matched', () => {
    const r = matchPlayers(world, tm, { p1: "none" });
    expect(r.has("p1")).toBe(false);
    expect(r.get("p2")).toBe("t2");
  });
});
