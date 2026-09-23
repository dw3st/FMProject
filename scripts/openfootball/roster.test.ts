import { describe, expect, test } from "bun:test";
import { MAX_SQUAD, MIN_SQUAD, mainRole, trimAndFill } from "@/../scripts/openfootball/roster";
import type { SeedPlayer } from "@/../scripts/openfootball/types";

function p(id: string, position: SeedPlayer["position"], overall: number): SeedPlayer {
  return { id, name: `Name ${id}`, position, overall, potential: overall, age: 25, country: "uy", foot: "R", value: 0, clubId: "c" };
}

const namePool = { first: ["Juan", "Diego", "Luis"], last: ["Pérez", "Suárez", "Gómez"] };

describe("mainRole", () => {
  test("mapeia posições do seed", () => {
    expect(mainRole("GK")).toBe("GK");
    expect(mainRole("DEF")).toBe("Defender");
    expect(mainRole("MID")).toBe("Midfielder");
    expect(mainRole("ATT")).toBe("Forward");
  });
});

describe("trimAndFill", () => {
  test("corta em 30 garantindo os mínimos por setor", () => {
    const players = [
      ...Array.from({ length: 5 }, (_, i) => p(`g${i}`, "GK", 50 + i)),
      ...Array.from({ length: 15 }, (_, i) => p(`d${i}`, "DEF", 60 + i)),
      ...Array.from({ length: 15 }, (_, i) => p(`m${i}`, "MID", 70 + i)),
      ...Array.from({ length: 10 }, (_, i) => p(`a${i}`, "ATT", 40 + i)),
    ];
    const out = trimAndFill(players, "c", namePool);
    expect(out.length).toBe(MAX_SQUAD);
    const count = (r: string) => out.filter((x) => mainRole(x.position) === r).length;
    expect(count("GK")).toBeGreaterThanOrEqual(3);
    expect(count("Defender")).toBeGreaterThanOrEqual(7);
    expect(count("Midfielder")).toBeGreaterThanOrEqual(7);
    expect(count("Forward")).toBeGreaterThanOrEqual(4);
    // O melhor goleiro está dentro
    expect(out.some((x) => x.id === "g4")).toBe(true);
  });

  test("clube pequeno é completado até 18 com jovens determinísticos", () => {
    const players = [p("g0", "GK", 60), p("d0", "DEF", 62), p("m0", "MID", 64), p("a0", "ATT", 66), p("d1", "DEF", 58), p("m1", "MID", 61), p("a1", "ATT", 59)];
    const a = trimAndFill(players, "c", namePool);
    const b = trimAndFill(players, "c", namePool);
    expect(a.length).toBe(MIN_SQUAD);
    expect(a).toEqual(b);
    const youth = a.filter((x) => x.id.startsWith("c-youth-"));
    expect(youth.length).toBe(MIN_SQUAD - players.length);
    for (const y of youth) {
      expect(y.age).toBeGreaterThanOrEqual(17);
      expect(y.age).toBeLessThanOrEqual(19);
      expect(y.name.split(" ").length).toBeGreaterThanOrEqual(2);
    }
    // Setores abaixo do mínimo recebem jovens primeiro: GK chega a 3
    expect(a.filter((x) => x.position === "GK").length).toBeGreaterThanOrEqual(3);
  });
});
