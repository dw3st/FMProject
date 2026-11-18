import { describe, expect, test } from "bun:test";
import { componentValue, mixFor, recipeFor, recipeValue } from "@/Domain/craft/recipes";

const R = 100_000_000;
describe("craft recipes", () => {
  test("component value is the sum of its materials at the base price", () => {
    // beam = 3 steel + 1 concrete
    expect(componentValue("beam", R)).toBe(Math.round(R * (3 * 0.00008 + 0.00003)));
  });
  test("mix by works", () => {
    expect(mixFor({ kind: "repair", item: "gym" })).toEqual({ gymKit: 2, beam: 1 });
    expect(mixFor({ kind: "stand" })).toEqual({ slab: 3, beam: 2, seat: 4 });
    expect(mixFor({ kind: "comfort" })).toEqual({ seat: 3, furniture: 1 });
    const training = mixFor({ kind: "training" });
    expect(training.turfPanel).toBe(1);
    expect(training.medKit).toBe(2);
  });
  test("recipe value is close to the cost and never empty", () => {
    const cost = 600_000;
    const r = recipeFor({ kind: "repair", item: "gym" }, cost, R);
    expect(r.gymKit).toBeGreaterThan(0);
    expect(Math.abs(recipeValue(r, R) - cost) / cost).toBeLessThan(0.2);
    const tiny = recipeFor({ kind: "repair", item: "gym" }, 1, R);
    expect(tiny).toEqual({ gymKit: 2, beam: 1 });
  });
});
