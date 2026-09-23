import { describe, expect, test } from "bun:test";
import { MAX_SQUAD, MIN_BY_ROLE, MIN_SQUAD, buildNamePools, mainRole, trimAndFill, type MainRole } from "@/../scripts/openfootball/roster";
import type { SeedPlayer } from "@/../scripts/openfootball/types";

function p(id: string, position: SeedPlayer["position"], overall: number, age = 25): SeedPlayer {
  return { id, name: `Name ${id}`, position, overall, potential: overall, age, country: "ar", foot: "R", value: 0, clubId: "c" };
}

const namePool = { first: ["Juan", "Diego", "Luis"], last: ["Pérez", "Suárez", "Gómez"] };
const count = (out: SeedPlayer[], r: MainRole) => out.filter((x) => mainRole(x.position) === r).length;
const expectMinimums = (out: SeedPlayer[]) => {
  for (const r of Object.keys(MIN_BY_ROLE) as MainRole[]) expect(count(out, r)).toBeGreaterThanOrEqual(MIN_BY_ROLE[r]);
};
const FLOOR = Math.max(Object.values(MIN_BY_ROLE).reduce((a, b) => a + b, 0), MIN_SQUAD);

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
    const out = trimAndFill(players, "c", namePool, "uy");
    expect(out.length).toBe(MAX_SQUAD);
    expectMinimums(out);
    expect(out.some((x) => x.id === "g4")).toBe(true);
  });

  test("clube de 25 com 1 goleiro chega a ≥ 3 GK e ≤ 30", () => {
    const players = [
      p("g0", "GK", 60),
      ...Array.from({ length: 9 }, (_, i) => p(`d${i}`, "DEF", 60 + i)),
      ...Array.from({ length: 9 }, (_, i) => p(`m${i}`, "MID", 60 + i)),
      ...Array.from({ length: 6 }, (_, i) => p(`a${i}`, "ATT", 60 + i)),
    ];
    const out = trimAndFill(players, "c", namePool, "uy");
    expect(count(out, "GK")).toBeGreaterThanOrEqual(3);
    expect(out.length).toBeLessThanOrEqual(MAX_SQUAD);
    expect(out.length).toBe(27); // 25 reais + 2 goleiros jovens
    expectMinimums(out);
  });

  test("clube de 7 atinge todos os mínimos, determinístico", () => {
    const players = [p("g0", "GK", 60), p("d0", "DEF", 62), p("m0", "MID", 64), p("a0", "ATT", 66), p("d1", "DEF", 58), p("m1", "MID", 61), p("a1", "ATT", 59)];
    const a = trimAndFill(players, "c", namePool, "uy");
    expect(a).toEqual(trimAndFill(players, "c", namePool, "uy"));
    expectMinimums(a);
    expect(a.length).toBe(FLOOR);
    const youth = a.filter((x) => x.id.startsWith("c-youth-"));
    expect(youth.length).toBe(FLOOR - players.length);
    for (const y of youth) {
      expect(y.age).toBeGreaterThanOrEqual(17);
      expect(y.age).toBeLessThanOrEqual(19);
      expect(y.name.split(" ").length).toBeGreaterThanOrEqual(2);
    }
  });

  test("jogador com mais de 45 anos é descartado (45 fica)", () => {
    const players = [p("old", "GK", 90, 46), p("vet", "GK", 80, 45), p("g1", "GK", 60)];
    const out = trimAndFill(players, "c", namePool, "uy");
    expect(out.some((x) => x.id === "old")).toBe(false);
    expect(out.some((x) => x.id === "vet")).toBe(true);
    expectMinimums(out);
  });

  test("jovens recebem o país do clube", () => {
    const out = trimAndFill([p("g0", "GK", 60)], "c", namePool, "uy");
    const youth = out.filter((x) => x.id.startsWith("c-youth-"));
    expect(youth.length).toBeGreaterThan(0);
    for (const y of youth) expect(y.country).toBe("uy");
  });

  test("tamanho sempre entre o piso e 30", () => {
    for (const n of [0, 1, 18, 21, 40]) {
      const players = Array.from({ length: n }, (_, i) => p(`x${i}`, (["GK", "DEF", "MID", "ATT"] as const)[i % 4]!, 50 + (i % 30)));
      const out = trimAndFill(players, "c", namePool, "uy");
      expect(out.length).toBeGreaterThanOrEqual(FLOOR);
      expect(out.length).toBeLessThanOrEqual(MAX_SQUAD);
      expectMinimums(out);
    }
  });
});

describe("buildNamePools", () => {
  test("descarta tokens sujos: parênteses, iniciais, marcas combinantes", () => {
    const mk = (name: string): SeedPlayer => ({ ...p("x", "MID", 60), name, country: "ua" });
    const pools = buildNamePools([
      mk("Oleh Ivanov (Karpenko)"),
      mk("M. Shevchenko"),
      mk("Andriy O'Neil-Kovač"),
      mk("Emre Özdemi̇r"), // Turkish i + combining dot above: NFC cannot compose it
    ]);
    const ua = pools.get("ua")!;
    expect(ua.first).toEqual(["Andriy", "Oleh"]); // "Emre" has one clean token only → skipped
    expect(ua.last).toEqual(["Ivanov", "O'Neil-Kovač"]);
    for (const t of [...ua.first, ...ua.last]) expect(t).toMatch(/^\p{L}[\p{L}'’-]*$/u);
  });
});
