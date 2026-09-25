import { describe, expect, test } from "bun:test";
import {
  collectStatPoints, fitLine, fitLogLine, fitPlane, fitPlayerCoeffs, matchClubs, matchPlayers, matchPlayersByTokenSubset,
} from "@/../scripts/openfootball/calibration";
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

describe("fitPlane", () => {
  test("recupera plano exato com resíduo 0", () => {
    const y = (x1: number, x2: number) => 1.5 + 0.04 * x1 - 0.3 * x2;
    const xs: Array<[number, number]> = [[60, 5], [70, 6], [65, 9], [80, 7], [55, 8]];
    const f = fitPlane(xs.map(([a, b]) => [a, b, y(a, b)]));
    expect(f.a).toBeCloseTo(1.5, 9);
    expect(f.b).toBeCloseTo(0.04, 9);
    expect(f.c).toBeCloseTo(-0.3, 9);
    expect(f.sd).toBeCloseTo(0, 9);
    expect(f.n).toBe(5);
  });
  test("sd residual divide por n − 3", () => {
    // Ajuste y = −0,25 + 1,5·x1 + 1,5·x2 deixa resíduos ±0,25 → SQR = 0,25, n − 3 = 1
    const f = fitPlane([[0, 0, 0], [1, 0, 1], [0, 1, 1], [1, 1, 3]]);
    expect(f.sd).toBeCloseTo(0.5, 9);
  });
  test("< 3 pontos ou matriz singular lança erro", () => {
    expect(() => fitPlane([])).toThrow("fitPlane: need at least 3 points");
    expect(() => fitPlane([[1, 1, 1], [2, 2, 2]])).toThrow("fitPlane: need at least 3 points");
    expect(() => fitPlane([[1, 5, 1], [2, 5, 2], [3, 5, 3]])).toThrow("fitPlane: singular matrix");
    expect(() => fitPlane([[1, 2, 1], [2, 4, 2], [3, 6, 4]])).toThrow("fitPlane: singular matrix");
    expect(() => fitPlane([[1, 1, 1], [1, 2, 2], [1, 3, 3]])).toThrow("fitPlane: singular matrix");
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

describe("matchPlayersByTokenSubset", () => {
  test("Kane case: seed name tokens ⊆ tl name∪fullName, ages within 1", () => {
    const tl = [{ id: "t1", name: "H. Kane", fullName: "Harry Edward Kane", age: 32 }];
    const seed = [{ id: "s1", name: "Harry Kane", age: 32 }];
    const m = matchPlayersByTokenSubset(tl, seed, new Map());
    expect(m.get("t1")).toBe("s1");
  });

  test("Bellingham case", () => {
    const tl = [{ id: "t1", name: "J. Bellingham", fullName: "Jude Victor William Bellingham", age: 22 }];
    const seed = [{ id: "s1", name: "Jude Bellingham", age: 21 }];
    const m = matchPlayersByTokenSubset(tl, seed, new Map());
    expect(m.get("t1")).toBe("s1");
  });

  test("já pareados (dos dois lados) nunca entram como candidatos", () => {
    const tl = [
      { id: "t1", name: "H. Kane", fullName: "Harry Edward Kane", age: 32 },
      { id: "t2", name: "Someone Else", age: 30 },
    ];
    const seed = [
      { id: "s1", name: "Harry Kane", age: 32 },
      { id: "s2", name: "Another Player", age: 30 },
    ];
    // t1 already paired to a different seed player, s1 already paired to a different tl player —
    // neither should reappear as a candidate even though t1/s1 would otherwise satisfy the rule.
    const m = matchPlayersByTokenSubset(tl, seed, new Map([["t1", "s2"], ["t2", "s1"]]));
    expect(m.size).toBe(0);
  });

  test("nome do seed com menos de 2 tokens nunca é elegível", () => {
    const tl = [{ id: "t1", name: "Neymar", fullName: "Neymar da Silva Santos Junior", age: 32 }];
    const seed = [{ id: "s1", name: "Neymar", age: 32 }];
    const m = matchPlayersByTokenSubset(tl, seed, new Map());
    expect(m.size).toBe(0);
  });

  test("diferença de idade maior que 1 rejeita", () => {
    const tl = [{ id: "t1", name: "H. Kane", fullName: "Harry Edward Kane", age: 34 }];
    const seed = [{ id: "s1", name: "Harry Kane", age: 32 }];
    const m = matchPlayersByTokenSubset(tl, seed, new Map());
    expect(m.size).toBe(0);
  });

  test("ambíguo: dois candidatos tl para o mesmo jogador do seed não casam", () => {
    const tl = [
      { id: "t1", name: "M. Silva", fullName: "Marco Paulo Silva", age: 25 },
      { id: "t2", name: "M. Silva", fullName: "Marco Andre Silva", age: 25 },
    ];
    const seed = [{ id: "s1", name: "Marco Silva", age: 25 }];
    const m = matchPlayersByTokenSubset(tl, seed, new Map());
    expect(m.size).toBe(0);
  });

  test("bidirecional: um único candidato tl compartilhado por dois jogadores do seed não casa nenhum", () => {
    const tl = [{ id: "t1", name: "M. Ferreira", fullName: "Marco Mateus Ferreira", age: 25 }];
    const seed = [
      { id: "s1", name: "Marco Ferreira", age: 25 },
      { id: "s2", name: "Mateus Ferreira", age: 25 },
    ];
    const m = matchPlayersByTokenSubset(tl, seed, new Map());
    expect(m.size).toBe(0);
  });

  test("devolve só os pares NOVOS — não inclui o que já veio em `paired`", () => {
    const tl = [{ id: "t1", name: "H. Kane", fullName: "Harry Edward Kane", age: 32 }];
    const seed = [{ id: "s1", name: "Harry Kane", age: 32 }];
    const m = matchPlayersByTokenSubset(tl, seed, new Map([["t9", "s9"]]));
    expect([...m.entries()]).toEqual([["t1", "s1"]]);
  });
});

describe("collectStatPoints / fitPlayerCoeffs", () => {
  const stats = (v: number) => Object.fromEntries(STAT_KEYS.map((k) => [k, v]));
  test("agrupa pelo papel do SEED e o agrupado exclui GK", () => {
    const pts = collectStatPoints([
      { tl: { stats: stats(9) }, seed: { position: "GK", overall: 80 }, leagueRep: 9.5 },
      { tl: { stats: stats(5) }, seed: { position: "DEF", overall: 70 }, leagueRep: 7.8 },
      { tl: { stats: { ...stats(6), reflex: Number.NaN } }, seed: { position: "ATT", overall: 75 }, leagueRep: 5.8 },
      { tl: { stats: stats(4) }, seed: { position: "DEF", overall: 60 }, leagueRep: 9.5 },
    ]);
    expect(pts.byRole.GK.reflex).toEqual([[80, 9.5, 9]]);
    expect(pts.byRole.Defender.passing).toEqual([[70, 7.8, 5], [60, 9.5, 4]]);
    expect(pts.byRole.Forward.passing).toEqual([[75, 5.8, 6]]);
    expect(pts.byRole.Forward.reflex).toEqual([]);
    expect(pts.byRole.Midfielder.passing).toEqual([]);
    expect(pts.pooled.passing).toEqual([[70, 7.8, 5], [75, 5.8, 6], [60, 9.5, 4]]);
    expect(pts.pooled.reflex).toEqual([[70, 7.8, 5], [60, 9.5, 4]]);
    const c = fitPlayerCoeffs(pts);
    expect(c.byRole.Midfielder.passing).toBeUndefined();
    expect(c.byRole.Defender.passing).toBeUndefined();
    expect(c.pooled.passing!.n).toBe(3);
    expect(Number.isFinite(c.pooled.passing!.c)).toBe(true);
    expect(c.pooled.reflex).toBeUndefined();
    expect(c.repMin).toBe(5.8);
    expect(c.repMax).toBe(9.5);
  });
});
