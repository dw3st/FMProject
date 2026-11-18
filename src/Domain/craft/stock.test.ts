import { describe, expect, test } from "bun:test";
import { addComponents, addMaterials, emptyStock, hasComponents, missingComponents, takeComponents, takeMaterials, worksQuality } from "@/Domain/craft/stock";

describe("craft stock", () => {
  test("materials: add, take standard first, refuse when short", () => {
    let s = addMaterials(emptyStock(), "standard", { steel: 3 });
    s = addMaterials(s, "good", { steel: 2 });
    const r = takeMaterials(s, { steel: 4 });
    expect(r).not.toBeNull();
    expect(r!.stock.materials.steel).toEqual({ standard: 0, good: 1 });
    expect(r!.goodShare).toBeCloseTo(1 / 4);
    expect(takeMaterials(s, { steel: 6 })).toBeNull();
  });
  test("components: best quality taken first, missing counts, works quality", () => {
    let s = addComponents(emptyStock(), "beam", { excellent: 1, common: 2 });
    expect(hasComponents(s, { beam: 3 })).toBe(true);
    expect(missingComponents(s, { beam: 5, slab: 1 })).toEqual({ beam: 2, slab: 1 });
    const r = takeComponents(s, { beam: 2 })!;
    expect(r.taken).toEqual({ excellent: 1, good: 0, common: 1 });
    expect(r.stock.components.beam).toEqual({ common: 1, good: 0, excellent: 0 });
    expect(worksQuality({ excellent: 3, good: 0, common: 0 })).toBe("excellent");
    expect(worksQuality({ excellent: 0, good: 1, common: 1 })).toBe("common");
    expect(worksQuality({ excellent: 1, good: 0, common: 1 })).toBe("good");
  });
});
