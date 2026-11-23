import { describe, expect, test } from "bun:test";
import { componentHelp, componentUses, makeState, materialUses, maxMakeable, orderShort } from "@/Domain/craft/craftHelp";
import { COMPONENTS, CRAFT } from "@/Domain/craft/craftConfig";
import { addMaterials, emptyStock } from "@/Domain/craft/stock";

describe("craft help", () => {
  test("component uses come from the works mixes", () => {
    expect(componentUses("beam")).toEqual([
      { kind: "stand" },
      { kind: "item", item: "stadiumStructure" },
      { kind: "item", item: "gym" },
      { kind: "item", item: "pool" },
      { kind: "workshop" },
    ]);
    expect(componentUses("turfPanel")).toEqual([
      { kind: "item", item: "stadiumPitch" },
      { kind: "item", item: "trainingPitches" },
      { kind: "item", item: "academyPitches" },
    ]);
    // every component goes into at least one works
    for (const id of COMPONENTS) expect(componentUses(id).length).toBeGreaterThan(0);
  });

  test("component help reads the recipe against the stock", () => {
    const stock = addMaterials(addMaterials(emptyStock(), "standard", { steel: 4 }), "good", { steel: 1, concrete: 2 });
    const h = componentHelp("beam", stock, 1);
    expect(h.materials).toEqual([{ material: "steel", per: 3, have: 5 }, { material: "concrete", per: 1, have: 2 }]);
    expect(h.days).toBe(CRAFT.RECIPES.beam.days);
    expect(h.lot).toBe(CRAFT.LOT);
    expect(h.locked).toBe(false);
    expect(componentHelp("gymKit", stock, 2).locked).toBe(true);
    expect(componentHelp("gymKit", null, 3).materials.every((m) => m.have === 0)).toBe(true);
  });

  test("material uses list the components that take it", () => {
    expect(materialUses("grass")).toEqual([{ component: "turfPanel", per: 3 }]);
    expect(materialUses("electronics").map((u) => u.component)).toEqual(["floodlight", "gymKit", "medKit"]);
  });

  test("make state: locked, short with a cart, or the most it can make", () => {
    const none = emptyStock();
    expect(makeState("floodlight", none, 1)).toEqual({ kind: "locked", minLevel: 2 });
    expect(makeState("slab", none, 1)).toEqual({ kind: "short", short: { concrete: 4 * CRAFT.LOT } });
    const some = addMaterials(none, "standard", { steel: 7, concrete: 1 });
    expect(maxMakeable("beam", some)).toBe(1);
    expect(makeState("beam", some, 1)).toEqual({ kind: "ok", max: 1 });
    expect(orderShort("beam", 3, some)).toEqual({ steel: 2, concrete: 2 });
  });
});
