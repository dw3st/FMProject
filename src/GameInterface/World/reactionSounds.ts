import { gameArtUrl, newVisualOn } from "@/Domain/art/paintedFaces";
import { readChatSound, readMatchVolume } from "@/GameInterface/artPrefs";
import type { ReactionId } from "@/types/rivalsTypes";

/**
 * Real recordings of each taunt reaction (Freesound, CC0; picked by the user, 2026-11-16; fire = fireworks since 12.8.5). With more than one, a click
 * plays one of them at random.
 */
export const REACTION_SOUNDS: Record<ReactionId, readonly string[]> = {
  applause: ["audio/taunt-applause-1.mp3", "audio/taunt-applause-2.mp3"],
  fire: ["audio/taunt-fireworks-3.mp3"],
  laugh: ["audio/taunt-laugh-1.mp3", "audio/taunt-laugh-2.mp3"],
  sorry: ["audio/taunt-sorry-1.mp3", "audio/taunt-sorry-2.mp3"],
  horn: ["audio/taunt-horn-1.mp3", "audio/taunt-horn-2.mp3"],
};

/** Painted medal of each reaction (FLUX, option A). */
export const REACTION_ART: Record<ReactionId, string> = {
  applause: "taunts/reaction-applause.png",
  fire: "taunts/reaction-fire.png",
  laugh: "taunts/reaction-laugh.png",
  sorry: "taunts/reaction-sorry.png",
  horn: "taunts/reaction-horn.png",
};

/** One of the reaction's recordings, `roll` in [0, 1). */
export function pickReactionSound(id: ReactionId, roll: number): string | null {
  const list = REACTION_SOUNDS[id];
  if (!list || list.length === 0) return null;
  return list[Math.min(list.length - 1, Math.floor(roll * list.length))]!;
}

/** Plays a reaction's sound (sent or received), at the match volume; silent when the chat sound is off. */
export function playReactionSound(id: ReactionId): void {
  if (!readChatSound()) return;
  const path = pickReactionSound(id, Math.random());
  if (!path) return;
  try {
    const audio = new Audio(gameArtUrl(path));
    audio.volume = Math.max(0, Math.min(1, 0.8 * readMatchVolume()));
    void audio.play().catch(() => { /* no gesture yet: stays silent */ });
  } catch { /* no audio: nothing to do */ }
}

/** The painted medal when the new visual is on; null keeps the drawn icon. */
export function reactionArtUrl(id: ReactionId): string | null {
  return newVisualOn() ? gameArtUrl(REACTION_ART[id]) : null;
}
