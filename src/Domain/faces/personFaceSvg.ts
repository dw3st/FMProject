/**
 * Faces of the coaching staff and the managers (Etapa 31b), same `facesjs` style as the players
 * (`playerFaceSvg.ts`) but grown-ups: wrinkles, grey and thinning hair, glasses more often with
 * age, and a plain buttoned shirt (`baseball`, the most neutral facesjs top) in the club colours
 * instead of a match jersey.
 *
 * Server-only: `GET /api/faces/person/:id.svg` and `GET /api/faces/manager/avatar.svg`
 * (`src/backend/faces.ts`) render it; the client only builds the URL (`faceUrl.ts`).
 */
import { faceToSvgString, generate } from "facesjs";
import { faceRng, pickFaceRace } from "@/Domain/faces/faceProfile";
import { applyFaceTraits, HAIR_COLORS, type FaceTraits } from "@/Domain/faces/faceTraits";
import type { ManagerFace } from "@/Domain/faces/managerFace";
import { mulberry32, seedFrom } from "@/Domain/rng";

const NEUTRAL_COLORS = ["#374151", "#e5e7eb", "#111827"];
const SHIRT = "baseball";
const GLASSES = ["glasses2-black", "glasses1-secondary"] as const;
const EYE_LINES = ["line1", "line2", "line3", "line4", "line5", "line6"];
const SMILE_LINES = ["line1", "line2", "line3", "line4"];
const FOREHEAD_LINES = ["forehead1", "forehead2", "forehead3", "forehead4", "forehead5"];
const LONG_HAIR = new Set(["longHair", "dreads", "afro", "afro2", "emo", "shaggy1", "shaggy2", "high", "juice"]);
const GROWN_UP_SHORT = ["crop", "short", "short2", "short3", "parted", "middle-part", "crop-fade"];
const THINNING = ["bald", "short-bald"];
const GREY = HAIR_COLORS.grey;
const SILVER = "#c9c6c1";

export interface PersonFaceOptions {
  /** Age in years; absent = drawn from the id (38–62). */
  age?: number | null;
  /** The human manager's saved avatar: seed + picked traits replace the id-based draw. */
  custom?: ManagerFace;
}

interface AgeFace {
  hair: { id: string; color: string };
  hairBg?: { id: string };
  eyeLine: { id: string };
  smileLine: { id: string; size: number };
  miscLine: { id: string };
  glasses: { id: string };
}

function pick<T>(list: readonly T[], rng: () => number): T {
  return list[Math.floor(rng() * list.length) % list.length]!;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Ages the drawn face in place (lines, grey and thinning hair, glasses). Pure given the RNG. */
export function ageFace(face: AgeFace, age: number, rng: () => number): void {
  const a = Math.max(18, Math.min(90, age));
  if (rng() < clamp01((a - 30) / 25)) face.eyeLine.id = pick(EYE_LINES, rng);
  if (rng() < clamp01((a - 35) / 30)) face.smileLine = { id: pick(SMILE_LINES, rng), size: 1 };
  face.miscLine.id = rng() < clamp01((a - 38) / 30) ? pick(FOREHEAD_LINES, rng) : "none";
  if (a > 42 && LONG_HAIR.has(face.hair.id)) face.hair.id = pick(GROWN_UP_SHORT, rng);
  if (rng() < clamp01((a - 38) / 40) * 0.55) face.hair.id = pick(THINNING, rng);
  const grey = rng();
  if (grey < clamp01((a - 50) / 25)) face.hair.color = SILVER;
  else if (grey < clamp01((a - 38) / 30)) face.hair.color = GREY;
  if (face.hairBg) face.hairBg.id = face.hair.id === "longHair" ? "longHair" : "none";
  face.glasses.id = rng() < 0.15 + clamp01((a - 40) / 30) * 0.3 ? pick(GLASSES, rng) : "none";
}

/** Full 400×600 facesjs portrait of a staff member / manager. Same inputs → byte-identical SVG. */
export function personFaceSvg(
  personId: string,
  nationality: string | undefined | null,
  clubColors: readonly (string | undefined)[] | undefined,
  options: PersonFaceOptions = {},
): string {
  const key = options.custom ? `manager-avatar:${options.custom.seed}` : `person:${personId}`;
  const rng = faceRng(key);
  const race = pickFaceRace(nationality, rng);
  const primary = clubColors?.[0] ?? NEUTRAL_COLORS[0]!;
  const teamColors = [primary, clubColors?.[1] ?? NEUTRAL_COLORS[1]!, clubColors?.[2] ?? clubColors?.[1] ?? NEUTRAL_COLORS[2]!];
  const original = Math.random;
  Math.random = rng;
  try {
    const face = generate(
      { teamColors, jersey: { id: SHIRT }, glasses: { id: "none" }, accessories: { id: "none" } },
      { gender: "male", race },
    );
    const ageRng = mulberry32(seedFrom(`face-age:${key}`));
    const age = options.age ?? 38 + Math.floor(ageRng() * 25);
    ageFace(face as unknown as AgeFace, age, ageRng);
    const custom = options.custom;
    if (custom) {
      const traits: FaceTraits = {
        ...(custom.skin ? { skin: custom.skin } : {}),
        ...(custom.hairColor ? { hairColor: custom.hairColor } : {}),
        ...(custom.hairLength ? { hairLength: custom.hairLength } : {}),
        ...(custom.beard ? { beard: custom.beard } : {}),
      };
      applyFaceTraits(face, traits, mulberry32(seedFrom(`face-traits:${key}`)));
      if (custom.glasses !== undefined) face.glasses.id = custom.glasses ? GLASSES[0] : "none";
    }
    return faceToSvgString(face);
  } finally {
    Math.random = original;
  }
}

/** Square crop (hair to collar), like the players' faces. */
export function croppedPersonFaceSvg(
  personId: string,
  nationality: string | undefined | null,
  clubColors: readonly (string | undefined)[] | undefined,
  options: PersonFaceOptions = {},
): string {
  return personFaceSvg(personId, nationality, clubColors, options)
    .replace(/viewBox="[^"]*"/, 'viewBox="-80 40 560 560"')
    .replace(/preserveAspectRatio="[^"]*"/, 'preserveAspectRatio="xMidYMin slice"')
    .replace(/ width="[^"]*"/, ' width="560"')
    .replace(/ height="[^"]*"/, ' height="560"');
}
