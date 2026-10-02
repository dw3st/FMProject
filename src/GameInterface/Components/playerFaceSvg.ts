/**
 * Builds a player's face SVG with `facesjs` (MIT, github.com/zengm-games/facesjs). Deterministic
 * per player id: `facesjs.generate` draws from `Math.random`, so it runs with a seeded RNG swapped
 * in for the duration of the (synchronous) call. The jersey uses the club colours.
 *
 * Imported lazily by `PlayerFace` so facesjs (~300 KB of SVG parts) only loads where a face shows.
 */
import { faceToSvgString, generate } from "facesjs";
import { faceRng, pickFaceRace } from "@/Domain/faces/faceProfile";

const DEFAULT_COLORS = ["#4b5563", "#e5e7eb", "#111827"];

/** Same id + nationality + colours → byte-identical SVG. */
export function playerFaceSvg(
  playerId: string,
  nationality: string | undefined | null,
  clubColors: readonly string[] | undefined,
): string {
  const rng = faceRng(playerId);
  const race = pickFaceRace(nationality, rng);
  const teamColors = [
    clubColors?.[0] ?? DEFAULT_COLORS[0]!,
    clubColors?.[1] ?? DEFAULT_COLORS[1]!,
    clubColors?.[2] ?? clubColors?.[1] ?? DEFAULT_COLORS[2]!,
  ];
  const original = Math.random;
  Math.random = rng;
  try {
    const face = generate(
      {
        teamColors,
        jersey: { id: "jersey" },
        glasses: { id: "none" },
        accessories: { id: "none" },
      },
      { gender: "male", race },
    );
    return faceToSvgString(face);
  } finally {
    Math.random = original;
  }
}
