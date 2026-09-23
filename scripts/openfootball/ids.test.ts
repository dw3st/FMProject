import { describe, expect, test } from "bun:test";
import { clubId, gaussianFromKey, leagueSlug, normName, playerId, unitHash } from "@/../scripts/openfootball/ids";

describe("ids", () => {
  test("prefixo of_ e hífen vira underscore", () => {
    expect(leagueSlug("uruguayan-second-division")).toBe("of_uruguayan_second_division");
    expect(clubId("uy-albion")).toBe("of_uy_albion");
    expect(playerId("uy-albion-78066268")).toBe("of_uy_albion_78066268");
  });

  test("normName remove acento, caixa e pontuação", () => {
    expect(normName("José Álvarez")).toBe("jose alvarez");
    expect(normName("A. Bayındır")).toBe("a bayindir");
  });

  test("normName translitera letras sem decomposição", () => {
    expect(normName("Martin Ødegaard")).toBe("martin odegaard");
    expect(normName("Łukasz Fabiański")).toBe("lukasz fabianski");
    expect(normName("Großkreutz")).toBe("grosskreutz");
    expect(normName("Æbelø Đorđević Œuvre Þór")).toBe("aebelo dordevic oeuvre thor");
  });

  test("unitHash é determinístico e em [0,1)", () => {
    expect(unitHash("x")).toBe(unitHash("x"));
    expect(unitHash("x")).not.toBe(unitHash("y"));
    for (const k of ["a", "b", "c", "d"]) {
      expect(unitHash(k)).toBeGreaterThanOrEqual(0);
      expect(unitHash(k)).toBeLessThan(1);
    }
  });

  test("gaussianFromKey tem média ~0 e desvio ~1", () => {
    const xs = Array.from({ length: 5000 }, (_, i) => gaussianFromKey(`k${i}`));
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(sd).toBeGreaterThan(0.9);
    expect(sd).toBeLessThan(1.1);
  });

  test("unitHash(k#1) e unitHash(k#2) são aproximadamente independentes", () => {
    const n = 5000;
    const u1s = Array.from({ length: n }, (_, i) => unitHash(`k${i}#1`));
    const u2s = Array.from({ length: n }, (_, i) => unitHash(`k${i}#2`));
    const mean1 = u1s.reduce((a, b) => a + b, 0) / n;
    const mean2 = u2s.reduce((a, b) => a + b, 0) / n;
    const cov = u1s.reduce((a, u1, i) => a + (u1 - mean1) * (u2s[i]! - mean2), 0) / n;
    expect(Math.abs(cov)).toBeLessThan(0.02);
  });
});
