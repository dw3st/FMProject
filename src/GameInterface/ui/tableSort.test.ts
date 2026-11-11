import { describe, expect, test } from "bun:test";
import { firstDir, sortRows } from "@/GameInterface/ui/tableSort";

describe("tableSort", () => {
  const rows = [
    { name: "Bruno", goals: 3 },
    { name: "álvaro", goals: null },
    { name: "Carlos", goals: 10 },
    { name: "Ana", goals: 3 },
  ];

  test("numbers sort by value, empty values last in both directions, ties keep their order", () => {
    expect(sortRows(rows, (r) => r.goals, "desc").map((r) => r.name)).toEqual(["Carlos", "Bruno", "Ana", "álvaro"]);
    expect(sortRows(rows, (r) => r.goals, "asc").map((r) => r.name)).toEqual(["Bruno", "Ana", "Carlos", "álvaro"]);
  });

  test("text sorts ignoring case and accents", () => {
    expect(sortRows(rows, (r) => r.name, "asc").map((r) => r.name)).toEqual(["álvaro", "Ana", "Bruno", "Carlos"]);
  });

  test("the first click: numbers high first, text A first", () => {
    expect(firstDir(rows, (r) => r.goals)).toBe("desc");
    expect(firstDir(rows, (r) => r.name)).toBe("asc");
  });
});
