import { describe, expect, test } from "bun:test";
import { compactTabsFor } from "@/GameInterface/Components/compactTabs";

describe("compactTabsFor (#138)", () => {
  test("labels when the labelled row fits, icons when it does not", () => {
    expect(compactTabsFor(900, 1000)).toBe(false);
    expect(compactTabsFor(1000, 1000)).toBe(false);
    expect(compactTabsFor(1001, 1000)).toBe(true);
  });
  test("no usable measure (hidden page, zero width) keeps the current mode", () => {
    expect(compactTabsFor(900, 0)).toBeNull();
    expect(compactTabsFor(0, 1000)).toBeNull();
    expect(compactTabsFor(Number.NaN, 1000)).toBeNull();
  });
});
