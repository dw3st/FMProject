import { describe, expect, test } from "bun:test";
import {
  TACTIC_SHORTCUTS, shortcutInstructions, shortcutLocked, shortcutReadyMinute, tacticShortcutSlots,
} from "@/Domain/match/tacticShortcuts";

const base = { formation: "4-3-3", lineup: [], savedOn: "2027-03-01" };

describe("shortcut cooldown", () => {
  test("free before the first use", () => {
    expect(shortcutReadyMinute(null, 12, "firstHalf")).toBeNull();
    expect(shortcutLocked(null, 12, "firstHalf")).toBe(false);
  });

  test("locked for the cooldown in the same period, then free", () => {
    const last = { minute: 20, phase: "firstHalf" };
    expect(shortcutReadyMinute(last, 20, "firstHalf")).toBe(20 + TACTIC_SHORTCUTS.COOLDOWN_MIN);
    expect(shortcutLocked(last, 29, "firstHalf")).toBe(true);
    expect(shortcutLocked(last, 30, "firstHalf")).toBe(false);
  });

  test("a new period frees it, whatever the minute", () => {
    const last = { minute: 44, phase: "firstHalf" };
    expect(shortcutLocked(last, 45, "halfTime")).toBe(false);
    expect(shortcutLocked(last, 45, "secondHalf")).toBe(false);
  });
});

describe("tacticShortcutSlots", () => {
  test("always three slots, empty ones as null", () => {
    const slots = tacticShortcutSlots({ B: { ...base, name: "Posse" } });
    expect(slots.map((s) => s.key)).toEqual(["A", "B", "C"]);
    expect(slots.map((s) => s.preset?.name ?? null)).toEqual([null, "Posse", null]);
    expect(tacticShortcutSlots(undefined).every((s) => s.preset === null)).toBe(true);
  });
});

describe("shortcutInstructions", () => {
  test("eleven slots: the saved instructions, the rest cleared", () => {
    const list = shortcutInstructions({ slotInstructions: [null, { press: "more" }] });
    expect(list).toHaveLength(11);
    expect(list[1]).toEqual({ press: "more" });
    expect(list.filter(Boolean)).toHaveLength(1);
    expect(shortcutInstructions({}).every((x) => x === null)).toBe(true);
  });
});
