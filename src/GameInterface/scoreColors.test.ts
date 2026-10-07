import { expect, test } from "bun:test";
import { attributeBand, attributeBarClass, attributeTextClass } from "@/GameInterface/scoreColors";

test("five bands on the 0..100 display value", () => {
  expect(attributeBand(39)).toBe("red");
  expect(attributeBand(40)).toBe("orange");
  expect(attributeBand(54)).toBe("orange");
  expect(attributeBand(55)).toBe("yellow");
  expect(attributeBand(69)).toBe("yellow");
  expect(attributeBand(70)).toBe("green");
  expect(attributeBand(84)).toBe("green");
  expect(attributeBand(85)).toBe("blue");
});

test("text and bar classes follow the band", () => {
  expect(attributeTextClass(20)).toBe("text-red-400");
  expect(attributeBarClass(90)).toBe("bg-sky-500");
});
