import { mulberry32, seedFrom } from "@/Domain/rng";
import type { MatchWeather } from "@/Domain/matchday/matchConditions";

/**
 * Rain drops and snow flakes over the live pitch (spec 2026-10-16-match-lighting). Positions in canvas fractions
 * (0..1), speeds in fractions per second, wrapped around. Pure and seeded; the renderer moves them on the effects
 * clock (frozen while paused and with the tab hidden).
 */
export interface Particle {
  kind: "drop" | "flake";
  x0: number; y0: number;
  vx: number; vy: number;
  /** Drop: streak length (fraction of the height). Flake: radius in px. */
  size: number;
  /** Flake sway phase. */
  phase: number;
}

const wrap = (v: number) => ((v % 1) + 1) % 1;

export function weatherParticles(weather: MatchWeather | "wind_rain", seed: string): Particle[] {
  const rng = mulberry32(seedFrom(`particles:${seed}:${weather}`));
  if (weather === "rain" || weather === "wind_rain") {
    const lean = weather === "wind_rain" ? 0.6 : 0.25;
    return Array.from({ length: 150 }, () => ({
      kind: "drop" as const, x0: rng(), y0: rng(), vx: lean * (1.4 + rng() * 0.4), vy: 1.4 + rng() * 0.4,
      size: 0.02 + rng() * 0.015, phase: 0,
    }));
  }
  if (weather === "snow") {
    return Array.from({ length: 100 }, () => ({
      kind: "flake" as const, x0: rng(), y0: rng(), vx: 0.01, vy: 0.06 + rng() * 0.05,
      size: 1.2 + rng() * 1.6, phase: rng() * Math.PI * 2,
    }));
  }
  return [];
}

export function particleAt(p: Particle, t: number): { x: number; y: number } {
  const sway = p.kind === "flake" ? Math.sin(t * 1.3 + p.phase) * 0.01 : 0;
  return { x: wrap(p.x0 + p.vx * t + sway), y: wrap(p.y0 + p.vy * t) };
}
