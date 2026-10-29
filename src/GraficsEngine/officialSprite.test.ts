import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assistantSideStep, OFFICIAL_SPRITE, officialPose, officialTints, type OfficialKind } from "@/GraficsEngine/officialSprite";
import { newMotion, SPRITE_LAYERS } from "@/GraficsEngine/playerSprite";

const atlas = JSON.parse(readFileSync(join(import.meta.dir, "..", "example_data", "assets", "officials", "officials-atlas.json"), "utf8")) as { frames: Record<string, unknown> };
const has = (base: string) => SPRITE_LAYERS.every((l) => `${base}-${l}.png` in atlas.frames);

describe("officialPose", () => {
  const idle = newMotion(0, 0);
  const run = { ...newMotion(0, 0), gait: "run" as const, phase: 0.3 };
  const walk = { ...newMotion(0, 0), gait: "walk" as const, phase: 0.9 };

  test("every pose exists in the atlas", () => {
    const kinds: OfficialKind[] = ["referee", "assistant", "fourth", "coach", "medic", "photographer"];
    for (const k of kinds) for (const m of [idle, run, walk]) for (const s of [{}, { card: true }, { flagUp: true }, { board: true }, { point: true }, { kneel: true }, { sideStep: true }, { shoot: true }]) {
      expect(has(officialPose(k, m, s))).toBe(true);
    }
  });

  test("overrides and gaits", () => {
    expect(officialPose("referee", run, { card: true })).toBe("referee-card");
    expect(officialPose("assistant", idle, { flagUp: true })).toBe("assistant-flag-up");
    expect(officialPose("assistant", walk, { sideStep: true })).toBe("assistant-side-08");
    expect(officialPose("referee", run)).toBe("referee-run-03");
    expect(officialPose("medic", walk)).toBe("medic-run-08");
    expect(officialPose("medic", idle, { kneel: true })).toBe("medic-kneel");
    expect(officialPose("fourth", idle, { board: true })).toBe("referee-board");
    expect(officialPose("coach", run, { point: true })).toBe("coach-point");
  });
});

test("assistantSideStep has hysteresis", () => {
  expect(assistantSideStep(true, OFFICIAL_SPRITE.AR_RUN_UP - 0.1)).toBe(true);
  expect(assistantSideStep(true, OFFICIAL_SPRITE.AR_RUN_UP + 0.1)).toBe(false);
  expect(assistantSideStep(false, OFFICIAL_SPRITE.AR_RUN_UP - 0.1)).toBe(false);
  expect(assistantSideStep(false, OFFICIAL_SPRITE.AR_RUN_DOWN - 0.1)).toBe(true);
});

test("tints are stable and the coach wears the club colour", () => {
  expect(officialTints("referee", "a")).toEqual(officialTints("referee", "a"));
  expect(officialTints("coach", "c", 0xff0000).shirt).toBe(0xff0000);
  expect(officialTints("medic", "m").shirt).toBe(OFFICIAL_SPRITE.MEDIC.shirt);
});
