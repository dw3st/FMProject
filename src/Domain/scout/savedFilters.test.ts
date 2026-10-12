import { describe, expect, test } from "bun:test";
import { addSavedFilter, parseSavedFilters, removeSavedFilter, savedFilterName } from "@/Domain/scout/savedFilters";
import {
  ATTRIBUTE_GROUPS, createDefaultScoutFilters, isAnyRange, orderedRange, parseAttrBound,
} from "@/Domain/scout/scoutFilterState";
import { ATTRIBUTE_LIST } from "@/Domain/attributes";

const F = createDefaultScoutFilters;

describe("saved scout filters", () => {
  test("no limit on how many", () => {
    let list = parseSavedFilters([]);
    for (let i = 0; i < 12; i++) list = addSavedFilter(list, `Filtro ${i}`, F());
    expect(list).toHaveLength(12);
  });

  test("the same name (any case) replaces in place", () => {
    let list = addSavedFilter([], "Laterais", F());
    list = addSavedFilter(list, "Jovens", F());
    list = addSavedFilter(list, "  LATERAIS ", { ...F(), minAge: 20 });
    expect(list.map((s) => s.name)).toEqual(["LATERAIS", "Jovens"]);
    expect(list[0]!.filters.minAge).toBe(20);
  });

  test("an empty name is ignored; names are trimmed and capped", () => {
    expect(addSavedFilter([], "   ", F())).toEqual([]);
    expect(savedFilterName("  a   b  ")).toBe("a b");
    expect(savedFilterName("x".repeat(60))).toHaveLength(40);
  });

  test("remove by name", () => {
    const list = addSavedFilter(addSavedFilter([], "A", F()), "B", F());
    expect(removeSavedFilter(list, "a").map((s) => s.name)).toEqual(["B"]);
  });

  test("parse drops malformed entries and completes old filters", () => {
    const parsed = parseSavedFilters([
      null, "x", { name: 3, filters: {} }, { name: "Ok", filters: { minAge: 18 } },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.filters.minAge).toBe(18);
    expect(parsed[0]!.filters.onlyAffordable).toBe(false);
    expect(parsed[0]!.filters.attributeRanges.speed).toEqual({ min: 0, max: 100 });
    expect(parseSavedFilters("nope")).toEqual([]);
  });
});

describe("attribute filter inputs", () => {
  test("every attribute belongs to exactly one group", () => {
    const all = ATTRIBUTE_GROUPS.flatMap((g) => g.attributes);
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual(ATTRIBUTE_LIST.map((a) => a.id).sort());
  });

  test("a typed bound: empty = no limit, clamped to 1–100, rounded", () => {
    expect(parseAttrBound("", "min")).toBe(0);
    expect(parseAttrBound(" ", "max")).toBe(100);
    expect(parseAttrBound("abc", "min")).toBe(0);
    expect(parseAttrBound("0", "min")).toBe(1);
    expect(parseAttrBound("150", "max")).toBe(100);
    expect(parseAttrBound("64.6", "min")).toBe(65);
  });

  test("ranges typed the wrong way round are swapped; 0–100 limits nothing", () => {
    expect(orderedRange(70, 40)).toEqual({ min: 40, max: 70 });
    expect(isAnyRange({ min: 0, max: 100 })).toBe(true);
    expect(isAnyRange({ min: 1, max: 100 })).toBe(false);
  });
});
