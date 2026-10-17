import { mulberry32, seedFrom } from "@/Domain/rng";

/**
 * Where the sun sets over a stadium (spec 2026-10-16-match-lighting): which touchline (engine yards: "top" = y 0,
 * "bottom" = y 74) and a lean toward one end (-1 = the x 0 end, +1 = the x 115 end). Drawn from the club id:
 * the same stadium always has the same orientation. Drawing only.
 */
export interface StadiumSun {
  side: "top" | "bottom";
  lean: number;
}

export function stadiumSunSide(id: string): StadiumSun {
  const rng = mulberry32(seedFrom(`sun:${id}`));
  const side = rng() < 0.5 ? "top" : "bottom";
  const lean = Math.round((rng() * 2 - 1) * 100) / 100;
  return { side, lean };
}
