import { describe, expect, it } from "bun:test";
import { dropOnLineup } from "@/Domain/formation/lineupDrop";

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
