import { describe, expect, test } from "bun:test";
import { holderPressure, pressureK } from "@/GameEngine/Domain/Pressure";
import { argmaxAndMargin, bucketName, entropyBits, pitchThird, situationBucket } from "@/GameEngine/Domain/DecisionTelemetry";
import { DECISION_TELEMETRY as T } from "@/GameEngine/Configs/DecisionConfig";

const free = (x: number, y: number) => ({ x, y, recoveryTime: 0 });
const yd = (m: number) => m / T.M_PER_YD;

describe("holderPressure (FM scalar)", () => {
  test("nobody within 12 m is 0", () => {
    expect(holderPressure(50, 37, [free(50 + yd(12.1), 37)])).toBe(0);
    expect(holderPressure(50, 37, [])).toBe(0);
  });
  test("one free opponent at 0.5 m: 10·(11.5)²/12, no nearest adjustment", () => {
    expect(holderPressure(50, 37, [free(50 + yd(0.5), 37)])).toBeCloseTo((10 * 11.5 ** 2) / 12, 6);
  });
  test("one free opponent at 4 m: max(P/4, (P+1)/2)", () => {
    const raw = (10 * 8 ** 2) / 12;
    expect(holderPressure(50, 37, [free(50 + yd(4), 37)])).toBeCloseTo(Math.max(raw / 4, (raw + 1) / 2), 6);
  });
  test("k by recovery: 1 free, 2 one tick, 3 more", () => {
    expect(pressureK(0)).toBe(1);
    expect(pressureK(0.2)).toBe(2);
    expect(pressureK(0.1)).toBe(2);
    expect(pressureK(0.5)).toBe(3);
    const near = (rt: number) => holderPressure(50, 37, [{ x: 50 + yd(0.5), y: 37, recoveryTime: rt }]);
    expect(near(0.5)).toBeCloseTo((10 * (11.5 / 3) ** 2) / 12, 6);
  });
  test("extra pressers count half", () => {
    const a = (10 * 11.5 ** 2) / 12;
    const b = (10 * 11 ** 2) / 12;
    const p = holderPressure(50, 37, [free(50 + yd(0.5), 37), free(50, 37 + yd(1))]);
    expect(p).toBeCloseTo(a + b - b / 2, 6);
  });
  test("closer is more pressure", () => {
    expect(holderPressure(50, 37, [free(51, 37)])).toBeGreaterThan(holderPressure(50, 37, [free(56, 37)]));
  });
});

describe("situation buckets", () => {
  test("thirds follow the attack direction", () => {
    expect(pitchThird(10, 1)).toBe(0);
    expect(pitchThird(60, 1)).toBe(1);
    expect(pitchThird(100, 1)).toBe(2);
    expect(pitchThird(10, -1)).toBe(2);
  });
  test("bucket = third·4 + pressure·2 + channel, 12 of them", () => {
    expect(situationBucket(100, 37, 1, 0)).toBe(8);
    expect(situationBucket(100, 5, 1, T.PRESSURE_HIGH)).toBe(11);
    expect(situationBucket(10, 37, 1, T.PRESSURE_HIGH)).toBe(2);
    expect(bucketName(11)).toBe("final·high·wide");
    expect(bucketName(0)).toBe("own·low·central");
  });
  test("argmax and margin", () => {
    expect(argmaxAndMargin({ a: 0.3, b: 0.5, c: 0.48 })).toEqual({ argmax: "b", margin: expect.closeTo(0.02, 9) });
  });
  test("entropy", () => {
    expect(entropyBits([5])).toBe(0);
    expect(entropyBits([1, 1])).toBeCloseTo(1, 9);
    expect(entropyBits([1, 1, 1, 1])).toBeCloseTo(2, 9);
  });
});
