import { gameArtUrl, newVisualOn } from "@/Domain/art/paintedFaces";
import { readChatSound, readMatchVolume } from "@/GameInterface/artPrefs";
import type { ReactionId } from "@/types/rivalsTypes";

/**
 * Real recordings of each taunt reaction (Freesound, CC0; picked by the user, 2026-11-16; fire = fireworks since 12.8.5, one take since 12.29, picked by the user). With more than one, a click
 * plays one of them at random.
 */
export const REACTION_SOUNDS: Record<ReactionId, readonly string[]> = {
  applause: ["audio/taunt-applause-1.mp3", "audio/taunt-applause-2.mp3"],
  fire: ["audio/taunt-fireworks-5.mp3"],
  laugh: ["audio/taunt-laugh-1.mp3", "audio/taunt-laugh-2.mp3", "audio/taunt-laugh-3.mp3", "audio/taunt-laugh-4.mp3", "audio/taunt-laugh-5.mp3"],
  sorry: ["audio/taunt-sorry-1.mp3", "audio/taunt-sorry-2.mp3"],
  horn: ["audio/taunt-horn-1.mp3", "audio/taunt-horn-2.mp3"],
  popcorn: ["audio/taunt-popcorn-1.mp3", "audio/taunt-popcorn-2.mp3"],
  dryer: ["audio/taunt-dryer-1.mp3", "audio/taunt-dryer-2.mp3", "audio/taunt-dryer-3.mp3"],
  cry: ["audio/taunt-cry-1.mp3", "audio/taunt-cry-2.mp3"],
  chicken: ["audio/taunt-chicken-1.mp3", "audio/taunt-chicken-2.mp3", "audio/taunt-chicken-3.mp3"],
  redcard: ["audio/taunt-redcard-1.mp3"],
  vuvuzela: ["audio/taunt-vuvuzela-1.mp3"],
  drum: ["audio/taunt-drum-1.mp3"],
  trophy: ["audio/taunt-trophy-1.mp3", "audio/taunt-trophy-2.mp3", "audio/taunt-trophy-3.mp3"],
  crown: ["audio/taunt-crown-1.mp3", "audio/taunt-crown-2.mp3", "audio/taunt-crown-3.mp3"],
  wall: ["audio/taunt-wall-1.mp3", "audio/taunt-wall-2.mp3"],
  safe: ["audio/taunt-safe-1.mp3", "audio/taunt-safe-2.mp3", "audio/taunt-safe-3.mp3"],
  dice: ["audio/taunt-dice-1.mp3", "audio/taunt-dice-2.mp3", "audio/taunt-dice-3.mp3", "audio/taunt-dice-4.mp3"],
};

/** Painted medal of each reaction (FLUX, option A). */
export const REACTION_ART: Record<ReactionId, string> = {
  applause: "taunts/reaction-applause.png",
  fire: "taunts/reaction-fireworks.png",
  laugh: "taunts/reaction-laugh.png",
  sorry: "taunts/reaction-sorry.png",
  horn: "taunts/reaction-horn.png",
  popcorn: "taunts/reaction-popcorn.png",
  dryer: "taunts/reaction-dryer.png",
  cry: "taunts/reaction-cry.png",
  chicken: "taunts/reaction-chicken.png",
  redcard: "taunts/reaction-redcard.png",
  vuvuzela: "taunts/reaction-vuvuzela.png",
  drum: "taunts/reaction-drum.png",
  trophy: "taunts/reaction-trophy.png",
  crown: "taunts/reaction-crown.png",
  wall: "taunts/reaction-wall.png",
  safe: "taunts/reaction-safe.png",
  dice: "taunts/reaction-dice.png",
};

/** One of the reaction's recordings, `roll` in [0, 1). */
export function pickReactionSound(id: ReactionId, roll: number): string | null {
  const list = REACTION_SOUNDS[id];
  if (!list || list.length === 0) return null;
  return list[Math.min(list.length - 1, Math.floor(roll * list.length))]!;
}

/**
 * Against sound spam (user request, 12.9): one reaction sound at a time, at least `GAP_MS` apart, and after `BURST`
 * sounds inside `WINDOW_MS` the reactions go silent for `MUTE_MS`. Sent and received count together.
 */
export const REACTION_SOUND_LIMIT = { GAP_MS: 3000, BURST: 5, WINDOW_MS: 30_000, MUTE_MS: 60_000 } as const;

export interface ReactionSoundGate {
  /** When the recent sounds played (ms). */
  played: number[];
  mutedUntil: number;
}

/** Whether a reaction sound may play now, and the gate after it. */
export function allowReactionSound(gate: ReactionSoundGate, now: number): { ok: boolean; gate: ReactionSoundGate } {
  const L = REACTION_SOUND_LIMIT;
  if (now < gate.mutedUntil) return { ok: false, gate };
  const played = gate.played.filter((t) => now - t < L.WINDOW_MS);
  const last = played[played.length - 1];
  if (last !== undefined && now - last < L.GAP_MS) return { ok: false, gate: { ...gate, played } };
  if (played.length >= L.BURST) return { ok: false, gate: { played: [], mutedUntil: now + L.MUTE_MS } };
  return { ok: true, gate: { played: [...played, now], mutedUntil: gate.mutedUntil } };
}

let soundGate: ReactionSoundGate = { played: [], mutedUntil: 0 };
let playing: HTMLAudioElement | null = null;

/** Plays a reaction's sound (sent or received), at the match volume; silent when the chat sound is off. */
export function playReactionSound(id: ReactionId): void {
  if (!readChatSound()) return;
  if (playing && !playing.ended && !playing.paused) return;
  const allowed = allowReactionSound(soundGate, Date.now());
  soundGate = allowed.gate;
  if (!allowed.ok) return;
  const path = pickReactionSound(id, Math.random());
  if (!path) return;
  try {
    const audio = new Audio(gameArtUrl(path));
    playing = audio;
    audio.volume = Math.max(0, Math.min(1, 0.8 * readMatchVolume()));
    void audio.play().catch(() => { /* no gesture yet: stays silent */ });
  } catch { /* no audio: nothing to do */ }
}

/** The painted medal when the new visual is on; null keeps the drawn icon. */
export function reactionArtUrl(id: ReactionId): string | null {
  return newVisualOn() ? gameArtUrl(REACTION_ART[id]) : null;
}
