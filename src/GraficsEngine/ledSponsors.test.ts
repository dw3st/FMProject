import { describe, expect, test } from "bun:test";
import { ledAdFor } from "@/GraficsEngine/pitchStyle";
import { hexColor, LED_SPONSORS, ledPanelFor, sponsorPlateUrl, type LedSponsor } from "@/GraficsEngine/ledSponsors";

const SPONSORS: LedSponsor[] = [
  { id: "sp_master", name: "Norvane Bank", colors: ["#FF6D00", "#111111"], weight: 3 },
  { id: "sp_kit", name: "Tarvo", colors: ["#0a0a0a", "#fff"], weight: 2 },
  { id: "sp_board", name: "Padaria Estrela", colors: ["#123456", "#ffffff"], weight: 1 },
];

describe("LED sponsors", () => {
  test("without sponsors every panel is the generic ad of before", () => {
    for (let c = 0; c < 6; c++) for (let k = 0; k < 12; k++) {
      expect(ledPanelFor("m1", c, k, "pt")).toEqual(ledAdFor("m1", c, k, "pt"));
      expect(ledPanelFor("m1", c, k, "pt", [])).toEqual(ledAdFor("m1", c, k, "pt"));
      expect(ledPanelFor("m1", c, k, "en", null)).toEqual(ledAdFor("m1", c, k, "en"));
    }
  });

  test("about 60% of the panels show a sponsor, by weight; the rest keep their generic ad", () => {
    const count: Record<string, number> = {};
    let sponsor = 0, total = 0;
    for (let c = 0; c < 400; c++) for (let k = 0; k < 8; k++) {
      const ad = ledPanelFor("match-7", c, k, "pt", SPONSORS);
      total++;
      if (ad.sponsorId) { sponsor++; count[ad.sponsorId] = (count[ad.sponsorId] ?? 0) + 1; }
      else expect(ad).toEqual(ledAdFor("match-7", c, k, "pt"));
    }
    expect(sponsor / total).toBeGreaterThan(LED_SPONSORS.SHARE - 0.05);
    expect(sponsor / total).toBeLessThan(LED_SPONSORS.SHARE + 0.05);
    expect(count.sp_master!).toBeGreaterThan(count.sp_kit!);
    expect(count.sp_kit!).toBeGreaterThan(count.sp_board!);
  });

  test("stable per match, cycle and panel; brand colours and name; neighbours never repeat a sponsor", () => {
    for (let k = 0; k < 8; k++) {
      expect(ledPanelFor("m2", 3, k, "pt", SPONSORS)).toEqual(ledPanelFor("m2", 3, k, "pt", SPONSORS));
      expect(ledPanelFor("m2", 3, k, "en", SPONSORS).sponsorId).toBe(ledPanelFor("m2", 3, k, "pt", SPONSORS).sponsorId);
    }
    let seen = 0;
    for (let c = 0; c < 60; c++) for (let k = 0; k < 8; k++) {
      const ad = ledPanelFor("m2", c, k, "pt", SPONSORS);
      if (!ad.sponsorId) continue;
      seen++;
      const s = SPONSORS.find((x) => x.id === ad.sponsorId)!;
      expect(ad.text).toBe(s.name.toUpperCase());
      expect(ad.bg).toBe(hexColor(s.colors[0], 0));
      expect(ad.fg).toBe(hexColor(s.colors[1], 0));
      if (k > 0) expect(ledPanelFor("m2", c, k - 1, "pt", SPONSORS).sponsorId).not.toBe(ad.sponsorId);
    }
    expect(seen).toBeGreaterThan(100);
  });

  test("a single sponsor still fills its share", () => {
    const one = [SPONSORS[0]!];
    const n = Array.from({ length: 200 }, (_, k) => ledPanelFor("m3", k, 1, "pt", one)).filter((a) => a.sponsorId === "sp_master").length;
    expect(n).toBeGreaterThan(90);
  });

  test("colours and plate URLs", () => {
    expect(hexColor("#FF6D00", 0)).toBe(0xff6d00);
    expect(hexColor("#fff", 0)).toBe(0xffffff);
    expect(hexColor("red", 0x123456)).toBe(0x123456);
    expect(sponsorPlateUrl("sp_norvane_bank")).toBe("/assets/game/v1/sponsors/sp_norvane_bank.webp");
    expect(sponsorPlateUrl("../secret")).toBeNull();
    expect(sponsorPlateUrl("sp_A")).toBeNull();
    expect(sponsorPlateUrl("g0")).toBeNull();
  });
});
