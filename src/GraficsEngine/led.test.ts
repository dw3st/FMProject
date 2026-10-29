import { describe, expect, test } from "bun:test";
import { LED_ADS, ledAdFor } from "@/GraficsEngine/pitchStyle";
import { ledLang } from "@/GraficsEngine/ledAds";

describe("LED ads", () => {
  test("stable per match, cycle and panel; neighbours differ; the ads change between cycles", () => {
    expect(ledAdFor("m1", 3, 5, "pt")).toEqual(ledAdFor("m1", 3, 5, "pt"));
    for (let k = 1; k < 40; k++) expect(ledAdFor("m1", 2, k, "pt").text).not.toBe(ledAdFor("m1", 2, k - 1, "pt").text);
    const a = Array.from({ length: 20 }, (_, k) => ledAdFor("m1", 0, k, "pt").text).join();
    const b = Array.from({ length: 20 }, (_, k) => ledAdFor("m1", 1, k, "pt").text).join();
    expect(a).not.toBe(b);
    expect(new Set(Array.from({ length: 60 }, (_, k) => ledAdFor("m2", 0, k, "pt").text)).size).toBeGreaterThan(30);
    expect(LED_ADS.length).toBeGreaterThanOrEqual(100);
  });

  test("the board follows the game language: same ad and colours, translated text", () => {
    for (let k = 0; k < 40; k++) {
      const pt = ledAdFor("m3", 1, k, "pt"), en = ledAdFor("m3", 1, k, "en");
      expect([en.bg, en.fg]).toEqual([pt.bg, pt.fg]);
      expect(en.text.length).toBeGreaterThan(0);
    }
    expect(LED_ADS.filter((ad) => ad.text.pt !== ad.text.en).length).toBeGreaterThan(90);
    expect(ledLang("pt-BR")).toBe("pt");
    expect(ledLang("en")).toBe("en");
    expect(ledLang(undefined)).toBe("en");
  });
});
