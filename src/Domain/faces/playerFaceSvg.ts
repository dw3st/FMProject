/**
 * Builds a player's face SVG with `facesjs` (Apache-2.0, github.com/zengm-games/facesjs). Deterministic
 * per player id: `facesjs.generate` draws from `Math.random`, so it runs with a seeded RNG swapped
 * in for the duration of the (synchronous) call. The jersey uses the club colours.
 *
 * Server-only in practice: `GET /api/faces/:playerId.svg` (`src/backend/faces.ts`) renders it, so
 * facesjs (~350 KB of SVG parts) never ships in a page bundle. The client only builds the URL
 * (`faceUrl.ts`).
 */
import { faceToSvgString, generate } from "facesjs";
import { faceRng, pickFaceRace } from "@/Domain/faces/faceProfile";
import { applyFaceTraits, type FaceTraits } from "@/Domain/faces/faceTraits";
import { mulberry32, seedFrom } from "@/Domain/rng";

const DEFAULT_COLORS = ["#4b5563", "#e5e7eb", "#111827"];

/**
 * Same id + nationality + colours (+ traits) → byte-identical SVG (full 400×600 facesjs portrait).
 * `traits` (real player's skin/hair, `faceTraits.ts`) override the seeded draw where present.
 */
export function playerFaceSvg(
  playerId: string,
  nationality: string | undefined | null,
  clubColors: readonly (string | undefined)[] | undefined,
  traits?: FaceTraits,
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
    applyFaceTraits(face, traits, mulberry32(seedFrom(`face-traits:${playerId}`)));
    return faceToSvgString(face);
  } finally {
    Math.random = original;
  }
}

/** Square crop of the 400×600 portrait (hair to jersey collar), ready for a round `<img>`. */
export function croppedPlayerFaceSvg(
  playerId: string,
  nationality: string | undefined | null,
  clubColors: readonly (string | undefined)[] | undefined,
  traits?: FaceTraits,
): string {
  return playerFaceSvg(playerId, nationality, clubColors, traits)
    .replace(/viewBox="[^"]*"/, 'viewBox="-80 40 560 560"')
    .replace(/preserveAspectRatio="[^"]*"/, 'preserveAspectRatio="xMidYMin slice"')
    .replace(/ width="[^"]*"/, ' width="560"')
    .replace(/ height="[^"]*"/, ' height="560"');
}
