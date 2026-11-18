import { describe, expect, test } from "bun:test";
import {
  TACTIC_SHORTCUTS, shortcutInstructions, shortcutLocked, shortcutReadyMinute, tacticShortcutSlots,
  savedSlotMoves, presetInUse } from "@/Domain/match/tacticShortcuts";

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

describe("savedSlotMoves", () => {
  const p = (id: number, rosterId: string, slotIndex: number, role = "CB") => ({ id, rosterId, slotIndex, role });

  test("full-backs swapped in the saved line-up swap on the pitch", () => {
    const players = [p(1, "gk", 0, "GK"), p(2, "gavi", 1, "LB"), p(3, "juk", 4, "RB"), p(4, "sub", -1)];
    expect(savedSlotMoves(players, ["gk", "juk", "", "", "gavi"], 11)).toEqual([{ kind: "swap", aId: 3, bId: 2 }]);
  });

  test("same slots: nothing", () => {
    expect(savedSlotMoves([p(1, "a", 1), p(2, "b", 2)], ["", "a", "b"], 11)).toEqual([]);
  });

  test("a saved player off the pitch or a keeper never moves", () => {
    const players = [p(1, "gk", 0, "GK"), p(2, "a", 1)];
    expect(savedSlotMoves(players, ["a", "x"], 11)).toEqual([]);
  });

  test("an empty slot is filled by a move", () => {
    expect(savedSlotMoves([p(2, "a", 1)], ["", "", "a"], 11)).toEqual([{ kind: "move", id: 2, slot: 2 }]);
  });

  test("a three-way rotation ends with everyone in place", () => {
    const players = [p(1, "a", 1), p(2, "b", 2), p(3, "c", 3)];
    const moves = savedSlotMoves(players, ["", "c", "a", "b"], 11);
    const slot = new Map(players.map((x) => [x.id, x.slotIndex]));
    for (const m of moves) {
      if (m.kind === "swap") { const a = slot.get(m.aId)!; slot.set(m.aId, slot.get(m.bId)!); slot.set(m.bId, a); }
      else slot.set(m.id, m.slot);
    }
    expect([slot.get(1), slot.get(2), slot.get(3)]).toEqual([2, 3, 1]);
  });
});

describe("presetInUse (report 40ba129f)", () => {
  test("the saved line-up the match starts with is marked", () => {
    const p = (formation: string, lineup: string[]) => ({ formation, lineup, savedOn: "2027-01-01" });
    const presets = { A: p("4-3-3", ["a", "b", "c"]), B: p("4-4-2", ["c", "b", "a"]) };
    expect(presetInUse(presets, "4-4-2", ["a", "b", "c"])).toBe("B");
    expect(presetInUse(presets, "4-3-3", ["b", "a", "c", ""])).toBe("A");
    expect(presetInUse(presets, "4-3-3", ["a", "b", "d"])).toBeNull();
    expect(presetInUse(undefined, "4-3-3", ["a"])).toBeNull();
  });
});
