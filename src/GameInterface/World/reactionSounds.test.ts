import { describe, expect, test } from "bun:test";
import { REACTION_ART, REACTION_SOUNDS, REACTION_SOUND_LIMIT as L, allowReactionSound, pickReactionSound } from "@/GameInterface/World/reactionSounds";
import { GAME_ART_FILES } from "@/backend/staticAssets";
import { REACTIONS } from "@/Domain/rivals/taunts";
import { CHAT_SOUND } from "@/GameInterface/readySound";

describe("reaction sounds and art", () => {
  test("every reaction has sounds and a medal, all served", () => {
    for (const id of REACTIONS) {
      expect(REACTION_SOUNDS[id].length).toBeGreaterThan(0);
      for (const p of [...REACTION_SOUNDS[id], REACTION_ART[id]]) expect(GAME_ART_FILES[p]).toBeDefined();
    }
  });

  test("the chat message sound is served", () => {
    expect(GAME_ART_FILES[CHAT_SOUND]).toBe("audio/mpeg");
  });

  test("a random roll picks among the takes", () => {
    expect(pickReactionSound("applause", 0)).toBe("audio/taunt-applause-1.mp3");
    expect(pickReactionSound("applause", 0.99)).toBe("audio/taunt-applause-2.mp3");
    expect(pickReactionSound("fire", 0)).toBe("audio/taunt-fireworks-3.mp3");
    expect(pickReactionSound("fire", 0.99)).toBe("audio/taunt-fireworks-8.mp3");
  });

  test("sound spam: a gap between sounds, then silence after a burst", () => {
    let gate = { played: [] as number[], mutedUntil: 0 };
    const at = (t: number) => { const r = allowReactionSound(gate, t); gate = r.gate; return r.ok; };
    expect(at(0)).toBe(true);
    expect(at(L.GAP_MS - 1)).toBe(false);
    let t = 0;
    for (let i = 1; i < L.BURST; i++) { t += L.GAP_MS; expect(at(t)).toBe(true); }
    t += L.GAP_MS;
    expect(at(t)).toBe(false);
    expect(at(t + L.MUTE_MS - 1)).toBe(false);
    expect(at(t + L.MUTE_MS)).toBe(true);
  });
});
