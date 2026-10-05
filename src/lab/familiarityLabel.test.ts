import { describe, expect, test } from "bun:test";
import { variantAutoLabel } from "@/lab/labNames";
import type { Variant } from "@/lab/types";

const v = (extra: Partial<Variant> = {}): Variant =>
  ({ id: "v", label: "", formation: "4-3-3", tacticalStyle: "possession", squad: { kind: "level", level: 5 }, ...extra }) as Variant;

describe("lab: familiarity in the variant label", () => {
  test("absent = plain label; set = ' · fam N' suffix", () => {
    expect(variantAutoLabel(v())).toBe("4-3-3 · Possession");
    expect(variantAutoLabel(v({ familiarity: 100 }))).toBe("4-3-3 · Possession · fam 100");
  });
});

describe("lab: morale in the variant label", () => {
  test("absent = no suffix; set = ' · mor N'", () => {
    expect(variantAutoLabel(v({ morale: 25 }))).toBe("4-3-3 · Possession · mor 25");
    expect(variantAutoLabel(v({ familiarity: 100, morale: 100 }))).toBe("4-3-3 · Possession · fam 100 · mor 100");
  });
});
