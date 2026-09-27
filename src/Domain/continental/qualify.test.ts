import { describe, expect, test } from "bun:test";
import { pickQualifiers } from "@/Domain/continental/qualify";

describe("pickQualifiers", () => {
  test("primary first by ranking, then secondary; no club twice", () => {
    const q = pickQualifiers(
      { England: { primary: 2, secondary: 1 }, Wales: { primary: 0, secondary: 1 } },
      { England: ["a", "b", "c", "d"], Wales: ["w1"] },
    );
    expect(q.primary).toEqual(["a", "b"]);
    expect(q.secondary).toEqual(["c", "w1"]);
  });

  test("short ranking just yields fewer clubs", () => {
    const q = pickQualifiers({ X: { primary: 2, secondary: 2 } }, { X: ["x1", "x2", "x3"] });
    expect(q.primary).toEqual(["x1", "x2"]);
    expect(q.secondary).toEqual(["x3"]);
  });

  test("a country missing from the ranking map yields no clubs for it", () => {
    const q = pickQualifiers({ Y: { primary: 1, secondary: 1 } }, {});
    expect(q.primary).toEqual([]);
    expect(q.secondary).toEqual([]);
  });

  test("no club appears in both primary and secondary", () => {
    const q = pickQualifiers(
      { England: { primary: 2, secondary: 2 }, Wales: { primary: 1, secondary: 1 } },
      { England: ["a", "b", "c", "d"], Wales: ["w1", "w2"] },
    );
    const all = [...q.primary, ...q.secondary];
    expect(new Set(all).size).toBe(all.length);
  });
});
