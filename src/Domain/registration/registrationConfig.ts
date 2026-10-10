import type { RegistrationRule } from "@/types/registrationTypes";

/**
 * Registration rules (`.claude/rules/game/registration.md`): the real rules of the main competitions, simplified
 * (regulations 2024/25–2025/26, researched 2026-10), and one default per continent.
 */
export const REGISTRATION_RULES: Record<string, RegistrationRule> = {
  // Premier League: 25 over 21, at most 17 non home-grown (8 HG: 3 seasons at an English/Welsh club 15–21); U21 free.
  premier_league: { id: "premier_league", maxList: 25, free: { maxAge: 21, formedOnly: false }, minFormed: 8, foreign: "nationality" },
  // La Liga: 25; 8 trained in Spain (4 at the club); 3 non-EU (Cotonou and dual nationals count as EU); B-team U23 apart.
  la_liga: {
    id: "la_liga", maxList: 25, free: { maxAge: 21, formedOnly: true }, minFormed: 8, maxForeign: 3,
    foreign: "nonEU", exempt: ["ibero", "acp"],
  },
  // Serie A: 25 over 22; 8 trained (4 at the club); U22 free; non-EU signing quota (not modelled).
  serie_a: { id: "serie_a", maxList: 25, free: { maxAge: 21, formedOnly: false }, minFormed: 8, foreign: "nationality" },
  // Bundesliga: no squad cap; 8 locally trained (4 at the club). The 12 Germans under contract are left out.
  bundesliga: { id: "bundesliga", maxList: 30, minFormed: 8, foreign: "nationality" },
  // Ligue 1: no cap; at most 4 non-EU (Cotonou exempt).
  ligue_1: { id: "ligue_1", maxList: 30, maxForeign: 4, foreign: "nonEU", exempt: ["acp"] },
  // Brasileirão: BID registration without a limit; up to 9 foreigners named per match (XI + bench).
  brazil: { id: "brazil", maxList: null, maxForeignMatchday: 9, foreign: "nationality" },
  // Argentina: 6 foreigners on the list (5 on the pitch, not modelled).
  argentina: { id: "argentina", maxList: null, maxForeign: 6, foreign: "nationality" },
  // Saudi Pro League: 10 foreigners in the squad.
  saudi: { id: "saudi", maxList: null, maxForeign: 10, foreign: "nationality" },
  // Liga MX: up to 9 not trained in Mexico.
  mexico: { id: "mexico", maxList: null, maxForeign: 9, foreign: "nationality" },
  // MLS: 8 international slots, USA + Canada domestic; a green card holder counts as domestic (`hasGreenCard`).
  mls: { id: "mls", maxList: null, maxForeign: 8, foreign: "nationality", domestic: ["Canada"], greenCard: true },
  // Champions / Europa League: list A 25, at least 8 locally trained; list B U21 trained at the club.
  uefa: { id: "uefa", maxList: 25, free: { maxAge: 21, formedOnly: true }, minFormed: 8, foreign: "nationality" },
  // Libertadores / Sudamericana: list of up to 50, no foreign or trained limit (only the deadline).
  conmebol: { id: "conmebol", maxList: 50, foreign: "nationality" },
  // Continental defaults.
  europe: { id: "europe", maxList: 25, free: { maxAge: 21, formedOnly: true }, minFormed: 8, foreign: "nationality" },
  south_america: { id: "south_america", maxList: null, maxForeign: 6, foreign: "nationality" },
  north_america: { id: "north_america", maxList: null, maxForeign: 8, foreign: "nationality" },
  asia: { id: "asia", maxList: null, maxForeign: 8, foreign: "nationality" },
  africa: { id: "africa", maxList: null, maxForeign: 6, foreign: "nationality" },
  // A-League: 5 visa players.
  oceania: { id: "oceania", maxList: null, maxForeign: 5, foreign: "nationality" },
};

/** Country (as in `leagueData`/`countries.json`) → rule id. The whole pyramid of the country follows it. */
export const RULE_BY_COUNTRY: Record<string, string> = {
  England: "premier_league",
  Spain: "la_liga",
  Italy: "serie_a",
  Germany: "bundesliga",
  France: "ligue_1",
  Brazil: "brazil",
  Argentina: "argentina",
  "Saudi Arabia": "saudi",
  Mexico: "mexico",
  USA: "mls",
};

export const RULE_BY_CONTINENT: Record<string, string> = {
  Europe: "europe",
  "South America": "south_america",
  "North America": "north_america",
  Asia: "asia",
  Africa: "africa",
  Oceania: "oceania",
};

export const RULE_BY_CONTINENTAL: Record<string, string> = { ucl: "uefa", uel: "uefa", lib: "conmebol", sud: "conmebol" };

/** Fewer registered than this (free included) → filled with the best left, ignoring the limits (`exception`). */
export const MIN_REGISTERED = 18;
/** Minimum registered per line when the squad has them. */
export const LINE_MINIMUMS = { GK: 2, Defender: 5, Midfielder: 5, Forward: 3 } as const;
/** Nations domestic beyond the country itself (England: Wales; MLS: Canada). */
export const DOMESTIC_EXTRA: Record<string, string[]> = { England: ["Wales"], USA: ["Canada"] };
/** Days before the deadline closes when the human club is told. */
export const CLOSING_NOTICE_DAYS = 3;
/** Distinct seasons at the club up to FORMED_MAX_AGE to count as formed there. */
export const FORMED_SEASONS = 3;
export const FORMED_MAX_AGE = 21;

/**
 * Green card (MLS, `hasGreenCard`): a foreign player counts as domestic after SEASONS at his club, when he arrived
 * there aged ≤ MAX_ARRIVAL_AGE, or with the "origin" green card — a fixed draw by id (nothing stored), chance ORIGIN.
 */
export const GREEN_CARD = { SEASONS: 3, MAX_ARRIVAL_AGE: 21, ORIGIN: 0.6 } as const;
