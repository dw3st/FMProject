// recycle.test.ts
import { describe, expect, test } from "bun:test";
import { shareOf } from "@/Domain/craft/recycle";

describe("recycle", () => {
  test("share of a recipe, rounded down, at least zero", () => {
    expect(shareOf({ beam: 10, slab: 3 }, 0.4)).toEqual({ beam: 4, slab: 1 });
    expect(shareOf({ beam: 1 }, 0.25)).toEqual({});
  });
});
