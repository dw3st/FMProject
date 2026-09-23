import { describe, expect, spyOn, test } from "bun:test";
import { getScoutIndex, parseScoutQuery } from "@/backend/scoutSearch";
import { saveService, type SaveMeta } from "@/backend/SaveService";
import { createDefaultScoutFilters } from "@/GameInterface/Scout/scoutFilterState";
import type { Squad } from "@/types/playerTypes";

describe("parseScoutQuery", () => {
  test("valid input passes through unchanged", () => {
    const filters = { ...createDefaultScoutFilters(), name: "Messi", minAge: 20, maxAge: 30, onlyForSale: true };
    const q = parseScoutQuery({ filters, sortKey: "age", sortDir: "asc", page: 2, pageSize: 50 });
    expect(q.filters.name).toBe("Messi");
    expect(q.filters.minAge).toBe(20);
    expect(q.filters.maxAge).toBe(30);
    expect(q.filters.onlyForSale).toBe(true);
    expect(q.sortKey).toBe("age");
    expect(q.sortDir).toBe("asc");
    expect(q.page).toBe(2);
    expect(q.pageSize).toBe(50);
  });

  test("missing fields fall back to defaults", () => {
    const q = parseScoutQuery({});
    const defaults = createDefaultScoutFilters();
    expect(q.filters).toEqual(defaults);
    expect(q.sortKey).toBe("avg");
    expect(q.sortDir).toBe("desc");
    expect(q.page).toBe(0);
    expect(q.pageSize).toBe(100);
  });

  test("non-object body does not throw and returns defaults", () => {
    expect(() => parseScoutQuery(null)).not.toThrow();
    expect(() => parseScoutQuery(undefined)).not.toThrow();
    expect(() => parseScoutQuery("garbage")).not.toThrow();
    expect(() => parseScoutQuery(42)).not.toThrow();
    const q = parseScoutQuery("garbage");
    expect(q.filters).toEqual(createDefaultScoutFilters());
  });

  test("junk-typed filter fields fall back to defaults instead of crashing", () => {
    const defaults = createDefaultScoutFilters();
    const q = parseScoutQuery({
      filters: {
        name: 5,
        position: { evil: true },
        league: [1, 2, 3],
        nationality: null,
        minAge: "20",
        maxAge: NaN,
        minAvg: Infinity,
        maxAvg: {},
        minPriceM: undefined,
        maxPriceM: "50",
        onlyForSale: "true",
      },
    });
    expect(q.filters.name).toBe(defaults.name);
    expect(q.filters.position).toBe(defaults.position);
    expect(q.filters.league).toBe(defaults.league);
    expect(q.filters.nationality).toBe(defaults.nationality);
    expect(q.filters.minAge).toBe(defaults.minAge);
    expect(q.filters.maxAge).toBe(defaults.maxAge);
    expect(q.filters.minAvg).toBe(defaults.minAvg);
    expect(q.filters.maxAvg).toBe(defaults.maxAvg);
    expect(q.filters.minPriceM).toBe(defaults.minPriceM);
    expect(q.filters.maxPriceM).toBe(defaults.maxPriceM);
    // onlyForSale is a strict `=== true` check — a truthy string is not accepted.
    expect(q.filters.onlyForSale).toBe(false);
  });

  test("the reported crash case: filters.name as a number no longer throws", () => {
    expect(() => parseScoutQuery({ filters: { name: 5 } })).not.toThrow();
    const q = parseScoutQuery({ filters: { name: 5 } });
    expect(q.filters.name).toBe("");
  });

  test("attributeRanges: unknown attribute ids are dropped, known ids are kept", () => {
    const q = parseScoutQuery({
      filters: {
        attributeRanges: {
          speed: { min: 2, max: 8 },
          notARealAttribute: { min: 0, max: 10 },
        },
      },
    });
    expect(q.filters.attributeRanges.speed).toEqual({ min: 2, max: 8 });
    expect((q.filters.attributeRanges as Record<string, unknown>).notARealAttribute).toBeUndefined();
  });

  test("attributeRanges: non-finite / wrong-typed bounds fall back to the default for that attribute", () => {
    const defaults = createDefaultScoutFilters();
    const q = parseScoutQuery({
      filters: {
        attributeRanges: {
          passing: { min: "0", max: 10 },
          vision: { min: NaN, max: 10 },
          finishing: "not an object",
          dribbling: null,
        },
      },
    });
    expect(q.filters.attributeRanges.passing).toEqual(defaults.attributeRanges.passing);
    expect(q.filters.attributeRanges.vision).toEqual(defaults.attributeRanges.vision);
    expect(q.filters.attributeRanges.finishing).toEqual(defaults.attributeRanges.finishing);
    expect(q.filters.attributeRanges.dribbling).toEqual(defaults.attributeRanges.dribbling);
  });

  test("attributeRanges: bounds are clamped to 0..10 and swapped when min > max", () => {
    const q = parseScoutQuery({
      filters: {
        attributeRanges: {
          speed: { min: -5, max: 20 },
          tackling: { min: 8, max: 2 },
        },
      },
    });
    expect(q.filters.attributeRanges.speed).toEqual({ min: 0, max: 10 });
    expect(q.filters.attributeRanges.tackling).toEqual({ min: 2, max: 8 });
  });

  test("attributeRanges is not an object → falls back entirely to defaults", () => {
    const defaults = createDefaultScoutFilters();
    const q = parseScoutQuery({ filters: { attributeRanges: "nope" } });
    expect(q.filters.attributeRanges).toEqual(defaults.attributeRanges);
  });
});

