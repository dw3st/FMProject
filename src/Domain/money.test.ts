import { describe, expect, test } from "bun:test";
import {
  formatEuros,
  formatEurosDetailed,
  formatEurosText,
  formatFee,
  formatWageFull,
  formatWageShort,
  MINUS,
} from "@/Domain/money";

describe("money labels are always in euros", () => {
  test("formatEuros: compact, sign before the symbol", () => {
    expect(formatEuros(1_234_567)).toBe("€1.2M");
    expect(formatEuros(350_000)).toBe("€350K");
    expect(formatEuros(900)).toBe("€900");
    expect(formatEuros(-1_200_000)).toBe(`${MINUS}€1.2M`);
    expect(formatEuros(-4_500)).toBe(`${MINUS}€5K`);
  });

  test("the minus is the typographic one (U+2212), never placed after the symbol", () => {
    expect(MINUS).toBe("−");
    expect(formatEuros(-1_200_000).startsWith("€")).toBe(false);
  });

  test("formatFee: transfer fees", () => {
    expect(formatFee(123_400_000)).toBe("€123M");
    expect(formatFee(12_340_000)).toBe("€12.3M");
    expect(formatFee(450_000)).toBe("€450K");
    expect(formatFee(-12_340_000)).toBe(`${MINUS}€12.3M`);
  });

  test("formatEurosDetailed and formatEurosText", () => {
    expect(formatEurosDetailed(12_300_000)).toBe("€12.3M");
    expect(formatEurosDetailed(45_500)).toBe("€45.5k");
    expect(formatEurosDetailed(-45_500)).toBe(`${MINUS}€45.5k`);
    expect(formatEurosText(350_000)).toBe("€350k");
    expect(formatEurosText(-1_200_000)).toBe(`${MINUS}€1.2M`);
  });

  test("wages", () => {
    expect(formatWageShort(45_200)).toBe("45k");
    expect(formatWageFull(12_345)).toBe("€12,345");
  });

  test("no label ever carries another currency", () => {
    const labels = [
      formatEuros(5e6), formatFee(5e6), formatEurosDetailed(5e6), formatEurosText(5e6), formatWageFull(5e3),
    ];
    for (const l of labels) expect(l).not.toMatch(/[£$]/);
  });
});
