import { mulberry32, seedFrom } from "@/Domain/rng";

/** The painted scenes of the sacking screen (`/fired`), under `/assets/game/v1/`. */
export const FIRED_SCENES = ["fired/fired-office.webp", "fired/fired-press.webp", "fired/fired-tunnel.webp"] as const;

/** One scene drawn per sacking, fixed by its date and club: a reload shows the same one (user request 2026-11-18). */
export function firedSceneFile(date: string, clubName: string): string {
  const i = Math.floor(mulberry32(seedFrom(`fired:${date}:${clubName}`))() * FIRED_SCENES.length);
  return FIRED_SCENES[Math.min(i, FIRED_SCENES.length - 1)]!;
}