describe("getScoutIndex — shared in-flight build", () => {
  const squad: Squad = {
    id: "s1", name: "Test FC", country: "England", players: [],
  } as unknown as Squad;

  test("two concurrent calls for the same save+key share a single getAllSquads call", async () => {
    const meta = {
      id: "save1", name: "Save", createdAt: "", updatedAt: "", leagueSlug: "l", leagueName: "L",
      clubId: "c", clubName: "C", clubColors: ["#000", "#fff"], currentDate: "2024-01-01",
    } as unknown as SaveMeta;

    const metaSpy = spyOn(saveService, "getMeta").mockResolvedValue(meta);
    let resolveSquads!: (v: Squad[]) => void;
    const squadsPromise = new Promise<Squad[]>((res) => { resolveSquads = res; });
    const squadsSpy = spyOn(saveService, "getAllSquads").mockReturnValue(squadsPromise);
    const marketSpy = spyOn(saveService, "getMarket").mockResolvedValue(null);

    try {
      const p1 = getScoutIndex("concurrent-save");
      const p2 = getScoutIndex("concurrent-save");

      // Let both calls reach the in-flight check before the build resolves.
      await Promise.resolve();
      await Promise.resolve();
      resolveSquads([squad]);

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(squadsSpy).toHaveBeenCalledTimes(1);
      expect(r1).toBe(r2);
      expect(r1?.players).toEqual([]);
    } finally {
      metaSpy.mockRestore();
      squadsSpy.mockRestore();
      marketSpy.mockRestore();
    }
  });

  test("a build failure clears the in-flight entry so a later call retries", async () => {
    const meta = {
      id: "save2", name: "Save", createdAt: "", updatedAt: "", leagueSlug: "l", leagueName: "L",
      clubId: "c", clubName: "C", clubColors: ["#000", "#fff"], currentDate: "2024-02-02",
    } as unknown as SaveMeta;

    const metaSpy = spyOn(saveService, "getMeta").mockResolvedValue(meta);
    const marketSpy = spyOn(saveService, "getMarket").mockResolvedValue(null);
    const squadsSpy = spyOn(saveService, "getAllSquads").mockRejectedValueOnce(new Error("boom"));

    try {
      await expect(getScoutIndex("failing-save")).rejects.toThrow("boom");

      squadsSpy.mockResolvedValueOnce([squad]);
      const result = await getScoutIndex("failing-save");
      expect(result?.players).toEqual([]);
      expect(squadsSpy).toHaveBeenCalledTimes(2);
    } finally {
      metaSpy.mockRestore();
      squadsSpy.mockRestore();
      marketSpy.mockRestore();
    }
  });
});
