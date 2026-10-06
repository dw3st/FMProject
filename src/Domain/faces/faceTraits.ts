/**
 * Face traits of real players (pilot), derived offline from ESPN headshots by
 * `scripts/extractFaceTraits.ts`. Only these parameters are kept — never the photo.
 *
 * Every trait is optional: an unreliable one is simply left out and the face falls back to the
 * seeded, nationality-based draw (`faceProfile.ts`).
 */

/** 1 = lightest … 7 = darkest. */
export type SkinTone = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type HairColor = "black" | "darkBrown" | "brown" | "blond" | "red" | "grey";
export type HairLength = "bald" | "short" | "medium" | "long";
export type BeardKind = "none" | "stubble" | "full";

export interface FaceTraits {
  skin?: SkinTone;
  hairColor?: HairColor;
  hairLength?: HairLength;
  beard?: BeardKind;
}

/** Skin colours, light → dark: the facesjs race palettes in order, plus one tone between them (3). */
export const SKIN_COLORS: Record<SkinTone, string> = {
  1: "#f2d6cb",
  2: "#ddb7a0",
  3: "#cf9f83",
  4: "#bb876f",
  5: "#a67358",
  6: "#74453d",
  7: "#5c3937",
};

export const HAIR_COLORS: Record<HairColor, string> = {
  black: "#272421",
  darkBrown: "#3D2314",
  brown: "#5A3825",
  blond: "#CC9966",
  red: "#B55239",
  grey: "#9c9a98",
};

/**
 * facesjs male hair ids by length, chosen after rendering every id (`scripts/faces/renderSheet.ts`):
 * flat tops ("high", "juice"), mohawks, the bowl-shaped "afro" and the near-shaved fades
 * ("short-fade*", which read as bald) were dropped. `TEXTURED_HAIR_IDS`
 * (curly fades, curls, locs) is used for the darker skin tones (5–7); the labels carry no hair texture.
 */
export const HAIR_IDS: Record<HairLength, readonly string[]> = {
  bald: ["bald"],
  short: ["crop", "crop-fade", "crop-fade2", "short", "short2", "short3", "spike2", "messy-short", "tall-fade"],
  medium: ["messy", "shaggy1", "shaggy2", "middle-part", "parted", "hair"],
  long: ["longHair"],
};
export const TEXTURED_HAIR_IDS: Record<HairLength, readonly string[]> = {
  bald: ["bald"],
  short: ["curlyFade1", "curlyFade2", "crop-fade", "crop"],
  medium: ["curly", "curly2", "curly3", "afro2"],
  long: ["dreads", "afro2"],
};
const TEXTURED_FROM_SKIN = 5;

function hairIdsFor(length: HairLength, skin: SkinTone | undefined): readonly string[] {
  return (skin ?? 0) >= TEXTURED_FROM_SKIN ? TEXTURED_HAIR_IDS[length] : HAIR_IDS[length];
}

export const FACIAL_HAIR_IDS: Record<BeardKind, readonly string[]> = {
  none: ["none"],
  stubble: ["goatee-thin", "goatee-thin-stache", "soul-stache", "mustache-thin", "chin-strap", "chin-strapStache"],
  full: ["beard1", "beard2", "beard3", "beard4", "fullgoatee", "fullgoatee2", "loganGoatee2Stache", "honest-abe-stache"],
};

/** Picks one id from a list with the face RNG (deterministic per player). */
function pick<T>(list: readonly T[], rng: () => number): T {
  return list[Math.floor(rng() * list.length) % list.length]!;
}

/** Minimal shape of the facesjs face fields the traits override. */
export interface TraitFace {
  body: { color: string };
  hair: { id: string; color: string };
  facialHair: { id: string };
  hairBg?: { id: string };
}

/**
 * Overrides the drawn face with the real player's traits, in place. Absent traits keep the seeded
 * draw. Uses its own RNG (from the player id) so the rest of the face is unchanged.
 */
export function applyFaceTraits(face: TraitFace, traits: FaceTraits | undefined, rng: () => number): void {
  if (!traits) return;
  if (traits.skin) face.body.color = SKIN_COLORS[traits.skin];
  if (traits.hairColor) face.hair.color = HAIR_COLORS[traits.hairColor];
  if (traits.hairLength) {
    const ids = hairIdsFor(traits.hairLength, traits.skin);
    if (!ids.includes(face.hair.id)) face.hair.id = pick(ids, rng);
    // Long straight hair needs its back layer; any other length drops a random one.
    if (face.hairBg) face.hairBg.id = face.hair.id === "longHair" ? "longHair" : "none";
  }
  if (traits.beard && !FACIAL_HAIR_IDS[traits.beard].includes(face.facialHair.id)) face.facialHair.id = pick(FACIAL_HAIR_IDS[traits.beard], rng);
}
