/** Per-player information drawn on the pitch markers (stamina bar, card badge). */
import { clamp } from "@/Domain/math";
import { FATIGUE_BAR } from "@/GraficsEngine/pitchStyle";
import type { CardRecord } from "@/GameEngine/types";

/** Stamina bar colour: green from 60, yellow from 40, orange below. */
export function fatigueColor(energy: number): number {
  if (energy >= FATIGUE_BAR.OK_FROM) return FATIGUE_BAR.OK;
  if (energy >= FATIGUE_BAR.MID_FROM) return FATIGUE_BAR.MID;
  return FATIGUE_BAR.LOW;
}

/** Filled share of the stamina bar (energy is 0..100). */
export function fatigueFill(energy: number): number {
  return clamp(energy / 100, 0, 1);
}

/** Players currently on a yellow (a red removes them from the pitch, so they never need a badge). */
export function bookedPlayerIds(cards: readonly CardRecord[]): Set<number> {
  const yellow = new Set<number>();
  const red = new Set<number>();
  for (const c of cards) (c.card === "red" ? red : yellow).add(c.playerId);
  for (const id of red) yellow.delete(id);
  return yellow;
}
