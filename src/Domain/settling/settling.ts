import { normalizeNation } from "@/Domain/registration/nations";
import type { RosterPlayer, SettlingState, Squad } from "@/types/playerTypes";

/**
 * A new signing is not at home yet (`.claude/rules/game/settling.md`): his attributes play a little
 * below his level until he has played enough games for the club (friendlies included). Everybody else plays as
 * always: `settling` absent = × 1, no draw, so a squad without signings plays exactly the same.
 */
export const SETTLING = {
  /** Attributes × (1 − PENALTY) in his first game; the gap closes linearly. */
  PENALTY: 0.04,
  /** Games he needs. */
  GAMES: 15,
  /** ...with at least `COMPANIONS` team-mates who speak his language. */
  GAMES_WITH_LANGUAGE: 10,
  COMPANIONS: 2,
};

const LANGUAGES: Record<string, string[]> = {
  spanish: ["Spain", "Argentina", "Uruguay", "Chile", "Colombia", "Peru", "Paraguay", "Venezuela", "Ecuador", "Bolivia", "Mexico", "Costa Rica", "Honduras", "Panama", "Guatemala", "El Salvador", "Nicaragua", "Cuba", "Dominican Republic", "Equatorial Guinea"],
  portuguese: ["Brazil", "Portugal", "Angola", "Mozambique", "Cape Verde", "Guinea-Bissau", "São Tomé & Príncipe"],
  english: ["England", "Scotland", "Wales", "Ireland", "Northern Ireland", "United States", "Canada", "Australia", "New Zealand", "Jamaica", "Trinidad & Tobago", "South Africa", "Nigeria", "Ghana", "Kenya", "Uganda", "Zambia", "Zimbabwe", "Sierra Leone", "Liberia", "Gambia"],
  french: ["France", "Belgium", "Switzerland", "Luxembourg", "Monaco", "Côte d’Ivoire", "Senegal", "Mali", "Cameroon", "Guinea", "Burkina Faso", "Benin", "Togo", "Niger", "Gabon", "Congo - Brazzaville", "DR Congo", "Haiti", "Madagascar", "Chad"],
  german: ["Germany", "Austria", "Liechtenstein"],
  arabic: ["Saudi Arabia", "Egypt", "Morocco", "Algeria", "Tunisia", "Iraq", "Jordan", "Syria", "Lebanon", "Qatar", "United Arab Emirates", "Kuwait", "Oman", "Bahrain", "Libya", "Sudan", "Yemen", "Palestine"],
  serbocroatian: ["Serbia", "Croatia", "Bosnia & Herzegovina", "Montenegro"],
};
/** The shared language groups (a nation outside them speaks its own). */
export const LANGUAGE_GROUPS: readonly string[] = Object.keys(LANGUAGES);

const LANGUAGE_OF = new Map(Object.entries(LANGUAGES).flatMap(([lang, nations]) => nations.map((n) => [n, lang] as const)));

/** His language group; a nation outside the table is its own group. Null without a nationality. */
export function languageOf(nationality: string | null | undefined): string | null {
  const n = normalizeNation(nationality);
  return n ? (LANGUAGE_OF.get(n) ?? n) : null;
}

/** The state of a player who has just joined `players` (the club's squad, him excluded by id). */
export function newSettling(player: Pick<RosterPlayer, "id" | "nationality">, players: readonly RosterPlayer[]): SettlingState {
  const lang = languageOf(player.nationality);
  const companions = lang ? players.filter((p) => p.id !== player.id && languageOf(p.nationality) === lang).length : 0;
  return { games: 0, need: companions >= SETTLING.COMPANIONS ? SETTLING.GAMES_WITH_LANGUAGE : SETTLING.GAMES };
}

/** A player arriving at `squad`, ready to go into its list. */
export function arriving<P extends RosterPlayer>(player: P, squad: Pick<Squad, "players">): P {
  return { ...player, settling: newSettling(player, squad.players) };
}

/** Attribute multiplier: 1 when settled. */
export function settlingMult(p: Pick<RosterPlayer, "settling">): number {
  const s = p.settling;
  if (!s) return 1;
  return 1 - SETTLING.PENALTY * (1 - Math.min(1, s.games / s.need));
}

export function withSettlingExecution<S extends object>(stats: S, mult: number): S {
  if (mult === 1) return stats;
  const out: Record<string, number> = { ...(stats as unknown as Record<string, number>) };
  for (const key of Object.keys(out)) out[key] = out[key]! * mult;
  return out as unknown as S;
}

/** One more game for the club (official or friendly); the state goes away when he is settled. */
export function afterClubGame<P extends RosterPlayer>(p: P): P {
  if (!p.settling) return p;
  const games = p.settling.games + 1;
  if (games < p.settling.need) return { ...p, settling: { ...p.settling, games } };
  return settled(p);
}

/** No state at all (back from a loan, a new season). */
export function settled<P extends RosterPlayer>(p: P): P {
  if (!p.settling) return p;
  const { settling: _gone, ...rest } = p;
  return rest as P;
}

/** The lab's `Variant.newcomers`: the first `n` starters have just arrived. */
export function withNewcomers(squad: Squad, lineup: readonly string[], n: number | undefined): Squad {
  if (!n) return squad;
  const ids = new Set(lineup.filter(Boolean).slice(0, n));
  return {
    ...squad,
    players: squad.players.map((p) => (ids.has(p.id) ? { ...p, settling: { games: 0, need: SETTLING.GAMES } } : p)),
  };
}
