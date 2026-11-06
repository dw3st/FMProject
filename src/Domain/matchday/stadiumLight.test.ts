import { describe, expect, test } from "bun:test";
import { lightLook, tierLight } from "@/Domain/matchday/stadiumLight";

describe("stadium light (4.47.21)", () => {
  test("a higher level is stronger, whiter and less dark", () => {
    const low = lightLook({ level: 1, condition: 100 }, "s");
    const top = lightLook({ level: 10, condition: 100 }, "s");
    expect(top.gain).toBeGreaterThan(low.gain);
    expect(top.warm).toBeLessThan(low.warm);
    expect(top.dark).toBe(0);
    expect(low.off).toEqual([]);
    expect(low.grime).toBe(0);
  });
  test("worn: one dark tower and grime; broken: two", () => {
    const worn = lightLook({ level: 6, condition: 30 }, "s");
    expect(worn.off.length).toBe(1);
    expect(worn.grime).toBeGreaterThan(0);
    expect(lightLook({ level: 6, condition: 10 }, "s").off.length).toBe(2);
    expect(lightLook({ level: 6, condition: 30 }, "s").off).toEqual(worn.off);
  });
  test("AI clubs by tier", () => {
    expect(tierLight("ELITE").level).toBeGreaterThan(tierLight("LOW").level);
    expect(tierLight(undefined).condition).toBe(100);
  });
});
