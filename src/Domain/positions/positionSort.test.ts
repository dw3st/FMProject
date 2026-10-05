import { describe, expect, test } from "bun:test";
import { compareSquadPositions, type PositionSortable } from "@/Domain/positions/positionSort";

const rows: PositionSortable[] = [
  { pos: "Forward", natural: "ST", name: "Kane" },
  { pos: "Defender", natural: "LB", name: "Davies" },
  { pos: "Midfielder", natural: "CAM", name: "Musiala" },
  { pos: "GK", natural: "GK", name: "Neuer" },
  { pos: "Defender", natural: "CB", name: "Upamecano" },
  { pos: "Forward", natural: "LW", name: "Díaz" },
  { pos: "Midfielder", natural: "CDM", name: "Kimmich" },
  { pos: "Defender", natural: "CB", name: "Kim" },
  { pos: "Defender", natural: "RB", name: "Laimer" },
  { pos: "GK", natural: "GK", name: "Ulreich" },
  { pos: "LB", name: "Raw detailed code" },
];

const names = (list: PositionSortable[]) => list.map((r) => r.name);

describe("compareSquadPositions (#71)", () => {
  test("groups by line, then detailed position, then name", () => {
    const sorted = [...rows].sort((a, b) => compareSquadPositions(a, b));
    expect(names(sorted)).toEqual([
      "Neuer", "Ulreich",
      "Kim", "Upamecano", "Davies", "Raw detailed code", "Laimer",
      "Kimmich", "Musiala",
      "Díaz", "Kane",
    ]);
  });

  test("desc reverses the position order, names stay alphabetical", () => {
    const sorted = [...rows].sort((a, b) => compareSquadPositions(a, b, "desc"));
    expect(names(sorted)).toEqual([
      "Kane", "Díaz",
      "Musiala", "Kimmich",
      "Laimer", "Davies", "Raw detailed code", "Kim", "Upamecano",
      "Neuer", "Ulreich",
    ]);
  });

  test("unknown positions go last", () => {
    const sorted = [{ pos: "—", name: "A" }, { pos: "GK", name: "B" }].sort((a, b) => compareSquadPositions(a, b));
    expect(names(sorted)).toEqual(["B", "A"]);
  });
});
