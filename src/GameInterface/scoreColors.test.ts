import { expect, test } from "bun:test";
import { attributeBand, attributeBarClass, attributeTextClass } from "@/GameInterface/scoreColors";

test("five bands on the 0..100 display value", () => {
  expect(attributeBand(39)).toBe("strongRed");
  expect(attributeBand(40)).toBe("lightRed");
  expect(attributeBand(54)).toBe("lightRed");
  expect(attributeBand(55)).toBe("yellow");
  expect(attributeBand(69)).toBe("yellow");
  expect(attributeBand(70)).toBe("lightGreen");
  expect(attributeBand(84)).toBe("lightGreen");
  expect(attributeBand(85)).toBe("strongGreen");
});

test("text and bar classes follow the band", () => {
  expect(attributeTextClass(20)).toBe("text-red-500");
  expect(attributeBarClass(90)).toBe("bg-green-600");
});
