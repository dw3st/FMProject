import { describe, expect, test } from "bun:test";
import { cupSlugOf, isCupSlug } from "@/Domain/cups/cupIds";
import { seedFrom } from "@/Domain/rng";

describe("cupIds", () => {
  test("slug from country name", () => {
    expect(cupSlugOf("England")).toBe("cup_england");
    expect(cupSlugOf("Côte d'Ivoire")).toBe("cup_cote_d_ivoire");
    expect(cupSlugOf("Saudi Arabia")).toBe("cup_saudi_arabia");
  });
  test("isCupSlug", () => {
    expect(isCupSlug("cup_england")).toBe(true);
    expect(isCupSlug("premier_league")).toBe(false);
  });
  test("seedFrom is deterministic and spreads", () => {
    expect(seedFrom("a:2026:England:1")).toBe(seedFrom("a:2026:England:1"));
    expect(seedFrom("a:2026:England:1")).not.toBe(seedFrom("a:2026:England:2"));
    expect(Number.isInteger(seedFrom("x"))).toBe(true);
  });
});
