import { describe, expect, test } from "bun:test";
import { compactTabsFor } from "@/GameInterface/Components/compactTabs";

describe("compactTabsFor (#138, #139)", () => {
  test("labels when the labelled row fits, icons when it does not", () => {
    expect(compactTabsFor(900, 1000)).toBe("labels");
    expect(compactTabsFor(1000, 1000)).toBe("labels");
    expect(compactTabsFor(1001, 1000)).toBe("icons");
  });
  test("labels with the tighter spacing when only that fits (#139)", () => {
    // pt-BR, tester, 1440px frame: labelled row 917, room 890, tighter gaps save 60.
    expect(compactTabsFor(917, 890, 60)).toBe("tight");
    expect(compactTabsFor(950, 890, 60)).toBe("tight");
    expect(compactTabsFor(951, 890, 60)).toBe("icons");
    expect(compactTabsFor(880, 890, 60)).toBe("labels");
  });
  test("no usable measure (hidden page, zero width) keeps the current mode", () => {
    expect(compactTabsFor(900, 0)).toBeNull();
    expect(compactTabsFor(0, 1000)).toBeNull();
    expect(compactTabsFor(Number.NaN, 1000)).toBeNull();
  });
});
