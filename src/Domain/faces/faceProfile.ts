/**
 * Pure inputs for a player's generated face (`facesjs`): a seeded RNG from the player id and a
 * broad appearance mix sampled from the nationality's region. Nothing is saved — the face is
 * always derived again from the id, so the same player always looks the same.
 *
 * The regional mixes are deliberately wide (every region can produce every appearance), only
 * shifting the odds, so national squads stay varied.
 */
import { mulberry32, seedFrom } from "@/Domain/rng";

export type FaceRace = "white" | "black" | "brown" | "asian";

type Mix = Record<FaceRace, number>;

const MIXES = {
  westEurope:   { white: 0.66, black: 0.24, brown: 0.08, asian: 0.02 },
  europe:       { white: 0.86, black: 0.07, brown: 0.06, asian: 0.01 },
  latinAmerica: { white: 0.32, black: 0.2, brown: 0.46, asian: 0.02 },
  brazil:       { white: 0.34, black: 0.3, brown: 0.34, asian: 0.02 },
  africa:       { white: 0.02, black: 0.88, brown: 0.1, asian: 0 },
  northAfricaMiddleEast: { white: 0.18, black: 0.1, brown: 0.7, asian: 0.02 },
  eastAsia:     { white: 0.02, black: 0.01, brown: 0.12, asian: 0.85 },
  centralAsia:  { white: 0.35, black: 0.01, brown: 0.2, asian: 0.44 },
  anglo:        { white: 0.55, black: 0.25, brown: 0.12, asian: 0.08 },
  caribbean:    { white: 0.05, black: 0.75, brown: 0.18, asian: 0.02 },
  southAsia:    { white: 0.02, black: 0.03, brown: 0.9, asian: 0.05 },
  pacific:      { white: 0.05, black: 0.55, brown: 0.35, asian: 0.05 },
  mixed:        { white: 0.4, black: 0.25, brown: 0.25, asian: 0.1 },
} satisfies Record<string, Mix>;

type Region = keyof typeof MIXES;

const REGION_OF: Record<string, Region> = {};
const assign = (region: Region, names: string[]) => {
  for (const n of names) REGION_OF[n] = region;
};
assign("westEurope", ["England", "France", "Netherlands", "Belgium", "Germany", "Portugal", "Switzerland", "Sweden", "Wales", "Scotland", "Ireland", "Northern Ireland"]);
assign("europe", [
  "Italy", "Spain", "Russia", "Ukraine", "Belarus", "Croatia", "Serbia", "Norway", "Denmark", "Finland",
  "Iceland", "Poland", "Czechia", "Czech Republic", "Slovakia", "Slovenia", "Hungary", "Austria", "Greece",
  "Bulgaria", "Romania", "Albania", "Armenia", "Georgia", "Bosnia and Herzegovina", "Bosnia-Herzegovina",
  "Montenegro", "North Macedonia", "Kosovo", "Moldova", "Lithuania", "Latvia", "Estonia", "Luxembourg",
  "Malta", "Cyprus", "Azerbaijan", "Turkey", "Türkiye", "Israel", "Bosnia & Herzegovina",
  "Faroe Islands", "Liechtenstein", "San Marino", "Andorra",
]);
assign("brazil", ["Brazil"]);
assign("latinAmerica", [
  "Argentina", "Uruguay", "Colombia", "Chile", "Peru", "Paraguay", "Venezuela", "Ecuador", "Bolivia",
  "Mexico", "Costa Rica", "Honduras", "Panama", "Guatemala", "El Salvador", "Nicaragua",
  "Dominican Republic", "Cuba", "Puerto Rico", "Trinidad and Tobago", "Trinidad & Tobago", "Guyana",
  "Suriname",
]);
assign("caribbean", [
  "Jamaica", "Haiti", "Guadeloupe", "Martinique", "French Guiana", "Barbados", "Cayman Islands",
  "St. Lucia", "St. Kitts & Nevis", "St. Vincent & Grenadines", "Grenada", "Curaçao", "Bermuda",
  "Antigua & Barbuda",
]);
assign("africa", [
  "Nigeria", "Cameroon", "Kenya", "Ghana", "South Africa", "Senegal", "Ivory Coast", "Côte d'Ivoire",
  "Côte d’Ivoire", "Mali", "Guinea", "Guinea-Bissau", "Burkina Faso", "DR Congo", "Congo",
  "Congo - Brazzaville", "Congo - Kinshasa", "Gabon", "Zambia", "Zimbabwe", "Angola", "Uganda",
  "Tanzania", "Gambia", "Togo", "Benin", "Sierra Leone", "Liberia", "Cape Verde", "Equatorial Guinea",
  "Mozambique", "Ethiopia", "Eritrea", "Rwanda", "Burundi", "Namibia", "Botswana", "Eswatini",
  "Niger", "Chad", "Sudan", "South Sudan", "Somalia", "Central African Republic", "Madagascar",
  "Comoros", "Seychelles", "Mauritius", "Malawi", "Lesotho",
]);
assign("northAfricaMiddleEast", [
  "Algeria", "Egypt", "Morocco", "Tunisia", "Libya", "Saudi Arabia", "United Arab Emirates", "Iran",
  "Iraq", "Syria", "Lebanon", "Jordan", "Qatar", "Kuwait", "Oman", "Bahrain", "Palestine",
  "Palestinian Territories", "Yemen", "Mauritania", "Afghanistan",
]);
assign("southAsia", ["India", "Pakistan", "Bangladesh", "Sri Lanka", "Nepal"]);
assign("pacific", ["Fiji", "Solomon Islands", "Vanuatu", "Papua New Guinea", "New Caledonia", "Tahiti"]);
assign("eastAsia", [
  "Japan", "South Korea", "Korea Republic", "China", "China PR", "Indonesia", "Thailand", "Vietnam",
  "Malaysia", "Philippines", "Singapore", "North Korea",
]);
assign("centralAsia", ["Uzbekistan", "Kazakhstan", "Kyrgyzstan", "Tajikistan", "Turkmenistan"]);
assign("anglo", ["USA", "United States", "Australia", "Canada", "New Zealand"]);

export function faceRegionOf(nationality: string | undefined | null): Region {
  return (nationality && REGION_OF[nationality]) || "mixed";
}

/** Deterministic RNG for one player's face. */
export function faceRng(playerId: string): () => number {
  return mulberry32(seedFrom(`face:${playerId}`));
}

/** Draws the appearance from the nationality's regional mix with the given RNG. */
export function pickFaceRace(nationality: string | undefined | null, rng: () => number): FaceRace {
  const mix: Mix = MIXES[faceRegionOf(nationality)];
  let r = rng();
  for (const race of ["white", "black", "brown", "asian"] as const) {
    r -= mix[race];
    if (r < 0) return race;
  }
  return "white";
}
