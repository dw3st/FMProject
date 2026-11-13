import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  SPONSORS_FILE,
  SPONSOR_RULES,
  blockedBrandIn,
  buildCatalog,
  contrastRatio,
  leagueCountries,
  normalizeName,
} from "@/../scripts/sponsors/buildSponsors";
import { BRAND_BLOCKLIST } from "@/../scripts/sponsors/blocklist";
import { SPONSOR_SECTORS, SPONSOR_SIZES, type SponsorEntry } from "@/../scripts/sponsors/sectors";

const sponsors = JSON.parse(readFileSync(SPONSORS_FILE, "utf8")) as SponsorEntry[];
const countries = leagueCountries();

describe("sponsors.json", () => {
  test("has about a thousand companies", () => {
    expect(sponsors.length).toBeGreaterThanOrEqual(SPONSOR_RULES.MIN_TOTAL);
    expect(sponsors.length).toBeLessThanOrEqual(SPONSOR_RULES.MAX_TOTAL);
  });

  test("ids and names are unique", () => {
    expect(new Set(sponsors.map(s => s.id)).size).toBe(sponsors.length);
    expect(new Set(sponsors.map(s => normalizeName(s.name))).size).toBe(sponsors.length);
  });

  test("every entry has a short name, a known sector and a known size", () => {
    for (const s of sponsors) {
      expect(s.id).toMatch(/^sp_[a-z0-9_]+$/);
      expect(s.name.trim()).toBe(s.name);
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.name.length, s.name).toBeLessThanOrEqual(SPONSOR_RULES.NAME_MAX);
      expect(/[™®©]/.test(s.name), s.name).toBe(false);
      expect(SPONSOR_SECTORS as readonly string[]).toContain(s.sector);
      expect(SPONSOR_SIZES as readonly string[]).toContain(s.size);
      if (s.funny !== undefined) expect(s.funny).toBe(true);
    }
  });

  test("size shares are within 5 points of the targets", () => {
    for (const size of SPONSOR_SIZES) {
      const share = sponsors.filter(s => s.size === size).length / sponsors.length;
      expect(Math.abs(share - SPONSOR_RULES.SHARE[size]), size).toBeLessThanOrEqual(SPONSOR_RULES.SHARE_TOLERANCE);
    }
  });

  test("global has no country; national and local have a league country", () => {
    for (const s of sponsors) {
      if (s.size === "global") expect(s.country, s.name).toBeUndefined();
      else expect(countries, s.name).toContain(s.country!);
    }
  });

  test("every country of leagueData has at least 6 local and 3 national", () => {
    expect(countries.length).toBeGreaterThan(50);
    for (const country of countries) {
      const own = sponsors.filter(s => s.country === country);
      expect(own.filter(s => s.size === "local").length, country).toBeGreaterThanOrEqual(
        SPONSOR_RULES.MIN_LOCAL_PER_COUNTRY,
      );
      expect(own.filter(s => s.size === "national").length, country).toBeGreaterThanOrEqual(
        SPONSOR_RULES.MIN_NATIONAL_PER_COUNTRY,
      );
    }
  });

  test("colours are hex pairs with a contrast of 4.5 or more", () => {
    for (const s of sponsors) {
      expect(s.colors).toHaveLength(2);
      for (const c of s.colors) expect(c).toMatch(/^#[0-9A-F]{6}$/);
      expect(contrastRatio(s.colors[0], s.colors[1]), s.name).toBeGreaterThanOrEqual(SPONSOR_RULES.MIN_CONTRAST);
    }
    expect(new Set(sponsors.map(s => s.colors.join())).size).toBeGreaterThan(20);
  });

  test("no name holds a blocklisted real brand", () => {
    expect(BRAND_BLOCKLIST.length).toBeGreaterThanOrEqual(150);
    for (const s of sponsors) expect(blockedBrandIn(s.name), s.name).toBeNull();
  });

  test("funny share is between 8% and 16%", () => {
    const share = sponsors.filter(s => s.funny).length / sponsors.length;
    expect(share).toBeGreaterThanOrEqual(SPONSOR_RULES.FUNNY_MIN);
    expect(share).toBeLessThanOrEqual(SPONSOR_RULES.FUNNY_MAX);
  });

  test("the committed file is what the generator builds", () => {
    expect(sponsors).toEqual(buildCatalog(countries));
  });
});

describe("blocklist check", () => {
  test("finds a brand as a whole word, without case or accents", () => {
    expect(blockedBrandIn("Super NIKE Store")).toBe("nike");
    expect(blockedBrandIn("Banco Itaú Sul")).toBe("itau");
    expect(blockedBrandIn("Burger-King Grill")).toBe("burger king");
  });

  test("ignores a brand inside a longer word", () => {
    expect(blockedBrandIn("Kingsley Motors")).toBeNull();
    expect(blockedBrandIn("Timber Yard")).toBeNull();
  });
});
