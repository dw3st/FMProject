import { describe, expect, it } from "bun:test";
import { dropOnLineup, tabUnderDrag } from "@/Domain/formation/lineupDrop";

const L = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"];

describe("dropOnLineup", () => {
  it("swaps two starters", () => {
    const r = dropOnLineup(L, { kind: "slot", index: 1 }, { kind: "slot", index: 4 })!;
    expect(r[1]).toBe("e");
    expect(r[4]).toBe("b");
    expect(r.filter((x) => x === "b")).toHaveLength(1);
  });

  it("fills an empty slot from the pitch and from the bench", () => {
    const holes = [...L];
    holes[5] = "";
    expect(dropOnLineup(holes, { kind: "slot", index: 2 }, { kind: "slot", index: 5 })![5]).toBe("c");
    const r = dropOnLineup(holes, { kind: "bench", playerId: "z" }, { kind: "slot", index: 5 })!;
    expect(r[5]).toBe("z");
  });

  it("bench onto slot displaces the starter; slot onto bench substitutes", () => {
    const a = dropOnLineup(L, { kind: "bench", playerId: "z" }, { kind: "slot", index: 3 })!;
    expect(a[3]).toBe("z");
    expect(a).not.toContain("d");
    const b = dropOnLineup(L, { kind: "slot", index: 3 }, { kind: "bench", playerId: "z" })!;
    expect(b[3]).toBe("z");
    expect(b).not.toContain("d");
  });

  it("blocks injured players and no-op drops", () => {
    const blocked = (id: string) => id === "z";
    expect(dropOnLineup(L, { kind: "bench", playerId: "z" }, { kind: "slot", index: 3 }, blocked)).toBeNull();
    expect(dropOnLineup(L, { kind: "slot", index: 3 }, { kind: "bench", playerId: "z" }, blocked)).toBeNull();
    expect(dropOnLineup(L, { kind: "slot", index: 3 }, { kind: "slot", index: 3 })).toBeNull();
    expect(dropOnLineup(L, { kind: "bench", playerId: "y" }, { kind: "bench", playerId: "z" })).toBeNull();
  });
});

describe("drag between pitch and bench (#72)", () => {
  it("a suspended or injured bench player can't be dragged onto the pitch, nor swapped in from it", () => {
    const blocked = (id: string) => id === "susp";
    expect(dropOnLineup(L, { kind: "bench", playerId: "susp" }, { kind: "slot", index: 0 }, blocked)).toBeNull();
    expect(dropOnLineup(L, { kind: "slot", index: 0 }, { kind: "bench", playerId: "susp" }, blocked)).toBeNull();
  });

  it("a starter dragged from the XI list onto another slot swaps them (same as on the pitch)", () => {
    const r = dropOnLineup(L, { kind: "slot", index: 10 }, { kind: "slot", index: 0 })!;
    expect(r[0]).toBe("k");
    expect(r[10]).toBe("a");
  });

  it("hovering a squad-panel tab opens it", () => {
    expect(tabUnderDrag("tab:bench")).toBe("bench");
    expect(tabUnderDrag("tab:starting")).toBe("starting");
    expect(tabUnderDrag("slot:3")).toBeNull();
    expect(tabUnderDrag(null)).toBeNull();
  });
});
