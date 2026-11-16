import { describe, expect, test } from "bun:test";
import { REACTION_ART, REACTION_SOUNDS, pickReactionSound } from "@/GameInterface/World/reactionSounds";
import { GAME_ART_FILES } from "@/backend/staticAssets";
import { REACTIONS } from "@/Domain/rivals/taunts";

describe("reaction sounds and art", () => {
  test("every reaction has sounds and a medal, all served", () => {
    for (const id of REACTIONS) {
      expect(REACTION_SOUNDS[id].length).toBeGreaterThan(0);
      for (const p of [...REACTION_SOUNDS[id], REACTION_ART[id]]) expect(GAME_ART_FILES[p]).toBeDefined();
    }
  });

  test("a random roll picks among the takes", () => {
    expect(pickReactionSound("applause", 0)).toBe("audio/taunt-applause-1.mp3");
    expect(pickReactionSound("applause", 0.99)).toBe("audio/taunt-applause-2.mp3");
    expect(pickReactionSound("fire", 0.7)).toBe("audio/taunt-fire-1.mp3");
  });
});
