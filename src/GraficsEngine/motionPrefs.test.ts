import { expect, test } from "bun:test";
import { AUTO_QUALITY, nextAutoQuality } from "@/GraficsEngine/motionPrefs";

test("automatic quality switches to light after a run of slow readings, and stays", () => {
  let s = { quality: "high" as const, slow: 0 } as { quality: "high" | "light"; slow: number };
  s = nextAutoQuality(s, 20);
  s = nextAutoQuality(s, 60);
  expect(s).toEqual({ quality: "high", slow: 0 });
  for (let i = 0; i < AUTO_QUALITY.CHECKS; i++) s = nextAutoQuality(s, 25);
  expect(s.quality).toBe("light");
  expect(nextAutoQuality(s, 60).quality).toBe("light");
  expect(nextAutoQuality({ quality: "high", slow: 2 }, 0)).toEqual({ quality: "high", slow: 0 });
});
