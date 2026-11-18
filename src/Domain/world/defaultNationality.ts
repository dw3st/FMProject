// Players with no nationality in the world data (report 2026-11-18: 1524 of 36521 in the base world, a third of the
// Brasileirão C) show no flag. The registration rules already count them as domestic, so the screens give them the
// country of their club's league. Applied when a squad is read (like the name fixes), so saves in progress get it too.
import { nationalityFlagCode } from "@/Domain/world/nationalityFlag";

/** leagueData country → the spelling players use. */
const COUNTRY_SPELLING: Record<string, string> = {
  USA: "United States",
  "Czech Republic": "Czechia",
  Turkey: "Türkiye",
};

/** The nationality a player of a league in `country` gets when he has none; null when the country has no flag. */
export function leagueNationality(country: string | undefined): string | null {
  if (!country) return null;
  const n = COUNTRY_SPELLING[country] ?? country;
  return nationalityFlagCode(n) ? n : null;
}

/** The squad with every player and academy player lacking a nationality given `nationality` (same object if none). */
export function withDefaultNationality<S extends { players: { nationality?: string | null }[]; youth?: { nationality?: string | null }[] }>(
  squad: S,
  nationality: string | null,
): S {
  if (!nationality) return squad;
  const fill = <P extends { nationality?: string | null }>(list: P[]): P[] => {
    if (!list.some((p) => !p.nationality)) return list;
    return list.map((p) => (p.nationality ? p : { ...p, nationality }));
  };
  const players = fill(squad.players);
  const youth = squad.youth ? fill(squad.youth) : squad.youth;
  if (players === squad.players && youth === squad.youth) return squad;
  return { ...squad, players, ...(youth ? { youth } : {}) };
}
