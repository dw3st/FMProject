import { describe, expect, test } from "bun:test";
import { fitLine, fitLogLine, matchClubs, matchPlayers } from "@/../scripts/openfootball/calibration";

describe("fitLine", () => {
  test("recupera reta exata com resíduo 0", () => {
    const f = fitLine([[50, 2], [60, 3], [70, 4], [80, 5]]);
    expect(f.a).toBeCloseTo(-3, 6);
    expect(f.b).toBeCloseTo(0.1, 6);
    expect(f.sd).toBeCloseTo(0, 6);
    expect(f.n).toBe(4);
  });
  test("com < 2 pontos distintos devolve b = 0 e a = média", () => {
    const f = fitLine([[60, 3], [60, 5]]);
    expect(f.b).toBe(0);
    expect(f.a).toBe(4);
  });
});

describe("fitLogLine", () => {
  test("ajusta ln(y) linear na reputação", () => {
    const pts: Array<[number, number]> = [[1000, Math.exp(10)], [2000, Math.exp(12)], [3000, Math.exp(14)]];
    const f = fitLogLine(pts);
    expect(f.b).toBeCloseTo(0.002, 6);
    expect(f.a).toBeCloseTo(8, 6);
  });
});

describe("matchClubs / matchPlayers", () => {
  test("casa clubes por nome normalizado (igual ou contido)", () => {
    const pairs = matchClubs(
      [{ id: "33", name: "Manchester United" }, { id: "34", name: "Newcastle" }],
      [{ id: "gb-man-utd", name: "Manchester United FC" }, { id: "gb-newcastle", name: "Newcastle United" }],
    );
    expect(pairs.get("33")).toBe("gb-man-utd");
    expect(pairs.get("34")).toBe("gb-newcastle");
  });
  test("casa jogadores por nome completo ou sobrenome único", () => {
    const m = matchPlayers(
      [{ id: "t1", name: "B. Fernandes", fullName: "Bruno Miguel Borges Fernandes" }, { id: "t2", name: "A. Onana", fullName: "André Onana" }],
      [{ id: "s1", name: "Bruno Fernandes" }, { id: "s2", name: "André Onana" }, { id: "s3", name: "Luke Shaw" }],
    );
    expect(m.get("t1")).toBe("s1");
    expect(m.get("t2")).toBe("s2");
  });
  test("sobrenome ambíguo não casa", () => {
    const m = matchPlayers(
      [{ id: "t1", name: "J. Silva", fullName: "João Silva" }],
      [{ id: "s1", name: "Pedro Silva" }, { id: "s2", name: "Marcos Silva" }],
    );
    expect(m.has("t1")).toBe(false);
  });
});
