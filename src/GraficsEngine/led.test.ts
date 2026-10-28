import { describe, expect, test } from "bun:test";
import { LED_ADS, ledAdFor } from "@/GraficsEngine/pitchStyle";

describe("LED ads", () => {
  test("stable per match, cycle and panel; neighbours differ; the ads change between cycles", () => {
    expect(ledAdFor("m1", 3, 5)).toEqual(ledAdFor("m1", 3, 5));
    for (let k = 1; k < 40; k++) expect(ledAdFor("m1", 2, k)).not.toBe(ledAdFor("m1", 2, k - 1));
    const a = Array.from({ length: 20 }, (_, k) => ledAdFor("m1", 0, k).text).join();
    const b = Array.from({ length: 20 }, (_, k) => ledAdFor("m1", 1, k).text).join();
    expect(a).not.toBe(b);
    expect(new Set(Array.from({ length: 60 }, (_, k) => ledAdFor("m2", 0, k).text)).size).toBeGreaterThan(30);
    expect(LED_ADS.length).toBeGreaterThanOrEqual(100);
  });
});
