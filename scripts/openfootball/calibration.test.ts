import { describe, expect, test } from "bun:test";
import { collectStatPoints, fitLine, fitLogLine, fitPlayerCoeffs, matchClubs, matchPlayers } from "@/../scripts/openfootball/calibration";
import { STAT_KEYS } from "@/../scripts/openfootball/derive";

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
  test("sem pontos lança erro", () => {
    expect(() => fitLine([])).toThrow("fitLine: no points");
  });
  test("sd residual divide por n − 2", () => {
    // Reta ajustada y = 0.6 + 0.6x; soma dos quadrados dos resíduos 3.2, n = 4 → sd = sqrt(3.2 / 2)
    const f = fitLine([[0, 1], [1, 0], [2, 3], [3, 2]]);
    expect(f.sd).toBeCloseTo(Math.sqrt(3.2 / 2), 9);
    expect(fitLine([[1, 1], [2, 2]]).sd).toBe(0);
  });
});

describe("fitLogLine", () => {
  test("ajusta ln(y) linear na reputação", () => {
    const pts: Array<[number, number]> = [[1000, Math.exp(10)], [2000, Math.exp(12)], [3000, Math.exp(14)]];
    const f = fitLogLine(pts);
    expect(f.b).toBeCloseTo(0.002, 6);
    expect(f.a).toBeCloseTo(8, 6);
  });
  test("todo y ≤ 0 lança erro", () => {
    expect(() => fitLogLine([[1, 0], [2, -5]])).toThrow("fitLine: no points");
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
  test("diferença de idade > 1 rejeita o par; ≤ 1 aceita", () => {
    const seed = [{ id: "s1", name: "Bruno Fernandes", age: 30 }];
    expect(matchPlayers([{ id: "t1", name: "Bruno Fernandes", age: 33 }], seed).has("t1")).toBe(false);
    expect(matchPlayers([{ id: "t1", name: "B. Fernandes", age: 33 }], seed).has("t1")).toBe(false);
    expect(matchPlayers([{ id: "t1", name: "Bruno Fernandes", age: 31 }], seed).get("t1")).toBe("s1");
    expect(matchPlayers([{ id: "t1", name: "Bruno Fernandes" }], seed).get("t1")).toBe("s1");
  });
  test("homônimos no clube do seed não casam", () => {
    const m = matchPlayers(
      [{ id: "t1", name: "Diego Rodríguez" }],
      [{ id: "s1", name: "Diego Rodriguez" }, { id: "s2", name: "Diego Rodríguez" }],
    );
    expect(m.has("t1")).toBe(false);
  });
  test("um jogador do seed casa com no máximo um do TL; nome completo tem prioridade", () => {
    const m = matchPlayers(
      [{ id: "t1", name: "L. Suárez" }, { id: "t2", name: "Luis Suárez" }, { id: "t3", name: "Luis Suarez" }],
      [{ id: "s1", name: "Luis Suárez" }],
    );
    expect(m.get("t2")).toBe("s1");
    expect(m.has("t1")).toBe(false);
    expect(m.has("t3")).toBe(false);
    expect(new Set(m.values()).size).toBe(m.size);
  });
});

describe("collectStatPoints / fitPlayerCoeffs", () => {
  const stats = (v: number) => Object.fromEntries(STAT_KEYS.map((k) => [k, v]));
  test("agrupa pelo papel do SEED e o agrupado exclui GK", () => {
    const pts = collectStatPoints([
      { tl: { stats: stats(9) }, seed: { position: "GK", overall: 80 } },
      { tl: { stats: stats(5) }, seed: { position: "DEF", overall: 70 } },
      { tl: { stats: { ...stats(6), reflex: Number.NaN } }, seed: { position: "ATT", overall: 75 } },
    ]);
    expect(pts.byRole.GK.reflex).toEqual([[80, 9]]);
    expect(pts.byRole.Defender.passing).toEqual([[70, 5]]);
    expect(pts.byRole.Forward.passing).toEqual([[75, 6]]);
    expect(pts.byRole.Forward.reflex).toEqual([]);
    expect(pts.byRole.Midfielder.passing).toEqual([]);
    expect(pts.pooled.passing).toEqual([[70, 5], [75, 6]]);
    expect(pts.pooled.reflex).toEqual([[70, 5]]);
    const c = fitPlayerCoeffs(pts);
    expect(c.byRole.Midfielder.passing).toBeUndefined();
    expect(c.pooled.passing!.n).toBe(2);
  });
});
