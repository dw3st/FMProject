import { nationalityFlagCode } from "@/Domain/world/nationalityFlag";

/** Transfermarkt spelling → the spelling the world data already uses (so one country has one name). */
const WORLD_NAME: Record<string, string> = {
  "Cote d'Ivoire": "Côte d’Ivoire",
  "The Gambia": "Gambia",
  "Korea, South": "South Korea",
  "Congo": "Congo - Brazzaville",
  "Palestine": "Palestinian Territories",
  "Bosnia-Herzegovina": "Bosnia & Herzegovina",
  "Trinidad and Tobago": "Trinidad & Tobago",
  "Turkey": "Türkiye",
  "Czech Republic": "Czechia",
  "Curacao": "Curaçao",
  "Southern Sudan": "South Sudan",
  "Sao Tome and Principe": "São Tomé & Príncipe",
};

/** World name for a Transfermarkt nationality, or `null` when the game has no flag for it. */
export function worldNationality(tm: string | null | undefined): string | null {
  const raw = tm?.trim();
  if (!raw) return null;
  const name = WORLD_NAME[raw] ?? raw;
  return nationalityFlagCode(name) ? name : null;
}
