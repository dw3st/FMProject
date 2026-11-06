import { describe, expect, test } from "bun:test";
import { stadiumArtLevel } from "@/Domain/facilities/stadiumArt";

describe("stadiumArtLevel", () => {
  test("two item levels per painting, clamped to 1..5", () => {
    expect(stadiumArtLevel([1, 2, 2])).toBe(1);
    expect(stadiumArtLevel([3, 4, 3])).toBe(2);
    expect(stadiumArtLevel([6, 5, 6])).toBe(3);
    expect(stadiumArtLevel([8, 7, 8])).toBe(4);
    expect(stadiumArtLevel([10, 9, 10])).toBe(5);
    expect(stadiumArtLevel([])).toBe(1);
  });
});
