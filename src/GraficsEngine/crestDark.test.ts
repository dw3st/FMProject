import { expect, test } from "bun:test";
import { visibleLuminance } from "@/GraficsEngine/playerFaces";

const px = (r: number, g: number, b: number, a: number, n: number) => Array.from({ length: n }, () => [r, g, b, a]).flat();

test("luminance counts only visible pixels", () => {
  expect(visibleLuminance(px(0, 0, 0, 0, 100))).toBeNull();
  expect(visibleLuminance([...px(20, 20, 20, 255, 50), ...px(255, 255, 255, 0, 50)])!).toBeLessThan(0.1);
  expect(visibleLuminance(px(240, 240, 240, 255, 50))!).toBeGreaterThan(0.9);
});
