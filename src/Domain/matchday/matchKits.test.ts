import { describe, expect, test } from "bun:test";
import { kitDistance, kitsClash, resolveMatchKits } from "@/Domain/matchday/matchKits";

describe("resolveMatchKits", () => {
  test("different shirts keep their first colours", () => {
    expect(resolveMatchKits(["#dc2626", "#ffffff"], ["#1d4ed8", "#ffffff"])).toEqual({ home: "#dc2626", away: "#1d4ed8", awayKit: "primary" });
  });

  test("similar shirts: away takes its second kit", () => {
    const k = resolveMatchKits(["#1d4ed8", "#ffffff"], ["#001f5b", "#facc15"]);
    expect(k).toEqual({ home: "#1d4ed8", away: "#facc15", awayKit: "second" });
  });

  test("second kit that also clashes is skipped", () => {
    const k = resolveMatchKits(["#ffffff", "#dc2626"], ["#f5f5f5", "#eeeeee", "#111111"]);
    expect(k.away).toBe("#111111");
    expect(k.awayKit).toBe("second");
  });

  test("both club colours clash: a contrasting change kit", () => {
    const k = resolveMatchKits(["#dc2626", "#ffffff"], ["#c81e1e", "#b91c1c"]);
    expect(k.awayKit).toBe("change");
    expect(kitsClash(k.home, k.away)).toBe(false);
  });

  test("missing colours fall back", () => {
    const k = resolveMatchKits([], []);
    expect(k.home).toBe("#2d6cdf");
    expect(kitsClash(k.home, k.away)).toBe(false);
  });

  test("distance basics", () => {
    expect(kitDistance("#000000", "#000")).toBe(0);
    expect(kitsClash("#ffffff", "#000000")).toBe(false);
    expect(kitsClash("#1d4ed8", "#001f5b")).toBe(true);
  });
});
