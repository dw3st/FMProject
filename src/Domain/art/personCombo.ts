/**
 * The painted manager face (art pack, `faces/coaches/<combo>.webp`) that stands for a person the game only draws:
 * AI managers, staff and generated referees (tester report, 4.41.14). The combination is drawn from the person id
 * (same person, same face) with the skin from the nationality's region, as the generated SVG face does, and the
 * hair, beard and glasses shifting with the age.
 */
import { pickFaceRace, type FaceRace } from "@/Domain/faces/faceProfile";
import { mulberry32, seedFrom } from "@/Domain/rng";

const SKIN_OF: Record<FaceRace, readonly number[]> = { white: [1, 2], asian: [2, 3], brown: [3, 4, 5], black: [6, 7] };
const LIGHT_HAIR = ["brown", "darkBrown", "black", "blond", "red"] as const;
const DARK_HAIR = ["black", "black", "darkBrown"] as const;

function pick<T>(rng: () => number, xs: readonly T[]): T {
  return xs[Math.floor(rng() * xs.length) % xs.length]!;
}

/** `<skin>-<hair colour>-<length>-<beard>-<g|n>`, the key of the painted coach faces. */
export function personCombo(id: string, nationality?: string | null, age?: number | null): string {
  const rng = mulberry32(seedFrom(`pface:${id}`));
  const race = pickFaceRace(nationality, rng);
  const skin = pick(rng, SKIN_OF[race]);
  const years = age != null && Number.isFinite(age) ? age : 38 + Math.floor(rng() * 25);
  const greyShare = years >= 60 ? 0.75 : years >= 50 ? 0.45 : years >= 42 ? 0.15 : 0;
  const hair = rng() < greyShare ? "grey" : pick(rng, race === "white" ? LIGHT_HAIR : DARK_HAIR);
  const baldShare = years >= 55 ? 0.35 : years >= 45 ? 0.2 : 0.08;
  const r = rng();
  const length = r < baldShare ? "bald" : r < baldShare + 0.62 ? "short" : years < 42 && r > 0.94 ? "long" : "medium";
  const b = rng();
  const beard = b < 0.5 ? "none" : b < 0.8 ? "stubble" : "full";
  const glasses = rng() < (years >= 50 ? 0.4 : 0.15) ? "g" : "n";
  return `${skin}-${hair}-${length}-${beard}-${glasses}`;
}

/** Skin tone (1-7, the painted set's scale) of a player drawn from his id and nationality's region. */
export function playerSkin(id: string, nationality?: string | null): number {
  const rng = mulberry32(seedFrom(`plface:${id}`));
  return pick(rng, SKIN_OF[pickFaceRace(nationality, rng)]);
}
