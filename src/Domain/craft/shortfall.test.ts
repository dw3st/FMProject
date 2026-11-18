import { describe, expect, test } from "bun:test";
import { craftableMissing, materialsNeeded, materialsShort } from "@/Domain/craft/shortfall";
import { addMaterials, emptyStock } from "@/Domain/craft/stock";

describe("shortfall", () => {
  test("locked components stay out of what the workshop can make", () => {
    expect(craftableMissing({ beam: 2, gymKit: 3 }, 1)).toEqual({ beam: 2 });
    expect(craftableMissing({ beam: 2, gymKit: 3 }, 3)).toEqual({ beam: 2, gymKit: 3 });
  });

  test("materials short = recipes minus the stock of both suppliers", () => {
    let stock = addMaterials(emptyStock(), "standard", { steel: 4 });
    stock = addMaterials(stock, "good", { steel: 1, concrete: 5 });
    // 2 beams = 6 steel + 2 concrete; 1 slab = 4 concrete.
    expect(materialsShort({ beam: 2, slab: 1 }, stock)).toEqual({ steel: 1, concrete: 1 });
  });

  test("materials needed sums the recipes", () => {
    expect(materialsNeeded({ beam: 2, slab: 1 })).toEqual({ steel: 6, concrete: 6 });
  });

  test("nothing short when the stock covers it", () => {
    const stock = addMaterials(emptyStock(), "standard", { grass: 30 });
    expect(materialsShort({ turfPanel: 3 }, stock)).toEqual({});
  });
});
